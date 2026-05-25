"""
/api/signals — Trading signal generation via TradingAgents multi-agent LLM.

Route order matters: specific paths (/generate, /demo, /batch, /cache, /export, /)
must be declared BEFORE parametrised paths (/{ticker}) to avoid FastAPI matching
those literals as a ticker value.
"""
import asyncio
import csv
import io
import logging
import random
import uuid
from collections import deque
from datetime import datetime, UTC
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.models.schemas import (
    TradingSignal, SignalRequest, SignalDirection, ErrorResponse,
    SignalPerformanceResponse, SignalPerformanceEntry, ClearCacheResponse,
)
from app.services.tradingagents.client import generate_signal
from app.core.rate_limits import limiter

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/signals", tags=["Signals"])

# In-memory cache — replace with Redis in production
_signal_cache: dict[str, TradingSignal] = {}

# Persistent in-memory signal store — FIFO, max 100 entries
_MAX_STORE = 100
_signal_store: deque[TradingSignal] = deque(maxlen=_MAX_STORE)

# Demo data
_DEMO_TICKERS = ["AAPL", "TSLA", "NVDA", "MSFT", "BTC", "ETH", "GOOGL", "AMZN"]
_DEMO_DIRECTIONS = [
    SignalDirection.BUY, SignalDirection.STRONG_BUY,
    SignalDirection.HOLD, SignalDirection.SELL, SignalDirection.STRONG_SELL,
]
_DEMO_REASONINGS = [
    "Strong earnings momentum with RSI breakout at 200-day MA. Institutional accumulation detected.",
    "Bearish divergence on MACD. Insider selling pressure and weak sector rotation.",
    "Consolidation phase — wait for volume confirmation before entry.",
    "Oversold RSI with positive news catalyst. Reversion trade setup looks favourable.",
    "Parabolic advance — elevated risk/reward. Partial profit-taking recommended.",
]


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _store_signal(signal: TradingSignal) -> None:
    """Append a signal to the persistent FIFO store."""
    _signal_store.append(signal)


async def _persist_signal_to_db(signal: TradingSignal) -> None:
    """Non-blocking: persist signal to SQLite. Silently skips on DB error."""
    try:
        import json
        from app.db.database import get_session
        from app.db.models import SignalRecord

        async with get_session() as session:
            record = SignalRecord(
                id=signal.id,
                ticker=signal.ticker,
                direction=signal.direction.value if hasattr(signal.direction, "value") else str(signal.direction),
                confidence=signal.confidence,
                reasoning=signal.reasoning,
                source=signal.source,
                generated_at=signal.generated_at,
                agents_consensus=json.dumps(signal.agents_consensus) if signal.agents_consensus else None,
                price_target=signal.price_target,
                stop_loss=signal.stop_loss,
                time_horizon=signal.time_horizon,
            )
            session.add(record)
            await session.commit()
    except Exception as db_err:
        logger.debug("signal_db_persist_skipped reason=%s", str(db_err))


def _fire_webhook(event: str, payload: dict) -> None:
    """Dispatch outbound webhook event — best-effort, non-blocking."""
    try:
        from app.services.webhooks.client import get_webhook_manager
        loop = asyncio.get_event_loop()
        loop.create_task(get_webhook_manager().dispatch(event, payload))
    except Exception:
        pass  # Never block signal generation on webhook failure


