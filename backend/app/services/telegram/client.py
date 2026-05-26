"""Telegram Bot API client — send messages and manage webhook."""
import httpx
import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_BOT_NAME = os.getenv("TELEGRAM_BOT_NAME", "NeuralTradingBot")


def _api_url(method: str) -> str:
    return f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/{method}"


def is_configured() -> bool:
    return bool(TELEGRAM_BOT_TOKEN)


async def send_message(chat_id: str, text: str, parse_mode: str = "HTML") -> bool:
    """Send a message to a Telegram chat. Returns True on success."""
    if not is_configured():
        logger.warning("telegram_not_configured")
        return False
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(_api_url("sendMessage"), json={
                "chat_id": chat_id,
                "text": text,
                "parse_mode": parse_mode,
            })
            return resp.status_code == 200
    except Exception as e:
        logger.warning("telegram_send_failed", extra={"reason": str(e)})
        return False


async def set_webhook(url: str) -> bool:
    """Register webhook URL with Telegram."""
    if not is_configured():
        return False
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(_api_url("setWebhook"), json={"url": url})
            return resp.status_code == 200
    except Exception as e:
        logger.warning("telegram_webhook_set_failed", extra={"reason": str(e)})
        return False


async def get_bot_name() -> str:
    """Get bot username from API (falls back to env var)."""
    if not is_configured():
        return TELEGRAM_BOT_NAME
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(_api_url("getMe"))
            if resp.status_code == 200:
                return resp.json().get("result", {}).get("username", TELEGRAM_BOT_NAME)
    except Exception:
        pass
    return TELEGRAM_BOT_NAME
