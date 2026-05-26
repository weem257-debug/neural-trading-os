"""
/api/telegram — Telegram Bot notification management.

Endpoints:
  GET    /api/telegram/status     — Connection status for current user
  POST   /api/telegram/connect    — Generate connect code + bot link
  POST   /api/telegram/webhook    — Telegram webhook receiver (no auth)
  POST   /api/telegram/test       — Send test message
  DELETE /api/telegram/disconnect — Remove Telegram connection
"""
import logging
import random
import string
from datetime import datetime, UTC
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request

from app.api.auth import get_current_user, UserInfo
from app.services.telegram.client import (
    get_bot_name,
    is_configured,
    is_configured_async,
    send_message,
    set_webhook,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/telegram", tags=["Telegram"])

# In-memory store: connect_code -> user_id
# Codes expire after 10 minutes (not enforced strictly — MVP)
_pending_codes: dict[str, str] = {}


def _generate_code(length: int = 6) -> str:
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=length))


# ---------------------------------------------------------------------------
# GET /api/telegram/status
# ---------------------------------------------------------------------------

@router.get("/status")
async def get_status(current_user: UserInfo = Depends(get_current_user)) -> dict:
    """Return Telegram connection status for the authenticated user."""
    user_id = current_user.username
    try:
        from app.db.database import get_session
        from app.db.models import TelegramChat
        from sqlalchemy import select

        async with get_session() as session:
            result = await session.execute(
                select(TelegramChat).where(TelegramChat.user_id == user_id)
            )
            chat = result.scalar_one_or_none()

        configured = await is_configured_async()
        return {
            "connected": chat is not None,
            "username": chat.username if chat else None,
            "configured": configured,
        }
    except Exception as e:
        logger.warning("telegram_status_error", extra={"reason": str(e)})
        return {"connected": False, "username": None, "configured": await is_configured_async()}


# ---------------------------------------------------------------------------
# POST /api/telegram/connect
# ---------------------------------------------------------------------------

@router.post("/connect")
async def connect(current_user: UserInfo = Depends(get_current_user)) -> dict:
    """Generate a one-time connect code and return the bot deep-link."""
    user_id = current_user.username
    code = _generate_code()
    _pending_codes[code] = user_id

    configured = await is_configured_async()
    if not configured:
        raise HTTPException(status_code=503, detail="TELEGRAM_BOT_TOKEN not configured. Please set it in Settings first.")

    bot_name = await get_bot_name()
    bot_link = f"https://t.me/{bot_name}?start={code}"

    logger.info("telegram_connect_code_generated", extra={"user_id": user_id, "code": code})
    return {
        "bot_link": bot_link,
        "code": code,
        "configured": True,
    }


# ---------------------------------------------------------------------------
# POST /api/telegram/webhook  (no auth — called by Telegram)
# ---------------------------------------------------------------------------

@router.post("/webhook")
async def webhook(request: Request) -> dict:
    """
    Receive Telegram webhook updates.
    Expects JSON: {"message": {"chat": {"id": 123}, "from": {"username": "user"}, "text": "/start CODE"}}
    """
    try:
        body = await request.json()
    except Exception:
        return {"ok": True}

    try:
        message = body.get("message", {})
        text: str = message.get("text", "")
        chat_id = str(message.get("chat", {}).get("id", ""))
        from_user = message.get("from", {})
        username: Optional[str] = from_user.get("username")

        if not text.startswith("/start "):
            return {"ok": True}

        parts = text.strip().split(None, 1)
        if len(parts) < 2:
            return {"ok": True}

        code = parts[1].strip()
        user_id = _pending_codes.pop(code, None)

        if not user_id:
            logger.warning("telegram_webhook_unknown_code", extra={"code": code})
            await send_message(chat_id, "Invalid or expired code. Please generate a new one in the app.")
            return {"ok": True}

        # Persist to DB
        from app.db.database import get_session
        from app.db.models import TelegramChat
        from sqlalchemy import select, delete as sa_delete

        async with get_session() as session:
            # Remove any existing connection for this user
            await session.execute(
                sa_delete(TelegramChat).where(TelegramChat.user_id == user_id)
            )
            chat = TelegramChat(
                user_id=user_id,
                chat_id=chat_id,
                username=username,
                connected_at=datetime.now(UTC),
            )
            session.add(chat)
            await session.commit()

        logger.info("telegram_chat_connected", extra={"user_id": user_id, "chat_id": chat_id})
        await send_message(
            chat_id,
            f"Connected to <b>Neural Trading OS</b>.\n\nYou will now receive price alerts and AI signal notifications here.",
        )

    except Exception as e:
        logger.warning("telegram_webhook_error", extra={"reason": str(e)})

    return {"ok": True}