def _make_demo_signal(ticker: str, source_prefix: str = "Demo[mock]") -> TradingSignal:
    """Build a deterministic demo signal for a ticker."""
    resolved = ticker.upper().strip()
    rng = random.Random(resolved + datetime.now(UTC).strftime("%Y-%m-%d"))
    direction = rng.choice(_DEMO_DIRECTIONS)
    confidence = round(rng.uniform(0.55, 0.92), 2)
    reasoning = rng.choice(_DEMO_REASONINGS)
    base_price = rng.uniform(80, 450)

    if direction in (SignalDirection.BUY, SignalDirection.STRONG_BUY):
        price_target = round(base_price * rng.uniform(1.05, 1.18), 2)
        stop_loss = round(base_price * rng.uniform(0.92, 0.97), 2)
    elif direction in (SignalDirection.SELL, SignalDirection.STRONG_SELL):
        price_target = round(base_price * rng.uniform(0.82, 0.95), 2)
        stop_loss = round(base_price * rng.uniform(1.03, 1.08), 2)
    else:
        price_target = None
        stop_loss = None

    return TradingSignal(
        id=str(uuid.uuid4()),
        ticker=resolved,
        direction=direction,
        confidence=confidence,
        price_target=price_target,
        stop_loss=stop_loss,
        time_horizon=rng.choice(["1d", "1w", "2w", "1m"]),
        reasoning=reasoning,
        source=source_prefix,
        generated_at=datetime.now(UTC),
        agents_consensus={
            "fundamentals": rng.choice(["Bullish — strong FCF growth", "Neutral — mixed signals", "Bearish — declining margins"]),
            "sentiment":    rng.choice(["Positive news flow", "Mixed media coverage", "Negative social sentiment"]),
            "technicals":   rng.choice(["RSI breakout above 200-DMA", "Consolidation — no clear trend", "Death cross forming"]),
            "news":         rng.choice(["Positive earnings surprise", "No major catalysts", "Regulatory headwind"]),
            "risk":         rng.choice(["Low VaR, proceed", "Moderate risk, size down", "High volatility — stand aside"]),
        },
    )


# ---------------------------------------------------------------------------
# Pydantic request model for batch endpoint
# ---------------------------------------------------------------------------

class BatchSignalRequest(BaseModel):
    tickers: list[str] = Field(..., description="List of ticker symbols (max 10)")
    fast_mode: bool = Field(True, description="Use fast demo mode (always true for batch)")


# ---------------------------------------------------------------------------
# Routes — specific paths first, then parametric
# ---------------------------------------------------------------------------

@router.post(
    "/generate",
    response_model=TradingSignal,
    summary="Generate AI trading signal for a ticker",
    responses={422: {"model": ErrorResponse}, 429: {"description": "Rate limit exceeded"}, 500: {"model": ErrorResponse}},
)
@limiter.limit("5/minute")
async def generate_trading_signal(request: Request, req: SignalRequest) -> TradingSignal:
    """
    Run TradingAgents multi-agent pipeline to produce a buy/sell/hold signal.

    - Uses Claude Sonnet (deep analysis) by default
    - Set `fast_mode=true` to use Claude Haiku for quick turnaround
    - Results are cached per ticker+date to avoid redundant API calls
    - Falls back to a neutral HOLD placeholder if TradingAgents repo or API
      key is unavailable, rather than raising a hard 500 error
    """
    cache_key = f"{req.ticker.upper()}:{req.analysis_date}:{req.fast_mode}"
    if cache_key in _signal_cache:
        logger.info("Cache hit for signal %s", cache_key)
        return _signal_cache[cache_key]

    try:
        signal = await generate_signal(
            ticker=req.ticker,
            analysis_date=req.analysis_date,
            fast_mode=req.fast_mode,
        )
        _signal_cache[cache_key] = signal
        _store_signal(signal)
        await _persist_signal_to_db(signal)
        _fire_webhook("signal.generated", {
            "id": signal.id,
            "ticker": signal.ticker,
            "direction": signal.direction.value if hasattr(signal.direction, "value") else str(signal.direction),
            "confidence": signal.confidence,
            "source": signal.source,
        })
        return signal
    except FileNotFoundError as e:
        logger.warning("TradingAgents repo not found: %s", e)
        return TradingSignal(
            id=str(uuid.uuid4()),
            ticker=req.ticker.upper(),
            direction=SignalDirection.HOLD,
            confidence=0.0,
            reasoning="TradingAgents repository not found. Clone TauricResearch/TradingAgents and set TRADINGAGENTS_PATH.",
            source="TradingAgents[missing_repo]",
            generated_at=datetime.now(UTC),
        )
    except PermissionError as e:
        logger.warning("API key missing or invalid: %s", e)
        return TradingSignal(
            id=str(uuid.uuid4()),
            ticker=req.ticker.upper(),
            direction=SignalDirection.HOLD,
            confidence=0.0,
            reasoning="Anthropic API key not configured. Set ANTHROPIC_API_KEY and restart.",
            source="TradingAgents[no_api_key]",
            generated_at=datetime.now(UTC),
        )
    except Exception as e:
        logger.error("Signal generation failed: %s", e)
        error_msg = str(e)
        is_api_key_error = any(
            kw in error_msg.lower()
            for kw in ("api key", "authentication", "401", "403", "unauthorized")
        )
        if is_api_key_error:
            return TradingSignal(
                id=str(uuid.uuid4()),
                ticker=req.ticker.upper(),
                direction=SignalDirection.HOLD,
                confidence=0.0,
                reasoning="API key invalid or missing. Use /api/signals/demo for key-free testing.",
                source="TradingAgents[auth_error]",
                generated_at=datetime.now(UTC),
            )
        raise HTTPException(status_code=500, detail=error_msg)


