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

from app.core.cache import cache_get, cache_set
from app.core.config import settings
from app.models.schemas import StockReport
from app.services.report.aggregator import build_stock_report

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/report", tags=["Report"])


# ---------------------------------------------------------------------------
# Optional share-gate dependency
# ---------------------------------------------------------------------------

async def verify_share_token(
    key: str | None = Query(default=None, description="Share-Token via Query-Parameter"),
    x_report_key: str | None = Header(default=None, alias="X-Report-Key"),
) -> None:
    """
    No-op when REPORT_SHARE_TOKEN is empty (endpoint stays fully open).
    When configured, the request must supply the token via ?key= or X-Report-Key header.
    Uses hmac.compare_digest to prevent timing attacks.
    """
    token = (settings.REPORT_SHARE_TOKEN or "").strip()
    if not token:
        return  # gate disabled

    provided = (key or x_report_key or "").strip()
    if not provided or not hmac.compare_digest(token, provided):
        raise HTTPException(status_code=401, detail="Ungültiger oder fehlender Share-Token")


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get(
    "/{ticker}/demo",
    response_model=StockReport,
    summary="Demo-Report für SPY — kein API-Key erforderlich",
    dependencies=[Depends(verify_share_token)],
)
async def get_report_demo(ticker: str) -> StockReport:
    """
    Demo-Endpoint: nutzt SPY und gibt einen vollständigen Report zurück.
    Geeignet für UI-Tests ohne eigenen Ticker.
    """
    return await _cached_report("SPY", fast_mode=True)


@router.get(
    "/{ticker}",
    response_model=StockReport,
    summary="Ganzheitlicher KI-Aktien-Report mit Verdikt",
    dependencies=[Depends(verify_share_token)],
    responses={
        401: {"description": "Fehlender oder ungültiger Share-Token"},
        422: {"description": "Ungültiges Ticker-Symbol"},
        500: {"description": "Report-Generierung fehlgeschlagen"},
    },
)
async def get_stock_report(ticker: str) -> StockReport:
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
