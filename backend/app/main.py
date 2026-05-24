"""
Trading Dashboard — FastAPI Application Entry Point
----------------------------------------------------
Central orchestrator API for all 9 trading repos.

Architecture:
  REST  → analysis, backtesting, signal generation
  WS    → live prices, portfolio updates, alerts, new signals

Run with:
  uvicorn app.main:app --reload --port 8000
"""
import asyncio
import os
import time
from contextlib import asynccontextmanager

import structlog
from structlog.stdlib import LoggerFactory

from fastapi import FastAPI, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import settings, jwt_key_is_secure
from app.core.rate_limits import limiter
from app.api.routes import health, signals, portfolio, sentiment, backtest, execution, risk, alerts, webhooks, analysis, waitlist, portfolio_mgmt, p2p, fints_routes, learning
from app.api import auth
from app.websocket.manager import ws_manager

# ---------------------------------------------------------------------------
# Structured Logging — JSON in production, pretty-console in development
# ---------------------------------------------------------------------------
_is_development = os.getenv("ENVIRONMENT", "development").lower() == "development"

_shared_processors = [
    structlog.contextvars.merge_contextvars,
    structlog.stdlib.add_logger_name,
    structlog.stdlib.add_log_level,
    structlog.processors.TimeStamper(fmt="iso"),
    structlog.processors.StackInfoRenderer(),
]

if _is_development:
    structlog.configure(
        processors=[
            *_shared_processors,  # type: ignore[list-item]
            structlog.dev.ConsoleRenderer(colors=True),
        ],
        wrapper_class=structlog.stdlib.BoundLogger,
        logger_factory=LoggerFactory(),
        cache_logger_on_first_use=True,
    )