@router.post(
    "/demo",
    response_model=TradingSignal,
    summary="Generate a mock trading signal (no API key required)",
    responses={422: {"model": ErrorResponse}},
)
async def generate_demo_signal(ticker: Optional[str] = None) -> TradingSignal:
    """
    Returns a realistic mock trading signal without calling any external API.

    Intended for:
    - UI development and testing without a configured API key
    - Onboarding / demo environments
    - Frontend smoke-tests in CI

    The signal is deterministically seeded from the ticker name so repeated
    calls for the same ticker return the same direction (stable for tests).
    """
    resolved_ticker = (ticker or random.choice(_DEMO_TICKERS)).upper()
    signal = _make_demo_signal(resolved_ticker, source_prefix="Demo[mock]")

    # Cache it so GET /signals/{ticker} can find it
    _signal_cache[f"{resolved_ticker}:demo:False"] = signal

    # Persist to FIFO store and DB
    _store_signal(signal)
    await _persist_signal_to_db(signal)

    # Fire outbound webhook event
    _fire_webhook("signal.generated", {
        "id": signal.id,
        "ticker": signal.ticker,
        "direction": signal.direction.value if hasattr(signal.direction, "value") else str(signal.direction),
        "confidence": signal.confidence,
        "source": signal.source,
    })

    logger.info("Demo signal generated for %s -> %s (%.0f%%)", resolved_ticker, signal.direction.value, signal.confidence * 100)
    return signal


@router.post(
    "/batch",
    response_model=list[TradingSignal],
    summary="Generate demo signals for multiple tickers in parallel",
    responses={422: {"model": ErrorResponse}},
)
async def batch_generate_signals(req: BatchSignalRequest) -> list[TradingSignal]:
    """
    POST /api/signals/batch

    Generate demo trading signals for up to 10 tickers in parallel using
    asyncio.gather. All signals are persisted to the in-memory store and SQLite.

    Request body:
    ```json
    {"tickers": ["AAPL", "MSFT", "NVDA"], "fast_mode": true}
    ```

    Returns a list of TradingSignal objects, one per ticker.
    Returns 422 if more than 10 tickers are requested.
    """
    if len(req.tickers) > 10:
        raise HTTPException(
            status_code=422,
            detail=f"Maximum 10 tickers per batch request, got {len(req.tickers)}.",
        )
    if not req.tickers:
        return []

    async def _gen_one(ticker: str) -> TradingSignal:
        signal = _make_demo_signal(ticker, source_prefix="Batch[demo]")
        _store_signal(signal)
        await _persist_signal_to_db(signal)
        return signal

    results: list[TradingSignal] = list(
        await asyncio.gather(*[_gen_one(t) for t in req.tickers])
    )
    logger.info("Batch signals generated for %d tickers", len(results))
    return results


