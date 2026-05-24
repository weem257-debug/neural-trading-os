"""
/api/health — System health and service status checks.
"""
import importlib
import logging
import os
import time
from datetime import UTC, datetime
from threading import Lock

from fastapi import APIRouter, Depends

from app.api.auth import get_current_user, UserInfo

from app.core.config import settings, anthropic_key_configured
from app.models.schemas import HealthResponse, ApiMetricsResponse, RepoPathEntry

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Health"])

# Server start time — used for uptime calculation
_SERVER_START_TIME: datetime = datetime.now(UTC)

# ---------------------------------------------------------------------------
# Request performance counters — shared module-level state
# Thread-safe via Lock; updated by RequestCounterMiddleware in main.py
# ---------------------------------------------------------------------------

_metrics_lock        = Lock()
_requests_total:   int   = 0
_response_time_sum: float = 0.0   # cumulative ms


def record_request(duration_ms: float) -> None:
    """Called by RequestCounterMiddleware after every request."""
    global _requests_total, _response_time_sum
    with _metrics_lock:
        _requests_total    += 1
        _response_time_sum += duration_ms


def get_metrics_snapshot() -> dict:
    """Return a point-in-time copy of all counters."""
    with _metrics_lock:
        req_total = _requests_total
        avg_ms    = (_response_time_sum / req_total) if req_total else 0.0
    return {"requests_total": req_total, "avg_response_ms": round(avg_ms, 2)}

REPO_MODULES = {
    "TradingAgents": "tradingagents",
    "FinGPT": "fingpt",
    "Jesse": "jesse",
    "nautilus_trader": "nautilus_trader",
    "qlib": "qlib",
}

# Services whose availability is checked via module import
SERVICE_MODULES = {
    "tradingagents": "tradingagents",
    "fingpt": "fingpt",
    "jesse": "jesse",
    "nautilus": "nautilus_trader",
}

# All 9 repo paths for the repos dict
REPO_PATHS = {
    "TradingAgents": settings.TRADINGAGENTS_PATH,
    "AI-Trader": settings.AI_TRADER_PATH,
    "daily_stock_analysis": settings.DAILY_ANALYSIS_PATH,
    "Vibe-Trading": settings.VIBE_TRADING_PATH,
    "qlib": settings.QLIB_PATH,
    "nautilus_trader": settings.NAUTILUS_PATH,
    "FinGPT": settings.FINGPT_PATH,
    "FinRobot": settings.FINROBOT_PATH,
    "jesse": settings.JESSE_PATH,
}


def _check_module(module_name: str) -> str:
    try:
        importlib.import_module(module_name)
        return "available"
    except ImportError:
        return "not_installed"
    except Exception as e:
        return f"error: {str(e)[:60]}"


def _module_available(module_name: str) -> bool:
    try:
        importlib.import_module(module_name)
        return True
    except Exception:
        return False


def _check_repos() -> dict[str, bool]:
    """Return dict of repo_name → directory_exists (bool)."""
    result: dict[str, bool] = {}
    for name, path in REPO_PATHS.items():
        abs_path = os.path.abspath(path)
        result[name] = os.path.isdir(abs_path)
    return result


def _uptime_seconds() -> float:
    return (datetime.now(UTC) - _SERVER_START_TIME).total_seconds()


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="System health check",
    tags=["Health"],
)
async def health_check() -> HealthResponse:
    """
    Returns API status and availability of each integrated repo/service.
    Use this endpoint to verify the environment before running trades.

    - status: "healthy" when all core services available, "degraded" otherwise
    - uptime_seconds: seconds since server start
    - repos: dict of all 9 repos with directory-exists flag
    - services: availability of key AI/execution services
    - version: application version from settings
    - environment: deployment environment (development/staging/production)
    """
    # Module-level service checks
    services: dict[str, str] = {}
    for display_name, module_name in REPO_MODULES.items():
        services[display_name] = _check_module(module_name)

    # Config checks
    key_ok = anthropic_key_configured()
    services["ANTHROPIC_API_KEY"] = "configured" if key_ok else (
        "placeholder_not_set" if settings.ANTHROPIC_API_KEY else "missing"
    )
    services["live_trading"] = (
        "enabled" if settings.ENABLE_LIVE_TRADING else "disabled_paper_mode"
    )

    # Repo directory checks
    repos = _check_repos()

    # Determine overall health — "degraded" if API key missing or placeholder
    overall_status = "healthy" if key_ok else "degraded"

    return HealthResponse(
        status=overall_status,
        version=settings.APP_VERSION,
        timestamp=datetime.now(UTC),
        services=services,
        uptime_seconds=round(_uptime_seconds(), 2),
        repos=repos,
        environment=settings.ENVIRONMENT,
    )


@router.get(
    "/health/metrics",
    response_model=ApiMetricsResponse,
    summary="API performance and operational metrics",
    tags=["Health"],
)
async def get_metrics() -> ApiMetricsResponse:
    """
    GET /api/health/metrics

    Returns live operational metrics:
    - requests_total         — total HTTP requests since server start
    - avg_response_ms        — average response time in milliseconds
    - ws_connections_active  — currently active WebSocket connections
    - signals_generated_today — signals created since midnight (SQLite)
    - db_size_kb             — size of trading_dashboard.db in KB
    """
    from app.websocket.manager import ws_manager

    snap = get_metrics_snapshot()

    # WebSocket connections
    ws_active = ws_manager.connection_count("all")

    # Signals generated today (SQLite)
    signals_today = 0
    try:
        from sqlalchemy import select, func
        from app.db.database import get_session
        from app.db.models import SignalRecord

        today_start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
        async with get_session() as session:
            result = await session.execute(
                select(func.count()).select_from(SignalRecord).where(
                    SignalRecord.generated_at >= today_start
                )
            )
            signals_today = result.scalar() or 0
    except Exception as exc:
        logger.debug("signals_today_count_failed: %s", exc)

    # DB file size
    db_size_kb = 0.0
    try:
        db_path = os.path.abspath("trading_dashboard.db")
        if os.path.exists(db_path):
            db_size_kb = round(os.path.getsize(db_path) / 1024, 1)
    except Exception:
        pass

    return ApiMetricsResponse(
        requests_total=snap["requests_total"],
        avg_response_ms=snap["avg_response_ms"],
        ws_connections_active=ws_active,
        signals_generated_today=signals_today,
        db_size_kb=db_size_kb,
        uptime_seconds=round(_uptime_seconds(), 2),
        measured_at=datetime.now(UTC).isoformat(),
    )


@router.get(
    "/health/repos",
    response_model=dict[str, RepoPathEntry],
    summary="Check all 9 repo paths",
)
async def check_repo_paths(_: UserInfo = Depends(get_current_user)) -> dict[str, RepoPathEntry]:
    """Verify that all 9 trading repos exist at their configured paths."""
    result: dict[str, RepoPathEntry] = {}
    for name, path in REPO_PATHS.items():
        abs_path = os.path.abspath(path)
        result[name] = RepoPathEntry(path=abs_path, exists=os.path.isdir(abs_path))
    return result
