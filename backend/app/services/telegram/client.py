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


async def resolve_webhook_secret() -> str:
    """
    Resolve the Telegram webhook ``secret_token`` (P1 audit finding).

    Telegram echoes this value back in the ``X-Telegram-Bot-Api-Secret-Token``
    header on every webhook delivery, letting the receiver prove the request
    genuinely came from Telegram and reject spoofed updates.

    Precedence:
      1. Explicit ``TELEGRAM_WEBHOOK_SECRET`` setting, when configured.
      2. A stable secret DERIVED from the bot token via HMAC-SHA256 — this makes
         verification secure-by-default with no extra configuration (the bot
         token is already a shared secret between us and Telegram).

    Returns "" only when no bot token is configured at all (bot disabled).
    The value is [0-9a-f]{64}, well within Telegram's allowed 1-256 chars of
    ``[A-Za-z0-9_-]``.
    """
    import hashlib
    import hmac as _hmac

    try:
        from app.core.config import settings
        explicit = (getattr(settings, "TELEGRAM_WEBHOOK_SECRET", "") or "").strip()
        if explicit:
            return explicit
    except Exception:
        pass

    token = await _get_token()
    if not token:
        return ""
    return _hmac.new(token.encode(), b"telegram-webhook-secret-v1", hashlib.sha256).hexdigest()


async def send_message(
    chat_id: str,
    text: str,
    parse_mode: str = "HTML",
    reply_markup: dict | None = None,
) -> bool:
    """Send a message to a Telegram chat. Returns True on success."""
    token = await _get_token()
    if not token:
        logger.warning("telegram_not_configured")
        return False
    try:
        payload: dict = {"chat_id": chat_id, "text": text, "parse_mode": parse_mode}
        if reply_markup:
            payload["reply_markup"] = reply_markup
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(_api_url("sendMessage", token), json=payload)
            return resp.status_code == 200
    except Exception as e:
        logger.warning("telegram_send_failed", extra={"reason": str(e)})
        return False


def inline_keyboard(*rows: list[dict]) -> dict:
    """Build a Telegram inline_keyboard reply_markup from rows of button dicts."""
    return {"inline_keyboard": list(rows)}


async def set_webhook(url: str) -> dict:
    """Register webhook URL with Telegram. Returns Telegram API response dict."""
    token = await _get_token()
    if not token:
        return {"ok": False, "description": "TELEGRAM_BOT_TOKEN not configured"}
    try:
        payload: dict = {"url": url}
        # Register the secret token so Telegram echoes it back on every delivery
        # and the webhook handler can reject spoofed updates (P1 audit finding).
        secret = await resolve_webhook_secret()
        if secret:
            payload["secret_token"] = secret
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(_api_url("setWebhook", token), json=payload)
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


async def get_webhook_info() -> dict:
    """Return current webhook URL and pending update count from Telegram."""
    token = await _get_token()
    if not token:
        return {"url": "", "pending_update_count": 0}
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(_api_url("getWebhookInfo", token))
            if resp.status_code == 200:
                return resp.json().get("result", {"url": "", "pending_update_count": 0})
    except Exception:
        pass
    return {"url": "", "pending_update_count": 0}