@router.get(
    "/export",
    summary="Export signals as CSV",
    responses={200: {"content": {"text/csv": {}}}},
)
async def export_signals() -> StreamingResponse:
    """
    Return all stored signals as a CSV file download.
    Reads from SQLite (preferred) or in-memory FIFO store as fallback.
    """
    output = io.StringIO()
    fieldnames = [
        "id", "ticker", "direction", "confidence",
        "price_target", "stop_loss", "time_horizon",
        "source", "generated_at", "reasoning",
    ]
    writer = csv.DictWriter(output, fieldnames=fieldnames, extrasaction="ignore")
    writer.writeheader()

    db_signals: list = []
    try:
        from sqlalchemy import select, desc
        from app.db.database import get_session
        from app.db.models import SignalRecord

        async with get_session() as session:
            result = await session.execute(
                select(SignalRecord).order_by(desc(SignalRecord.generated_at))
            )
            db_signals = list(result.scalars().all())
    except Exception:
        pass

    if db_signals:
        for row in db_signals:
            writer.writerow({
                "id": row.id,
                "ticker": row.ticker,
                "direction": row.direction,
                "confidence": row.confidence,
                "price_target": row.price_target or "",
                "stop_loss": row.stop_loss or "",
                "time_horizon": row.time_horizon or "",
                "source": row.source,
                "generated_at": row.generated_at.isoformat(),
                "reasoning": (row.reasoning or "").replace("\n", " "),
            })
    else:
        for signal in sorted(_signal_store, key=lambda s: s.generated_at, reverse=True):
            writer.writerow({
                "id": signal.id,
                "ticker": signal.ticker,
                "direction": signal.direction.value if hasattr(signal.direction, "value") else str(signal.direction),
                "confidence": signal.confidence,
                "price_target": signal.price_target or "",
                "stop_loss": signal.stop_loss or "",
                "time_horizon": signal.time_horizon or "",
                "source": signal.source,
                "generated_at": signal.generated_at.isoformat(),
                "reasoning": (signal.reasoning or "").replace("\n", " "),
            })

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=signals.csv"},
    )


@router.get(
    "/",
    response_model=list[TradingSignal],
    summary="List stored signals with optional filters",
)
async def list_signals(
    limit: int = 20,
    offset: int = 0,
    ticker: Optional[str] = None,
    direction: Optional[str] = None,
) -> list[TradingSignal]:
    """
    Return signals from SQLite (preferred) or the in-memory FIFO store.
    Sorted newest first.

    Query params:
    - ticker    — filter by ticker symbol (case-insensitive), e.g. ?ticker=AAPL
    - direction — filter by direction (BUY, SELL, HOLD, STRONG_BUY, STRONG_SELL)
    - limit     — max results (default 20)
    - offset    — pagination offset (default 0)
    """
    ticker_upper    = ticker.upper().strip()    if ticker    else None
    direction_upper = direction.upper().strip() if direction else None

    try:
        from sqlalchemy import select, desc
        from app.db.database import get_session
        from app.db.models import SignalRecord

        async with get_session() as session:
            q = select(SignalRecord).order_by(desc(SignalRecord.generated_at))
            if ticker_upper:
                q = q.where(SignalRecord.ticker == ticker_upper)
            if direction_upper:
                q = q.where(SignalRecord.direction == direction_upper)
            q = q.offset(offset).limit(limit)

            result = await session.execute(q)
            rows = result.scalars().all()

        if rows:
            out = []
            for row in rows:
                out.append(TradingSignal(
                    id=row.id,
                    ticker=row.ticker,
                    direction=SignalDirection(row.direction),
                    confidence=row.confidence,
                    reasoning=row.reasoning,
                    source=row.source,
                    generated_at=row.generated_at,
                    agents_consensus=row.agents_consensus_as_dict() or None,
                    price_target=row.price_target,
                    stop_loss=row.stop_loss,
                    time_horizon=row.time_horizon,
                ))
            return out
    except Exception as db_err:
        logger.debug("signals_db_read_fallback reason=%s", str(db_err))

    # Fallback: in-memory store
    signals = list(_signal_store) if _signal_store else list(_signal_cache.values())
    signals = sorted(signals, key=lambda s: s.generated_at, reverse=True)

    if ticker_upper:
        signals = [s for s in signals if s.ticker == ticker_upper]
    if direction_upper:
        signals = [
            s for s in signals
            if (s.direction.value if hasattr(s.direction, "value") else str(s.direction)).upper() == direction_upper
        ]

    return signals[offset: offset + limit]


