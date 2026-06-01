"""
/api/risk — Risk metrics and alerts via Jesse risk module + TradingAgents Risk Agent.

Also exports `start_risk_monitor` — an async background task that evaluates
portfolio risk every 30 seconds and broadcasts WebSocket alerts when thresholds
are breached.

Alert thresholds:
  - Drawdown > 5%   → level: WARN
  - Drawdown > 10%  → level: CRITICAL
  - Single position > 25% of portfolio → level: WARN
"""
import asyncio
import logging
from datetime import datetime, UTC

from fastapi import APIRouter, HTTPException

from app.models.schemas import RiskMetrics, RiskLimits, ErrorResponse
from app.services.jesse.client import compute_risk_metrics
from app.services.nautilus.client import get_execution_client

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/risk", tags=["Risk"])

# Thresholds
_DRAWDOWN_WARN_PCT: float = 0.05      # 5%
_DRAWDOWN_CRITICAL_PCT: float = 0.10  # 10%
_CONCENTRATION_WARN_PCT: float = 0.25 # 25%
_MONITOR_INTERVAL_S: int = 30


# ---------------------------------------------------------------------------
# Background risk monitor task
# ---------------------------------------------------------------------------

async def start_risk_monitor() -> None:
    """
    Async background task — evaluates portfolio risk every 30 seconds.

    Checks:
    1. Portfolio drawdown: > 5% → WARN, > 10% → CRITICAL
    2. Position concentration: single position > 25% of total portfolio → WARN

    On alert: broadcasts to the "alerts" WebSocket channel via ws_manager.
    """
    # Import here to avoid circular imports at module load time
    from app.websocket.manager import ws_manager

    logger.info("Risk monitor started (interval=%ds)", _MONITOR_INTERVAL_S)

    while True:
        try:
            await asyncio.sleep(_MONITOR_INTERVAL_S)
            await _evaluate_and_broadcast(ws_manager)
        except asyncio.CancelledError:
            logger.info("Risk monitor cancelled — shutting down.")
            break
        except Exception as exc:
            logger.error("Risk monitor error (will retry): %s", exc)


async def _evaluate_and_broadcast(ws_manager) -> None:
    """Evaluate risk and send WebSocket alerts if thresholds are breached."""
    client = get_execution_client()
    portfolio = await client.get_portfolio()

    alerts: list[dict] = []

    # 1. Drawdown check
    # current_drawdown is negative (loss) — take abs value
    current_drawdown_abs = abs(portfolio.total_pnl_pct)
    if portfolio.total_pnl < 0:
        if current_drawdown_abs >= _DRAWDOWN_CRITICAL_PCT:
            alerts.append({
                "type": "drawdown",
                "level": "CRITICAL",
                "message": (
                    f"Portfolio drawdown CRITICAL: "
                    f"{current_drawdown_abs * 100:.1f}% loss "
                    f"(threshold: {_DRAWDOWN_CRITICAL_PCT * 100:.0f}%)"
                ),
                "value": current_drawdown_abs,
                "threshold": _DRAWDOWN_CRITICAL_PCT,
            })
        elif current_drawdown_abs >= _DRAWDOWN_WARN_PCT:
            alerts.append({
                "type": "drawdown",
                "level": "WARN",
                "message": (
                    f"Portfolio drawdown warning: "
                    f"{current_drawdown_abs * 100:.1f}% loss "
                    f"(threshold: {_DRAWDOWN_WARN_PCT * 100:.0f}%)"
                ),
                "value": current_drawdown_abs,
                "threshold": _DRAWDOWN_WARN_PCT,
            })

    # 2. Position concentration check
    for pos in portfolio.positions:
        if pos.weight >= _CONCENTRATION_WARN_PCT:
            alerts.append({
                "type": "concentration",
                "level": "WARN",
                "message": (
                    f"Position concentration warning: {pos.ticker} is "
                    f"{pos.weight * 100:.1f}% of portfolio "
                    f"(threshold: {_CONCENTRATION_WARN_PCT * 100:.0f}%)"
                ),
                "ticker": pos.ticker,
                "weight": pos.weight,
                "threshold": _CONCENTRATION_WARN_PCT,
            })

    # Broadcast each alert via WebSocket and outbound webhooks
    for alert in alerts:
        payload = {
            "type": "risk_alert",
            "level": alert["level"],
            "alert_type": alert["type"],
            "message": alert["message"],
            "details": alert,
            "timestamp": datetime.now(UTC).isoformat(),
        }
        await ws_manager.broadcast("alerts", payload)
        logger.warning("Risk alert broadcasted: [%s] %s", alert["level"], alert["message"])

        # Outbound webhook dispatch (best-effort, non-blocking)
        try:
            from app.services.webhooks.client import get_webhook_manager
            asyncio.create_task(
                get_webhook_manager().dispatch("risk.alert", payload)
            )
        except Exception:
            pass

    if not alerts:
        logger.debug("Risk monitor: all checks passed — no alerts.")


# ---------------------------------------------------------------------------
# REST endpoints
# ---------------------------------------------------------------------------

@router.get(
    "/",
    response_model=RiskMetrics,
    summary="Get portfolio risk metrics (alias)",
    responses={500: {"model": ErrorResponse}},
)
async def get_risk_metrics_root() -> RiskMetrics:
    """Alias for /metrics — convenience root endpoint."""
    return await get_risk_metrics()


@router.get(
    "/metrics",
    response_model=RiskMetrics,
    summary="Get portfolio risk metrics",
    responses={500: {"model": ErrorResponse}},
)
async def get_risk_metrics() -> RiskMetrics:
    """
    Compute and return risk metrics for the current portfolio.

    Metrics include:
    - VaR 95% and 99% (Value at Risk)
    - Max drawdown and current drawdown
    - Sharpe ratio
    - Concentration risk (top-5 positions)
    - Active risk alerts
    """
    try:
        client = get_execution_client()
        portfolio = await client.get_portfolio()
        positions = [p.model_dump() for p in portfolio.positions]
        return await compute_risk_metrics(
            positions=positions,
            portfolio_value=portfolio.total_value,
        )
    except Exception as e:
        logger.error("Risk metrics error: %s", e)
        raise HTTPException(status_code=500, detail="Risiko-Metriken nicht verfügbar")


@router.get(
    "/limits",
    response_model=RiskLimits,
    summary="Get configured risk limits",
)
async def get_risk_limits() -> RiskLimits:
    """Return the currently configured risk limits from settings."""
    from app.core.config import settings
    return RiskLimits(
        max_position_size_pct=settings.MAX_POSITION_SIZE_PCT,
        max_daily_loss_pct=settings.MAX_DAILY_LOSS_PCT,
        max_leverage=settings.MAX_LEVERAGE,
        enable_live_trading=settings.ENABLE_LIVE_TRADING,
    )


@router.get(
    "/alerts",
    response_model=list[str],
    summary="Get active risk alerts",
)
async def get_risk_alerts() -> list[str]:
    """
    Return list of active risk alerts.
    Combines alerts from jesse risk module and TradingAgents Risk Agent.
    """
    try:
        client = get_execution_client()
        portfolio = await client.get_portfolio()
        positions = [p.model_dump() for p in portfolio.positions]
        metrics = await compute_risk_metrics(
            positions=positions,
            portfolio_value=portfolio.total_value,
        )
        return metrics.alerts
    except Exception as e:
        return [f"Risk alert system error: {str(e)}"]
