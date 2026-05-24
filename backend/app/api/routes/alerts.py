"""
/api/alerts — Price Alert CRUD
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Literal

from app.models.schemas import PriceAlertRecord
from app.api.auth import get_current_user, UserInfo

router = APIRouter(prefix="/alerts", tags=["Alerts"])

AlertCondition = Literal["above", "below", "change_pct"]


class AlertCreateRequest(BaseModel):
    ticker: str = Field(..., min_length=1, max_length=20, description="Ticker symbol, e.g. AAPL")
    condition: AlertCondition = Field(..., description="Trigger condition: above / below / change_pct")
    threshold: float = Field(..., description="Price level or percentage change threshold")


class AlertDeleteResponse(BaseModel):
    deleted: bool
    alert_id: str


@router.post(
    "/",
    summary="Create a new price alert",
    response_model=PriceAlertRecord,
    status_code=200,
)
async def create_alert(req: AlertCreateRequest, _: UserInfo = Depends(get_current_user)) -> PriceAlertRecord:
    """
    Create a price alert.

    - **above**: fires when price rises above threshold
    - **below**: fires when price falls below threshold
    - **change_pct**: fires when |daily change %| >= threshold
    """
    from app.services.price_alerts.manager import get_alert_manager

    mgr = get_alert_manager()
    alert = await mgr.add_alert(
        ticker=req.ticker,
        condition=req.condition,
        threshold=req.threshold,
    )
    return PriceAlertRecord(**alert.to_dict())


@router.get(
    "/",
    summary="List all price alerts",
    response_model=list[PriceAlertRecord],
)
async def list_alerts(_: UserInfo = Depends(get_current_user)) -> list[PriceAlertRecord]:
    """Return all price alerts (active and fired), newest first."""
    from app.services.price_alerts.manager import get_alert_manager

    mgr = get_alert_manager()
    raw = await mgr.get_all_alerts()
    return [PriceAlertRecord(**item) for item in raw]


@router.delete(
    "/{alert_id}",
    summary="Delete a price alert",
    response_model=AlertDeleteResponse,
)
async def delete_alert(alert_id: str, _: UserInfo = Depends(get_current_user)) -> AlertDeleteResponse:
    """Delete a price alert by its ID."""
    from app.services.price_alerts.manager import get_alert_manager

    mgr = get_alert_manager()
    deleted = await mgr.delete_alert(alert_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Alert {alert_id} not found")
    return AlertDeleteResponse(deleted=True, alert_id=alert_id)
