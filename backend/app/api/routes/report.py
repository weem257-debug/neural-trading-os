"""
/api/report — Unified Stock Report endpoint.

Orchestrates Elliott Wave, AI signal, sentiment, backtesting, and risk modules
to produce a single StockReport with a German-language Verdikt.

Routes:
    GET /api/report/{ticker}       — Full report with 5-minute cache.
    GET /api/report/{ticker}/demo  — Demo using SPY (no API key required).
"""
import hmac
import logging
from datetime import date

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request

from app.api.auth import get_current_user_optional, UserInfo
from app.core.cache import cache_get, cache_set
from app.core.config import settings, is_hardened_environment
from app.core.rate_limits import limiter
from app.models.schemas import StockReport
from app.services.report.aggregator import build_stock_report

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/report", tags=["Report"])


# ---------------------------------------------------------------------------
# Access-gate dependency
# ---------------------------------------------------------------------------

async def verify_report_access(
    key: str | None = Query(default=None, description="Share-Token via Query-Parameter"),
    x_report_key: str | None = Header(default=None, alias="X-Report-Key"),
    current_user: UserInfo | None = Depends(get_current_user_optional),
) -> None:
    """
    Access gate for the (expensive, LLM-backed) report endpoints (P1 finding).

    Rules:
      * When REPORT_SHARE_TOKEN is configured, a matching ?key= / X-Report-Key
        token grants access (timing-safe compare).
      * An authenticated user always grants access.
      * Otherwise: open only OUTSIDE hardened environments. In production the
        endpoint is never fully anonymous — it requires either the share token
        or a logged-in user, so it can't be used as a free anonymous LLM proxy.
    """
    token = (settings.REPORT_SHARE_TOKEN or "").strip()
    if token:
        provided = (key or x_report_key or "").strip()
        if provided and hmac.compare_digest(token, provided):
            return

    if current_user is not None:
        return

    if not is_hardened_environment():
        return  # dev/test convenience — stays open locally

    raise HTTPException(
        status_code=401,
        detail="Zugriff erfordert Anmeldung oder gültigen Share-Token",
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get(
    "/{ticker}/demo",
    response_model=StockReport,
    summary="Demo-Report für SPY — kein API-Key erforderlich",
    dependencies=[Depends(verify_report_access)],
)
@limiter.limit("10/minute")
async def get_report_demo(request: Request, ticker: str) -> StockReport:
    """
    Demo-Endpoint: nutzt SPY und gibt einen vollständigen Report zurück.
    Geeignet für UI-Tests ohne eigenen Ticker.
    """
    return await _cached_report("SPY", fast_mode=True)


@router.get(
    "/{ticker}",
    response_model=StockReport,
    summary="Ganzheitlicher KI-Aktien-Report mit Verdikt",
    dependencies=[Depends(verify_report_access)],
    responses={
        401: {"description": "Fehlender oder ungültiger Share-Token"},
        422: {"description": "Ungültiges Ticker-Symbol"},
        500: {"description": "Report-Generierung fehlgeschlagen"},
    },
)
@limiter.limit("10/minute")
async def get_stock_report(request: Request, ticker: str) -> StockReport:
    """
    Generiert einen vollständigen Aktien-Report für den angegebenen Ticker.

    Beinhaltet:
    - KI-Handelssignal (TradingAgents)
    - Elliott-Wave-Analyse + technische Indikatoren
    - News-Sentiment (FinGPT)
    - Backtest-Bestätigung (Jesse)
    - Einzelwert-Risikometrik (VaR, CVaR, Kelly, Position Sizing)
    - Deutsch-sprachiges Verdikt + Begründung

    Ergebnis wird 5 Minuten gecacht.
    """
    ticker = ticker.upper().strip()
    if not ticker or len(ticker) > 10:
        raise HTTPException(status_code=422, detail="Ungültiges Ticker-Symbol")

    try:
        return await _cached_report(ticker, fast_mode=True)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("report_endpoint_error ticker=%s: %s", ticker, exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Report-Generierung fehlgeschlagen")


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

async def _cached_report(ticker: str, fast_mode: bool = True) -> StockReport:
    """Return cached StockReport or build + cache a fresh one."""
    today = date.today().isoformat()
    cache_key = f"report:{ticker}:{today}"

    cached = cache_get(cache_key)
    if cached is not None:
        return cached  # type: ignore[return-value]

    report = await build_stock_report(ticker, fast_mode=fast_mode)
    cache_set(cache_key, report, ttl_seconds=300)
    return report