else:
    structlog.configure(
        processors=[
            *_shared_processors,  # type: ignore[list-item]
            structlog.processors.dict_tracebacks,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.stdlib.BoundLogger,
        logger_factory=LoggerFactory(),
        cache_logger_on_first_use=True,
    )

logger: structlog.stdlib.BoundLogger = structlog.get_logger(__name__)


# ---------------------------------------------------------------------------
# RequestCounterMiddleware — counts requests & measures response time
# ---------------------------------------------------------------------------

class RequestCounterMiddleware(BaseHTTPMiddleware):
    """
    Lightweight middleware that:
    1. Increments a global request counter for every HTTP call.
    2. Measures wall-clock response time and accumulates it for avg computation.

    Uses the module-level helpers in app.api.routes.health to avoid circular
    imports at startup.
    """

    async def dispatch(self, request: Request, call_next):
        start = time.monotonic()
        response = await call_next(request)
        duration_ms = (time.monotonic() - start) * 1000
        try:
            from app.api.routes.health import record_request
            record_request(duration_ms)
        except Exception:
            pass   # Never crash the request over metrics
        return response


# Default watchlist for live price streaming — covers common user additions beyond the demo portfolio
_PRICE_WATCHLIST = [
    "AAPL", "MSFT", "NVDA", "TSLA", "BTC-USD",
    "AMZN", "GOOGL", "META", "AMD", "NFLX",
]


async def _signal_performance_loop() -> None:
    """
    Background task: runs daily at midnight UTC.
    Fetches signals from the last 7 days, computes current return vs entry price,
    and persists results in SignalPerformance table.
    """
    import math
    from datetime import timedelta

    while True:
        # Sleep until next midnight UTC
        now = __import__("datetime").datetime.now(__import__("datetime").timezone.utc)
        tomorrow = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
        sleep_secs = (tomorrow - now).total_seconds()
        logger.info("signal_performance_loop_sleeping", seconds=int(sleep_secs))
        await asyncio.sleep(sleep_secs)

        try:
            from app.db.database import get_session
            from app.db.models import SignalRecord, SignalPerformance
            from sqlalchemy import select, and_
            from datetime import datetime, timezone, timedelta as _timedelta
            import yfinance as yf

            cutoff = datetime.now(timezone.utc) - _timedelta(days=7)

            async with get_session() as session:
                result = await session.execute(
                    select(SignalRecord).where(SignalRecord.generated_at >= cutoff)
                )
                signals = result.scalars().all()

            logger.info("signal_performance_evaluating", count=len(signals))

            for sig in signals:
                try:
                    def _fetch_hist(ticker: str):
                        return yf.Ticker(ticker).history(period="1d")

                    hist = await asyncio.to_thread(_fetch_hist, sig.ticker)
                    if hist.empty:
                        continue
                    current_price = float(hist["Close"].iloc[-1])

                    # Entry price: close on the day the signal was generated
                    gen_date = sig.generated_at.strftime("%Y-%m-%d") if hasattr(sig.generated_at, "strftime") else str(sig.generated_at)[:10]
                    def _fetch_entry(ticker: str, start: str):
                        import yfinance as _yf
                        from datetime import datetime as _dt, timedelta as _td
                        end = (_dt.strptime(start, "%Y-%m-%d") + _td(days=2)).strftime("%Y-%m-%d")
                        return _yf.Ticker(ticker).history(start=start, end=end)
                    entry_hist = await asyncio.to_thread(_fetch_entry, sig.ticker, gen_date)
                    if not entry_hist.empty:
                        entry_price = float(entry_hist["Close"].iloc[0])
                    else:
                        entry_price = current_price  # fallback: no gain/loss if no data

                    direction = (sig.direction or "HOLD").upper()
                    if direction in ("BUY", "STRONG_BUY"):
                        return_pct = (current_price - entry_price) / entry_price if entry_price else 0.0
                    elif direction in ("SELL", "STRONG_SELL"):
                        return_pct = (entry_price - current_price) / entry_price if entry_price else 0.0
                    else:
                        return_pct = 0.0

                    if math.isnan(return_pct) or math.isinf(return_pct):
                        return_pct = 0.0

                    async with get_session() as session:
                        perf = SignalPerformance(
                            signal_id=sig.id,
                            ticker=sig.ticker,
                            direction=direction,
                            entry_price=round(entry_price, 4),
                            current_price=round(current_price, 4),
                            return_pct=round(return_pct, 6),
                            evaluated_at=datetime.now(timezone.utc),
                        )
                        session.add(perf)
                        await session.commit()

                except Exception as sig_err:
                    logger.warning("signal_performance_skip", signal_id=sig.id, reason=str(sig_err))

            logger.info("signal_performance_complete")

        except Exception as loop_err:
            logger.error("signal_performance_loop_error", reason=str(loop_err))


async def _p2p_snapshot_loop() -> None:
    """
    Background task: save P2P snapshots once per day at 02:00 UTC.
    Skips if no credentials are configured (demo data would just duplicate).
    """
    import os
    from datetime import datetime, timedelta, timezone

    while True:
        now = datetime.now(timezone.utc)
        next_run = now.replace(hour=2, minute=0, second=0, microsecond=0)
        if next_run <= now:
            next_run += timedelta(days=1)
        sleep_secs = (next_run - now).total_seconds()
        logger.info("p2p_snapshot_loop_sleeping", seconds=int(sleep_secs))
        await asyncio.sleep(sleep_secs)

        has_credentials = any([
            os.getenv("MINTOS_API_KEY", ""),
            os.getenv("BONDORA_API_KEY", ""),
            os.getenv("PEERBERRY_EMAIL", ""),
        ])
        if not has_credentials:
            logger.info("p2p_snapshot_skipped_no_credentials")
            continue

        try:
            from app.services.p2p import mintos as mintos_svc
            from app.services.p2p import bondora as bondora_svc
            from app.services.p2p import peerberry as peerberry_svc
            from app.db.database import get_session
            from app.db.models import P2PSnapshot
            from datetime import datetime as _dt, UTC

            mintos_data, bondora_data, peerberry_data = await asyncio.gather(
                mintos_svc.fetch_summary(),
                bondora_svc.fetch_summary(),
                peerberry_svc.fetch_summary(),
            )
            async with get_session() as session:
                for svc_data in [mintos_data, bondora_data, peerberry_data]:
                    d = svc_data.to_dict()
                    snap = P2PSnapshot(
                        platform=d["platform"],
                        total_invested=svc_data.total_invested,
                        outstanding_principal=svc_data.outstanding_principal,
                        interest_month=svc_data.interest_month,
                        total_interest=svc_data.total_interest,
                        defaulted_amount=svc_data.defaulted_amount,
                        cash_balance=svc_data.cash_balance,
                        net_annual_return=svc_data.net_annual_return,
                        num_active_loans=svc_data.num_active_loans,
                        currency=svc_data.currency,
                        fetched_at=_dt.now(UTC),
                    )
                    session.add(snap)
                await session.commit()
            logger.info("p2p_snapshot_saved_daily")
        except Exception as snap_err:
            logger.warning("p2p_snapshot_loop_error", reason=str(snap_err))


async def _price_stream_loop() -> None:
    """
    Background task: fetch current prices for the default watchlist every 10 s
    and broadcast them to all WebSocket subscribers on the 'prices' channel.

    Uses yfinance batch download (one HTTP call for all tickers) instead of
    sequential per-ticker calls — significantly faster for larger watchlists.
    """
    while True:
        try:
            import yfinance as yf
            import pandas as pd
            from datetime import datetime, UTC

            # Single batch download off the event loop — yfinance is synchronous I/O
            def _fetch_prices():
                return yf.download(
                    _PRICE_WATCHLIST,
                    period="2d",
                    interval="1d",
                    progress=False,
                    auto_adjust=True,
                )

            data = await asyncio.to_thread(_fetch_prices)

            prices: dict = {}
            if not data.empty and "Close" in data.columns:
                close = data["Close"]
                # Normalise to DataFrame regardless of single-vs-multi ticker
                if isinstance(close, pd.Series):
                    close = close.to_frame(name=_PRICE_WATCHLIST[0])
                elif isinstance(close.columns, pd.MultiIndex):
                    # Multi-index: flatten to (ticker,) columns
                    close = close.droplevel(0, axis=1) if close.columns.nlevels > 1 else close

                for ticker in _PRICE_WATCHLIST:
                    try:
                        series = close[ticker].dropna() if ticker in close.columns else pd.Series(dtype=float)
                        if len(series) < 1:
                            continue
                        current_price = float(series.iloc[-1])
                        prev_price = float(series.iloc[-2]) if len(series) >= 2 else current_price
                        change_pct = round((current_price - prev_price) / prev_price * 100, 2) if prev_price else 0.0
                        prices[ticker] = {
                            "price": round(current_price, 4),
                            "change_pct": change_pct,
                            "prev_close": round(prev_price, 4),
                        }
                    except Exception as ticker_err:
                        logger.debug("price_extract_skipped", ticker=ticker, reason=str(ticker_err))

            if prices:
                payload = {
                    "timestamp": datetime.now(UTC).isoformat(),
                    "prices": prices,
                }
                await ws_manager.broadcast("prices", payload)
                logger.debug("price_broadcast_sent", tickers=list(prices.keys()))

        except Exception as err:
            logger.debug("price_stream_iteration_skipped", reason=str(err))

        await asyncio.sleep(10)


# ---------------------------------------------------------------------------
# Lifespan: startup / shutdown
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application startup and shutdown lifecycle.
    """
    logger.info(
        "trading_dashboard_startup",
        version=settings.APP_VERSION,
        environment=os.getenv("ENVIRONMENT", "development"),
    )

    if not jwt_key_is_secure():
        logger.warning(
            "jwt_secret_weak",
            hint="Set a strong JWT_SECRET_KEY (≥32 random chars) in .env before production",
        )

    # Apply Alembic migrations (idempotent — safe to run on every startup)
    try:
        import subprocess
        import sys
        result = subprocess.run(
            [sys.executable, "-m", "alembic", "upgrade", "head"],
            capture_output=True,
            text=True,
            cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        )
        if result.returncode == 0:
            logger.info("db_migrations_applied")
        else:
            logger.warning("db_migrations_warning", stderr=result.stderr[:500])
    except Exception as db_err:
        logger.warning("db_migrations_failed", reason=str(db_err))

    # Initialize execution client
    from app.services.nautilus.client import get_execution_client
    client = get_execution_client()
    await client.initialize()

    # Start background risk monitor (broadcasts WebSocket alerts every 30s)
    from app.api.routes.risk import start_risk_monitor
    risk_monitor_task = asyncio.create_task(start_risk_monitor())
    logger.info("risk_monitor_started")

    # Start live price streaming (broadcasts prices every 10s via WebSocket)
    price_stream_task = asyncio.create_task(_price_stream_loop())
    logger.info("price_stream_started")

    # Start daily signal performance tracker (runs at midnight UTC)
    signal_perf_task = asyncio.create_task(_signal_performance_loop())
    logger.info("signal_performance_tracker_started")

    # Start daily P2P snapshot (runs at 02:00 UTC — only when credentials set)
    p2p_snapshot_task = asyncio.create_task(_p2p_snapshot_loop())
    logger.info("p2p_snapshot_scheduler_started")

    # Start price alert checker (polls every 15s) — load from DB first
    from app.services.price_alerts.manager import get_alert_manager
    alert_manager = get_alert_manager()
    await alert_manager.load_from_db()
    alert_task = asyncio.create_task(alert_manager.run_checker())
    logger.info("price_alert_checker_started")

    # Start self-learning scheduler (YouTube daily + weekly trade review)
    from app.services.learning.scheduler import start_scheduler
    learning_scheduler = start_scheduler()
    logger.info("learning_scheduler_started")

    logger.info("api_ready", live_trading=settings.ENABLE_LIVE_TRADING)
    yield

    # Shutdown cleanup
    risk_monitor_task.cancel()
    try:
        await risk_monitor_task
    except asyncio.CancelledError:
        pass

    price_stream_task.cancel()
    try:
        await price_stream_task
    except asyncio.CancelledError:
        pass

    alert_task.cancel()
    try:
        await alert_task
    except asyncio.CancelledError:
        pass

    signal_perf_task.cancel()
    try:
        await signal_perf_task
    except asyncio.CancelledError:
        pass

    p2p_snapshot_task.cancel()
    try:
        await p2p_snapshot_task
    except asyncio.CancelledError:
        pass

    from app.services.learning.scheduler import stop_scheduler
    stop_scheduler(learning_scheduler)

    logger.info("trading_dashboard_shutdown")


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="""
## Trading Dashboard API

Central orchestrator for 9 specialized trading repos:
- **TradingAgents** — Multi-agent LLM signal generation
- **FinGPT** — News sentiment analysis
- **Jesse** — Crypto backtesting (300+ indicators)
- **Vibe-Trading** — Alpha factor backtesting (452 factors)
- **qlib** — ML portfolio management (Microsoft)
- **nautilus_trader** — High-performance order execution (15+ brokers)
- **AI-Trader** — Agent-native trading platform
- **FinRobot** — Fundamental analysis & reports
- **daily_stock_analysis** — Daily LLM stock analysis

All LLM calls use Anthropic Claude (Sonnet 4.6 for analysis, Haiku for fast tasks).
    """,
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# Rate Limiting — attach limiter to app state + middleware
# ---------------------------------------------------------------------------
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)  # type: ignore[arg-type]  # slowapi handler signature
app.add_middleware(SlowAPIMiddleware)

# ---------------------------------------------------------------------------
# Request Counter + Timing Middleware
# ---------------------------------------------------------------------------
app.add_middleware(RequestCounterMiddleware)

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------
# Build the effective origins list: base list + optional PRODUCTION_URL env var
_cors_origins: list[str] = list(settings.ALLOWED_ORIGINS)
if settings.PRODUCTION_URL:
    # Accept both http and https variants of the production URL
    for _origin in [settings.PRODUCTION_URL.rstrip("/")]:
        if _origin not in _cors_origins:
            _cors_origins.append(_origin)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# REST Routes
# ---------------------------------------------------------------------------
app.include_router(health.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(signals.router, prefix="/api")
app.include_router(portfolio.router, prefix="/api")
app.include_router(sentiment.router, prefix="/api")
app.include_router(backtest.router, prefix="/api")
app.include_router(execution.router, prefix="/api")
app.include_router(risk.router, prefix="/api")
app.include_router(alerts.router, prefix="/api")
app.include_router(webhooks.router, prefix="/api")
app.include_router(analysis.router, prefix="/api")
app.include_router(waitlist.router, prefix="/api")
app.include_router(portfolio_mgmt.router, prefix="/api")
app.include_router(p2p.router, prefix="/api")
app.include_router(fints_routes.router, prefix="/api")
app.include_router(learning.router, prefix="/api")


# ---------------------------------------------------------------------------
# WebSocket Endpoints
# ---------------------------------------------------------------------------
@app.websocket("/ws/{channel}")
async def websocket_endpoint(
    websocket: WebSocket,
    channel: str,
    token: str = Query(default=""),
):
    """
    WebSocket endpoint for real-time data streaming.

    Channels:
    - /ws/signals   — new AI trading signals
    - /ws/portfolio — portfolio value updates
    - /ws/sentiment — sentiment score updates
    - /ws/prices    — live price ticks
    - /ws/alerts    — risk alerts
    - /ws/all       — all events combined

    Auth: pass ?token=<jwt> as query param.
    """
    from app.api.auth import _verify_token
    if not _verify_token(token):
        await websocket.close(code=4001)
        return
    await ws_manager.connect(websocket, channel)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        await ws_manager.disconnect(websocket, channel)
        logger.info("websocket_disconnected", channel=channel)


@app.websocket("/ws")
async def websocket_all(websocket: WebSocket, token: str = Query(default="")):
    """Default WebSocket — subscribes to all channels."""
    await websocket_endpoint(websocket, "all", token)


# ---------------------------------------------------------------------------
# Root
# ---------------------------------------------------------------------------
@app.get("/", tags=["Root"])
async def root():
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "docs": "/docs",
        "health": "/api/health",
        "mode": "live" if settings.ENABLE_LIVE_TRADING else "paper",
    }


# ---------------------------------------------------------------------------
# Global exception handler
# ---------------------------------------------------------------------------
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    logger.error(
        "unhandled_exception",
        exc_type=type(exc).__name__,
        exc_msg=str(exc),
        path=str(request.url),
        exc_info=True,
    )
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal server error",
            "detail": str(exc) if settings.DEBUG else "Contact support",
        },
    )
