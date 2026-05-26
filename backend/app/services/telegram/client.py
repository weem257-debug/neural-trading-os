"""Telegram Bot API client — send messages and manage webhook."""
import httpx
import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)

# Module-level fallback from env (used if DB has no override)
_ENV_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
_ENV_BOT_NAME = os.getenv("TELEGRAM_BOT_NAME", "NeuralTradingBot")


async def _get_token() -> str:
    """Return token: DB override first, then env var."""
    try:
        from app.services.credentials import get_credential
        val = await get_credential("TELEGRAM_BOT_TOKEN")
        return val or ""
    except Exception:
        return _ENV_TOKEN


def is_configured() -> bool:
    """Sync check — uses env var only (for startup/import-time calls)."""
    return bool(_ENV_TOKEN)


async def is_configured_async() -> bool:
    """Async check — includes DB-stored token."""
    return bool(await _get_token())


def _api_url(method: str, token: str) -> str:
    return f"https://api.telegram.org/bot{token}/{method}"


async def send_message(chat_id: str, text: str, parse_mode: str = "HTML") -> bool:
    """Send a message to a Telegram chat. Returns True on success."""
    token = await _get_token()
    if not token:
        logger.warning("telegram_not_configured")
        return False
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(_api_url("sendMessage", token), json={
                "chat_id": chat_id,
                "text": text,
                "parse_mode": parse_mode,
            })
            return resp.status_code == 200
    except Exception as e:
        logger.warning("telegram_send_failed", extra={"reason": str(e)})
        return False


async def set_webhook(url: str) -> dict:
    """Register webhook URL with Telegram. Returns Telegram API response dict."""
    token = await _get_token()
    if not token:
        return {"ok": False, "description": "TELEGRAM_BOT_TOKEN not configured"}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(_api_url("setWebhook", token), json={"url": url})
            data = resp.json()
            if not data.get("ok"):
                logger.warning("telegram_webhook_set_failed", extra={"response": data})
            return data
    except Exception as e:
        logger.warning("telegram_webhook_set_failed", extra={"reason": str(e)})
        return {"ok": False, "description": str(e)}


async def get_bot_name() -> str:
    """Get bot username from API (falls back to env var)."""
    token = await _get_token()
    if not token:
        return _ENV_BOT_NAME
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(_api_url("getMe", token))
            if resp.status_code == 200:
                return resp.json().get("result", {}).get("username", _ENV_BOT_NAME)
    except Exception:
        pass
    return _ENV_BOT_NAME