# ---------------------------------------------------------------------------
# POST /api/telegram/test
# ---------------------------------------------------------------------------

@router.post("/test")
async def send_test(current_user: UserInfo = Depends(get_current_user)) -> dict:
    """Send a test notification to the connected Telegram chat."""
    user_id = current_user.username
    try:
        from app.db.database import get_session
        from app.db.models import TelegramChat
        from sqlalchemy import select

        async with get_session() as session:
            result = await session.execute(
                select(TelegramChat).where(TelegramChat.user_id == user_id)
            )
            chat = result.scalar_one_or_none()

        if not chat:
            raise HTTPException(status_code=404, detail="No Telegram connection found. Please connect first.")

        sent = await send_message(
            chat.chat_id,
            "Neural Trading OS — test notification.\n\nYour Telegram notifications are working correctly.",
        )
        return {"sent": sent}
    except HTTPException:
        raise
    except Exception as e:
        logger.warning("telegram_test_error", extra={"reason": str(e)})
        raise HTTPException(status_code=500, detail="Failed to send test message")


# ---------------------------------------------------------------------------
# DELETE /api/telegram/disconnect
# ---------------------------------------------------------------------------

@router.delete("/disconnect")
async def disconnect(current_user: UserInfo = Depends(get_current_user)) -> dict:
    """Remove the Telegram connection for the current user."""
    user_id = current_user.username
    try:
        from app.db.database import get_session
        from app.db.models import TelegramChat
        from sqlalchemy import delete as sa_delete

        async with get_session() as session:
            await session.execute(
                sa_delete(TelegramChat).where(TelegramChat.user_id == user_id)
            )
            await session.commit()

        logger.info("telegram_chat_disconnected", extra={"user_id": user_id})
        return {"disconnected": True}
    except Exception as e:
        logger.warning("telegram_disconnect_error", extra={"reason": str(e)})
        raise HTTPException(status_code=500, detail="Failed to disconnect")


# ---------------------------------------------------------------------------
# POST /api/telegram/setup-webhook
# ---------------------------------------------------------------------------

@router.post("/setup-webhook")
async def setup_webhook(
    request: Request,
    current_user: UserInfo = Depends(get_current_user),
) -> dict:
    """
    Register the webhook URL with Telegram automatically.
    Uses the request's base URL to construct the webhook target.
    Can be overridden via X-Backend-Url header for Railway deployments.
    """
    if not await is_configured_async():
        raise HTTPException(status_code=503, detail="TELEGRAM_BOT_TOKEN not configured")

    # Determine backend base URL
    override = request.headers.get("X-Backend-Url")
    if override:
        base = override.rstrip("/")
    else:
        base = str(request.base_url).rstrip("/")

    webhook_url = f"{base}/api/telegram/webhook"
    result = await set_webhook(webhook_url)

    logger.info("telegram_webhook_setup", extra={"url": webhook_url, "ok": result.get("ok")})

    if not result.get("ok"):
        raise HTTPException(
            status_code=502,
            detail=f"Telegram rejected webhook: {result.get('description', 'unknown error')}",
        )
    return {"ok": True, "webhook_url": webhook_url, "description": result.get("description", "")}
