"""
Credential resolver — checks DB first, then env var.

In-app settings (stored via /api/settings/credentials) override env vars,
so users can configure keys from the Settings UI without touching Railway.
"""
import os
import logging
from typing import Optional

logger = logging.getLogger(__name__)

_ALLOWED_KEYS = frozenset({
    "MINTOS_API_KEY",
    "BONDORA_API_KEY",
    "PEERBERRY_EMAIL",
    "PEERBERRY_PASSWORD",
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_BOT_NAME",
    "STRIPE_SECRET_KEY",
    "ALPACA_API_KEY",
    "ALPACA_SECRET_KEY",
    "ANTHROPIC_API_KEY",
})


async def get_credential(key: str) -> Optional[str]:
    """Return credential value: DB row first, then os.environ fallback."""
    try:
        from app.db.database import _AsyncSessionFactory
        from app.db.models import AppSecret
        async with _AsyncSessionFactory() as session:
            row = await session.get(AppSecret, key)
            if row and row.value:
                return row.value
    except Exception as exc:
        logger.debug("credential_db_lookup_failed", extra={"key": key, "reason": str(exc)})
    return os.getenv(key) or None


async def set_credential(key: str, value: str) -> None:
    """Upsert a credential in the DB."""
    if key not in _ALLOWED_KEYS:
        raise ValueError(f"Key '{key}' is not in the allowed list")
    from datetime import datetime, UTC
    from sqlalchemy.dialects.sqlite import insert as sqlite_insert
    from sqlalchemy.dialects.postgresql import insert as pg_insert
    from app.db.database import _AsyncSessionFactory
    from app.db.models import AppSecret

    async with _AsyncSessionFactory() as session:
        async with session.begin():
            existing = await session.get(AppSecret, key)
            if existing:
                existing.value = value
                existing.updated_at = datetime.now(UTC)
            else:
                session.add(AppSecret(key=key, value=value))


async def delete_credential(key: str) -> bool:
    """Delete a credential from the DB. Returns True if it existed."""
    from sqlalchemy import delete
    from app.db.database import _AsyncSessionFactory
    from app.db.models import AppSecret

    async with _AsyncSessionFactory() as session:
        async with session.begin():
            result = await session.execute(
                delete(AppSecret).where(AppSecret.key == key)
            )
            return result.rowcount > 0


async def get_all_statuses() -> dict[str, str]:
    """Return configured/not_set status for all allowed keys."""
    from app.db.database import _AsyncSessionFactory
    from app.db.models import AppSecret
    from sqlalchemy import select

    db_keys: set[str] = set()
    try:
        async with _AsyncSessionFactory() as session:
            result = await session.execute(select(AppSecret.key))
            db_keys = {row[0] for row in result.fetchall() if row[0]}
    except Exception:
        pass

    statuses: dict[str, str] = {}
    for key in _ALLOWED_KEYS:
        if key in db_keys or os.getenv(key):
            statuses[key] = "configured"
        else:
            statuses[key] = "not_set"
    return statuses
