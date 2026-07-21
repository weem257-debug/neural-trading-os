"""
Hard daily-spend cap for the 24/7 market scanner (ADR 0003) — money-critical.

Two entry points:
  can_spend(estimated_next_usd) : pre-call gate. Returns True only if today's
      recorded spend PLUS the estimate stays within SCAN_DAILY_CAP_USD. Fails
      CLOSED — any error (DB unreachable, etc.) returns False so the scanner
      never spends blind.
  record_spend(symbol, model, usage) : post-call ledger write. Writes one
      immutable ScanCostEntry and atomically increments the ScanCostDaily
      aggregate (``spent_usd = spent_usd + delta``) so concurrent writers can
      never lose an increment.

The two together guarantee the daily USD spend cannot exceed the cap by more
than a single in-flight call's actual cost.
"""
import logging
from datetime import datetime, UTC

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError

from app.core.config import settings
from app.db.database import get_session
from app.db.models import ScanCostDaily, ScanCostEntry
from app.services.scanner.cost import cost_of_usage

logger = logging.getLogger(__name__)

# Fractions of the cap at which a warning is emitted (50/75/90/100%).
_ALERT_THRESHOLDS: tuple[float, ...] = (0.5, 0.75, 0.9, 1.0)


def _today_utc() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%d")


async def can_spend(estimated_next_usd: float) -> bool:
    """
    Pre-call gate: True only if today's recorded spend plus
    ``estimated_next_usd`` stays within ``SCAN_DAILY_CAP_USD``.

    Fails CLOSED — if the spend cannot be read for any reason, returns False.
    The boundary is inclusive: spend exactly equal to the cap is allowed;
    only a spend that would strictly exceed it is blocked.
    """
    today = _today_utc()
    try:
        async with get_session() as session:
            result = await session.execute(
                select(ScanCostDaily.spent_usd).where(ScanCostDaily.date_utc == today)
            )
            prev_spent = result.scalar()
    except Exception:
        logger.error("scan_cost_can_spend_query_failed", exc_info=True)
        return False

    prev_spent = float(prev_spent) if prev_spent is not None else 0.0
    cap = float(settings.SCAN_DAILY_CAP_USD)
    if prev_spent + estimated_next_usd > cap:
        logger.warning(
            "scan_cost_cap_would_be_exceeded",
            extra={
                "spent_usd": prev_spent,
                "estimated_next_usd": estimated_next_usd,
                "cap_usd": cap,
            },
        )
        return False
    return True


def _check_thresholds(prev_spent: float, new_spent: float, cap: float) -> None:
    """Log a warning whenever this spend crossed a 50/75/90/100% cap threshold."""
    if cap <= 0:
        return
    for threshold in _ALERT_THRESHOLDS:
        boundary = threshold * cap
        if prev_spent < boundary <= new_spent:
            logger.warning(
                "scan_cost_threshold_alert",
                extra={
                    "threshold_pct": int(threshold * 100),
                    "spent_usd": new_spent,
                    "cap_usd": cap,
                },
            )


async def record_spend(symbol: str, model: str, usage: dict) -> dict:
    """
    Record the ACTUAL cost of one completed LLM analysis call.

    ``usage`` is expected to carry (any subset; defaults to 0):
    input_tokens, output_tokens, cache_read_tokens, cache_write_tokens.

    Writes an immutable ledger entry and atomically bumps the daily aggregate.
    Returns a summary dict {symbol, model, cost_usd, spent_usd, date_utc}.
    """
    input_tokens = int(usage.get("input_tokens", 0))
    output_tokens = int(usage.get("output_tokens", 0))
    cache_read_tokens = int(usage.get("cache_read_tokens", 0))
    cache_write_tokens = int(usage.get("cache_write_tokens", 0))
    cost = cost_of_usage(
        model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens
    )
    today = _today_utc()

    async with get_session() as session:
        session.add(
            ScanCostEntry(
                symbol=symbol,
                model=model,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                cache_read_tokens=cache_read_tokens,
                cache_write_tokens=cache_write_tokens,
                cost_usd=cost,
            )
        )

        prev_result = await session.execute(
            select(ScanCostDaily.spent_usd).where(ScanCostDaily.date_utc == today)
        )
        prev = prev_result.scalar()
        prev_spent = float(prev) if prev is not None else 0.0

        # Atomic increment — never read-modify-write in Python.
        upd = await session.execute(
            update(ScanCostDaily)
            .where(ScanCostDaily.date_utc == today)
            .values(
                spent_usd=ScanCostDaily.spent_usd + cost,
                analyses_count=ScanCostDaily.analyses_count + 1,
            )
        )
        if upd.rowcount == 0:
            # First call of the day: insert. begin_nested guards the race where
            # a concurrent writer inserted the same-day row first.
            try:
                async with session.begin_nested():
                    session.add(
                        ScanCostDaily(date_utc=today, spent_usd=cost, analyses_count=1)
                    )
            except IntegrityError:
                await session.execute(
                    update(ScanCostDaily)
                    .where(ScanCostDaily.date_utc == today)
                    .values(
                        spent_usd=ScanCostDaily.spent_usd + cost,
                        analyses_count=ScanCostDaily.analyses_count + 1,
                    )
                )

        await session.commit()

    new_spent = prev_spent + cost
    _check_thresholds(prev_spent, new_spent, float(settings.SCAN_DAILY_CAP_USD))
    return {
        "symbol": symbol,
        "model": model,
        "cost_usd": cost,
        "spent_usd": new_spent,
        "date_utc": today,
    }