@router.get(
    "/trending",
    summary="Top tickers by signal count in the last 24 hours",
)
async def get_trending_tickers(limit: int = 10) -> list[dict]:
    """
    GET /api/signals/trending?limit=10

    Returns the most-analyzed tickers from the last 24 hours,
    with their dominant direction and signal count.
    """
    from datetime import timedelta
    from sqlalchemy import select, func, desc
    from app.db.database import get_session
    from app.db.models import SignalRecord

    cutoff = datetime.now(UTC) - timedelta(hours=24)
    try:
        async with get_session() as session:
            result = await session.execute(
                select(
                    SignalRecord.ticker,
                    func.count(SignalRecord.id).label("count"),
                    func.avg(SignalRecord.confidence).label("avg_conf"),
                )
                .where(SignalRecord.generated_at >= cutoff)
                .group_by(SignalRecord.ticker)
                .order_by(desc("count"))
                .limit(limit)
            )
            rows = result.all()

        if not rows:
            return [
                {"ticker": t, "count": 1, "avg_confidence": 0.72, "trending": True}
                for t in ["AAPL", "TSLA", "NVDA", "BTC-USD", "ETH-USD"][:limit]
            ]

        return [
            {
                "ticker": row.ticker,
                "count": row.count,
                "avg_confidence": round(float(row.avg_conf or 0), 4),
                "trending": row.count >= 2,
            }
            for row in rows
        ]
    except Exception:
        return []


@router.get(
    "/performance",
    summary="Signal performance tracking — avg return, win rate, best/worst",
    response_model=SignalPerformanceResponse,
)
async def get_signal_performance() -> SignalPerformanceResponse:
    """
    GET /api/signals/performance

    Aggregates SignalPerformance records (evaluated daily).
    """
    _empty = SignalPerformanceResponse(
        avg_return=0.0,
        win_rate=0.0,
        best_signal=None,
        worst_signal=None,
        total_evaluated=0,
    )
    try:
        from sqlalchemy import select
        from app.db.database import get_session
        from app.db.models import SignalPerformance

        async with get_session() as session:
            result = await session.execute(select(SignalPerformance))
            rows = result.scalars().all()

        if not rows:
            return _empty

        returns = [r.return_pct for r in rows]
        avg_return = round(sum(returns) / len(returns), 4)
        win_rate = round(sum(1 for r in returns if r > 0) / len(returns), 4)

        best = max(rows, key=lambda r: r.return_pct)
        worst = min(rows, key=lambda r: r.return_pct)

        return SignalPerformanceResponse(
            avg_return=avg_return,
            win_rate=win_rate,
            best_signal=SignalPerformanceEntry(
                signal_id=best.signal_id,
                ticker=best.ticker,
                direction=best.direction,
                return_pct=round(best.return_pct, 4),
            ),
            worst_signal=SignalPerformanceEntry(
                signal_id=worst.signal_id,
                ticker=worst.ticker,
                direction=worst.direction,
                return_pct=round(worst.return_pct, 4),
            ),
            total_evaluated=len(rows),
        )
    except Exception as exc:
        logger.error("signal_performance_error: %s", exc)
        return _empty


@router.delete(
    "/cache",
    response_model=ClearCacheResponse,
    summary="Clear signal cache",
)
async def clear_cache() -> ClearCacheResponse:
    """Clear the in-memory signal cache."""
    count = len(_signal_cache)
    _signal_cache.clear()
    return ClearCacheResponse(cleared=count, message=f"Cleared {count} cached signals")


@router.get(
    "/{ticker}",
    response_model=Optional[TradingSignal],
    summary="Get latest cached signal for a ticker",
)
async def get_signal(ticker: str) -> Optional[TradingSignal]:
    """
    Return the most recently generated signal for a ticker from cache.
    Returns null if no signal has been generated yet.
    """
    ticker = ticker.upper()
    matches = {k: v for k, v in _signal_cache.items() if v.ticker == ticker}
    if not matches:
        return None
    return max(matches.values(), key=lambda s: s.generated_at)
