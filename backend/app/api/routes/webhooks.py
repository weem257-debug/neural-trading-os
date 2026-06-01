"""
/api/webhooks — Outbound Webhook Management
-------------------------------------------
Register, list, delete, and test outbound webhooks that receive real-time
event notifications from the Neural Trading OS.

Supported events: signal.generated, alert.fired, order.filled, risk.alert
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
import logging

from app.services.webhooks.client import get_webhook_manager, WEBHOOK_EVENTS
from app.models.schemas import WebhookRecord, WebhookTestResponse, WebhookDeleteResponse
from app.api.auth import get_current_user, UserInfo

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/webhooks", tags=["Webhooks"])


# ---------------------------------------------------------------------------
# Request schema
# ---------------------------------------------------------------------------

class WebhookCreateRequest(BaseModel):
    url: str = Field(..., description="HTTPS endpoint that will receive POST events")
    events: list[str] = Field(
        ...,
        min_length=1,
        description=f"Event types to subscribe to. Valid: {sorted(WEBHOOK_EVENTS)}",
    )
    secret: Optional[str] = Field(
        None,
        description="HMAC-SHA256 signing secret. If omitted, a server-side default is used.",
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post(
    "/",
    summary="Register a new outbound webhook",
    response_model=WebhookRecord,
    status_code=200,
)
async def create_webhook(req: WebhookCreateRequest, _: UserInfo = Depends(get_current_user)) -> WebhookRecord:
    """
    Register a webhook endpoint.

    The server will POST a signed JSON payload to `url` whenever any of the
    specified `events` fires. Payloads are signed with HMAC-SHA256 in the
    `X-Trading-Signature` header.

    Max 20 webhooks total. Returns the registration including its `id`.
    """
    mgr = get_webhook_manager()
    try:
        wh = mgr.register(
            url=req.url,
            events=req.events,
            secret=req.secret or "",
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return WebhookRecord(**wh.to_dict())


@router.get(
    "/",
    summary="List all registered webhooks",
    response_model=list[WebhookRecord],
)
async def list_webhooks(_: UserInfo = Depends(get_current_user)) -> list[WebhookRecord]:
    """Return all registered webhook registrations."""
    mgr = get_webhook_manager()
    return [WebhookRecord(**wh.to_dict()) for wh in mgr.get_all()]


@router.delete(
    "/{webhook_id}",
    summary="Delete a webhook registration",
    response_model=WebhookDeleteResponse,
)
async def delete_webhook(webhook_id: str, _: UserInfo = Depends(get_current_user)) -> WebhookDeleteResponse:
    """Permanently remove a webhook registration by its ID."""
    mgr = get_webhook_manager()
    deleted = mgr.delete(webhook_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Webhook {webhook_id} nicht gefunden")
    return WebhookDeleteResponse(deleted=True, webhook_id=webhook_id)


@router.post(
    "/{webhook_id}/test",
    summary="Send a test event to a webhook",
    response_model=WebhookTestResponse,
)
async def test_webhook(webhook_id: str, _: UserInfo = Depends(get_current_user)) -> WebhookTestResponse:
    """
    Send a test `test` event payload to the specified webhook URL.
    Returns the HTTP status code received from the remote endpoint.
    """
    mgr = get_webhook_manager()
    try:
        result = await mgr.send_test(webhook_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return WebhookTestResponse(**result)
