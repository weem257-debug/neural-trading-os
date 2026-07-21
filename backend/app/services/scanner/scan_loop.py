"""
Scan-loop orchestration for the 24/7 market scanner (ADR 0003).

One ``run_scan_cycle`` does, in order:
  1. Elect a single runner via a Postgres advisory lock (skip cycle if another
     replica already holds it).
  2. Resolve the symbols in scope right now (equities only in market hours,
     crypto always).
  3. Stage 1 — free technical prefilter -> ranked candidates.
  4. For each candidate, in score order:
       a. Dedup: skip if a scanner signal for the same symbol already exists
          inside the rolling dedup window.
       b. Cap gate: ``can_spend(estimate)`` — if it would breach the daily hard
          cap, STOP the cycle immediately (no partial overspend).
       c. Stage 2 — paid Sonnet deep analysis.
       d. Record the ACTUAL cost to the ledger.
       e. Persist the resulting signal.
       f. Fan the signal out to watching users via Telegram (respecting
          quiet-hours), unless delivery is disabled.

The cap gate sits BEFORE every paid call, so the loop can never spend past the
cap by more than one in-flight call — and if the estimate already won't fit, it
spends nothing further.
"""
import logging
from datetime import datetime, timedelta, UTC
from typing import Optional

from sqlalchemy import select

from app.core.config import settings
from app.db.database import get_session
from app.db.models import SignalRecord
from app.services.scanner.single_runner import try_acquire_scan_lock
from app.services.scanner.universe import scan_symbols, SCANNER_UNIVERSE
from app.services.scanner.prefilter import run_prefilter
from app.services.scanner.deep_analysis import deep_analyze, estimate_call_cost
from app.services.scanner.cost_guard import can_spend, record_spend
from app.services.scanner.delivery import deliver_signal

logger = logging.getLogger(__name__)

# Signals the scanner writes carry this source prefix (used for dedup + attribution).
SCAN_SOURCE = "scanner"


async def _recent_symbols(window_hours: int) -> set[str]:
    """Symbols that already got a scanner signal within the dedup window."""
    since = datetime.now(UTC) - timedelta(hours=window_hours)
    async with get_session() as session:
        result = await session.execute(
            select(SignalRecord.ticker)
            .where(SignalRecord.source.like(f"{SCAN_SOURCE}%"))
            .where(SignalRecord.generated_at >= since)
        )
        return {row[0] for row in result.all()}


async def _persist_signal(candidate, result: dict) -> SignalRecord:
    """Persist one scanner signal and return the stored row."""
    import uuid
    import json as _json

    record = SignalRecord(
        id=str(uuid.uuid4()),
        ticker=candidate.symbol,
        direction=result["direction"],
        confidence=float(result.get("confidence", 0.5)),
        reasoning=result.get("reasoning", ""),
        source=f"{SCAN_SOURCE}:{result.get('model', 'sonnet')}",
        generated_at=datetime.now(UTC),
        agents_consensus=_json.dumps(
            {"prefilter_score": candidate.score, "prefilter_reasons": candidate.reasons}
        ),
        user_id=None,  # global scanner signal; delivery matches per-user watchlists
        price_target=result.get("price_target"),
        stop_loss=result.get("stop_loss"),
        time_horizon=result.get("time_horizon"),
    )
    async with get_session() as session:
        session.add(record)
        await session.commit()
    return record


async def run_scan_cycle(
    *,
    now: Optional[datetime] = None,
    top_n: Optional[int] = None,
    deliver: bool = True,
) -> dict:
    """
    Run a single scan cycle. Returns a summary dict describing what happened.

    ``now`` overrides the clock (tests). ``top_n`` overrides the per-cycle
    candidate budget. ``deliver=False`` skips the Telegram fanout (dry runs).
    """
    now = now or datetime.now(UTC)
    top_n = top_n if top_n is not None else settings.SCAN_TOP_N

    summary = {
        "status": "ok",
        "candidates": 0,
        "analyzed": 0,
        "skipped_duplicate": 0,
        "delivered": 0,
        "cap_reached": False,
        "signals": [],
    }

    # 1. Single-runner election. Hold the lock session open for the whole cycle.
    async with get_session() as lock_session:
        if not await try_acquire_scan_lock(lock_session):
            summary["status"] = "skipped_locked"
            logger.info("scan_cycle_skipped_locked")
            return summary

        # 2. Symbols in scope.
        symbols = scan_symbols(now)
        logger.info("scan_cycle_start", extra={"symbols": len(symbols)})

        # 3. Stage 1 — free prefilter.
        candidates = await run_prefilter(symbols, top_n=top_n)
        summary["candidates"] = len(candidates)

        recent = await _recent_symbols(settings.SCAN_DEDUP_WINDOW_HOURS)

        # 4. Per-candidate: dedup -> cap gate -> Sonnet -> record -> persist -> deliver.
        for candidate in candidates:
            if candidate.symbol in recent:
                summary["skipped_duplicate"] += 1
                continue

            estimate = estimate_call_cost()
            if not await can_spend(estimate):
                summary["cap_reached"] = True
                logger.warning("scan_cycle_cap_reached", extra={"symbol": candidate.symbol})
                break

            result, usage = await deep_analyze(candidate)
            # Record the ACTUAL cost regardless of parse success — tokens were spent.
            await record_spend(candidate.symbol, result["model"] if result else settings.ANTHROPIC_MODEL_ANALYSIS, usage)

            if result is None:
                continue

            signal = await _persist_signal(candidate, result)
            recent.add(candidate.symbol)
            summary["analyzed"] += 1
            summary["signals"].append({
                "ticker": signal.ticker,
                "direction": signal.direction,
                "confidence": signal.confidence,
            })

            if deliver:
                try:
                    sent = await deliver_signal(signal, now=now)
                    summary["delivered"] += sent
                except Exception as e:
                    logger.warning("scan_cycle_delivery_failed", extra={"symbol": candidate.symbol, "reason": str(e)})

    logger.info("scan_cycle_complete", extra=summary)
    return summary


async def scanner_loop() -> None:
    """
    Long-running background task: run a scan cycle every ``SCAN_INTERVAL_SECONDS``.

    Only starts spending when ``SCANNER_ENABLED`` and an Anthropic key are set;
    otherwise it idles. Errors in one cycle never kill the loop.
    """
    import asyncio

    logger.info("scanner_loop_started", extra={"universe": len(SCANNER_UNIVERSE)})
    while True:
        try:
            if not settings.SCANNER_ENABLED:
                await asyncio.sleep(settings.SCAN_INTERVAL_SECONDS)
                continue
            if not settings.ANTHROPIC_API_KEY or settings.ANTHROPIC_API_KEY.startswith("your-"):
                logger.info("scanner_loop_skipped_no_api_key")
                await asyncio.sleep(settings.SCAN_INTERVAL_SECONDS)
                continue
            await run_scan_cycle()
        except Exception as e:
            logger.error("scanner_loop_cycle_error", extra={"reason": str(e)})
        await asyncio.sleep(settings.SCAN_INTERVAL_SECONDS)
