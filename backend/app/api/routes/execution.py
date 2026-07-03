"""
/api/execution — Order execution via Nautilus Trader.
Supports paper trading (default) and live trading (ENABLE_LIVE_TRADING=true).

Geschäftsmodell "Weg A" (Stand 2026-07-02): reines Signal-/Analyse-Tool.
Der Nutzer hat einen eigenen Broker-Account und führt Orders SELBST aus; wir
routen keine Orders und halten keine Kundengelder. Diese Execution-Schicht
bleibt daher dauerhaft auf PAPER TRADING (Alpaca-Sandbox, paper-api.alpaca.markets)
beschränkt — sie dient internen Tests der Signal-/Risk-Logik, nicht dem
Live-Handel für Nutzer. ENABLE_LIVE_TRADING bleibt bewusst False; der
Live-Zweig unten ist ein Safety-Gate, kein Produktivpfad.

Endpoints:
  POST /order         — submit a buy/sell order
  GET  /orders        — order history (last N orders)
  GET  /mode          — current execution mode
  POST /mode          — switch mode (live→paper always; paper→live requires API key)
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from app.models.schemas import (
    OrderRequest, OrderResponse, OrderHistoryItem, ErrorResponse,
    ExecutionModeResponse, ExecutionModeSetResponse,
)
from app.services.nautilus.client import get_execution_client, NautilusExecutionClient
from app.api.auth import get_current_user, UserInfo
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/execution", tags=["Execution"])


def _get_client() -> NautilusExecutionClient:
    return get_execution_client()


# ---------------------------------------------------------------------------
# POST /order
# ---------------------------------------------------------------------------

@router.post(
    "/order",
    response_model=OrderResponse,
    summary="Submit a trading order",
    responses={
        403: {"model": ErrorResponse},
        500: {"model": ErrorResponse},
    },
)
async def submit_order(
    req: OrderRequest,
    client: NautilusExecutionClient = Depends(_get_client),
    current_user: UserInfo = Depends(get_current_user),
) -> OrderResponse:
    """
    Submit a buy/sell order.

    - **Paper trading mode** (default): simulated fills via yfinance prices, no real money.
    - **Live trading mode**: requires ENABLE_LIVE_TRADING=true and valid broker keys.

    Safety guards:
    - Quantity must be > 0
    - SELL requires an existing position of sufficient size
    - Live trading gate: config must explicitly enable it
    """
    if client.mode == "live" and not settings.ENABLE_LIVE_TRADING:
        raise HTTPException(
            status_code=403,
            detail="Live-Trading ist deaktiviert. Setze ENABLE_LIVE_TRADING=true in der Konfiguration.",
        )

    if settings.ENABLE_LIVE_TRADING and client.mode == "live":
        logger.warning(
            "LIVE ORDER submitted: %s %s %.4f",
            req.side, req.ticker, req.quantity,
        )
    else:
        logger.info(
            "PAPER ORDER: %s %s %.4f",
            req.side, req.ticker, req.quantity,
        )

    try:
        result = await client.submit_order(req, owner_username=current_user.username)
        # Dispatch outbound webhook for filled orders (best-effort, non-blocking)
        try:
            import asyncio as _asyncio
            from app.services.webhooks.client import get_webhook_manager
            loop = _asyncio.get_event_loop()
            loop.create_task(get_webhook_manager().dispatch("order.filled", {
                "order_id": result.order_id if hasattr(result, "order_id") else None,
                "ticker": req.ticker,
                "side": req.side,
                "quantity": req.quantity,
                "mode": client.mode,
            }))
        except Exception as hook_err:
            # Webhook dispatch is best-effort and must never fail the order.
            logger.warning("order_filled_webhook_dispatch_failed: %s", hook_err)
        return result
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        logger.error("Order submission error: %s", e)
        raise HTTPException(status_code=500, detail="Order-Übermittlung fehlgeschlagen")


# ---------------------------------------------------------------------------
# GET /orders
# ---------------------------------------------------------------------------

@router.get(
    "/orders",
    summary="List recent orders",
    response_model=list[OrderHistoryItem],
)
async def list_orders(
    limit: int = Query(default=50, ge=1, le=500, description="Max orders to return"),
    client: NautilusExecutionClient = Depends(_get_client),
    current_user: UserInfo = Depends(get_current_user),
) -> list[OrderHistoryItem]:
    """
    Return the last N orders from SQLite (fallback: in-memory), scoped to the
    authenticated user's own orders (SECURITY P0-3/P0-4).
    Sorted newest-first. Includes status: filled | rejected.
    """
    try:
        return await client.get_order_history_async(limit=limit, owner_username=current_user.username)
    except Exception as e:
        logger.error("Error fetching order history: %s", e)
        raise HTTPException(status_code=500, detail="Order-Historie konnte nicht abgerufen werden")


# ---------------------------------------------------------------------------
# GET /mode
# ---------------------------------------------------------------------------

@router.get(
    "/mode",
    response_model=ExecutionModeResponse,
    summary="Get current execution mode",
)
async def get_execution_mode(
    client: NautilusExecutionClient = Depends(_get_client),
    _: UserInfo = Depends(get_current_user),
) -> ExecutionModeResponse:
    """Returns whether the system is in paper or live trading mode."""
    return ExecutionModeResponse(
        mode=client.mode,
        live_trading_config=settings.ENABLE_LIVE_TRADING,
        paper_trading_config=settings.ENABLE_PAPER_TRADING,
        max_position_size_pct=settings.MAX_POSITION_SIZE_PCT,
        max_daily_loss_pct=settings.MAX_DAILY_LOSS_PCT,
        max_leverage=settings.MAX_LEVERAGE,
    )


# ---------------------------------------------------------------------------
# POST /mode
# ---------------------------------------------------------------------------

@router.post(
    "/mode",
    response_model=ExecutionModeSetResponse,
    summary="Switch execution mode",
    responses={
        400: {"model": ErrorResponse},
        403: {"model": ErrorResponse},
    },
)
async def set_execution_mode(
    mode: str,
    client: NautilusExecutionClient = Depends(_get_client),
    _: UserInfo = Depends(get_current_user),
) -> ExecutionModeSetResponse:
    """
    Switch execution mode.

    Rules:
    - **live → paper**: always allowed, no confirmation required.
    - **paper → live**: Safety-Gate — requires ENABLE_LIVE_TRADING=true in config
      AND at least one broker API key configured (ALPACA_API_KEY or BINANCE_API_KEY).
    """
    if mode not in ("paper", "live"):
        raise HTTPException(
            status_code=400,
            detail=f"Ungültiger Modus '{mode}'. Erlaubt: 'paper' oder 'live'.",
        )

    if mode == "live":
        # Safety-Gate: config must explicitly enable live trading
        if not settings.ENABLE_LIVE_TRADING:
            raise HTTPException(
                status_code=403,
                detail=(
                    "Safety-Gate: Live-Trading ist nicht aktiviert. "
                    "Setze ENABLE_LIVE_TRADING=true in der .env und konfiguriere Broker-API-Keys."
                ),
            )
        # Safety-Gate: at least one broker key must be present
        has_broker_key = any([
            settings.ALPACA_API_KEY,
            settings.BINANCE_API_KEY,
            settings.BYBIT_API_KEY,
            settings.COINBASE_API_KEY,
        ])
        if not has_broker_key:
            raise HTTPException(
                status_code=403,
                detail=(
                    "Safety-Gate: Keine Broker-API-Keys konfiguriert. "
                    "Setze ALPACA_API_KEY oder BINANCE_API_KEY in der .env."
                ),
            )

    previous = client.mode
    client.set_mode(mode)
    logger.info("Execution mode switched: %s → %s", previous, mode)
    return ExecutionModeSetResponse(
        previous_mode=previous,
        current_mode=client.mode,
        message=f"Handelsmodus auf {mode} umgestellt.",
    )
