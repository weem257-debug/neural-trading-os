"""
F-14 — refresh-token family rotation with replay detection.

Gated behind ``settings.REFRESH_ROTATION_ENABLED`` at the call sites (auth.py).
Only SHA-256 hashes of tokens are persisted. See app.db.models.RefreshToken and
SECURITY.md §4.1.
"""
from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, UTC
from typing import Optional

from sqlalchemy import select, update

from app.core.config import settings
from app.db.database import get_session
from app.db.models import RefreshToken


class RefreshReplayError(Exception):
    """A previously-rotated/revoked refresh token was presented again (theft)."""

    def __init__(self, username: str):
        self.username = username
        super().__init__(f"refresh token replay for user {username}")


class RefreshInvalidError(Exception):
    """The refresh token is expired or lost a concurrent rotation race."""


def _hash(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _new_raw() -> str:
    return secrets.token_urlsafe(48)


async def issue(username: str, *, family_id: Optional[str] = None, generation: int = 1) -> str:
    """Create a refresh-token row (storing only its hash) and return the raw token."""
    raw = _new_raw()
    now = datetime.now(UTC)
    row = RefreshToken(
        username=username,
        family_id=family_id or str(uuid.uuid4()),
        generation=generation,
        token_hash=_hash(raw),
        issued_at=now,
        expires_at=now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    )
    async with get_session() as session:
        session.add(row)
        await session.commit()
    return raw


async def _revoke_family(session, family_id: str) -> None:
    await session.execute(
        update(RefreshToken)
        .where(RefreshToken.family_id == family_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=datetime.now(UTC))
    )


async def revoke_user(username: str) -> None:
    """Revoke ALL of a user's refresh tokens (logout / global revoke)."""
    async with get_session() as session:
        await session.execute(
            update(RefreshToken)
            .where(RefreshToken.username == username, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=datetime.now(UTC))
        )
        await session.commit()


async def rotate(raw_token: str) -> Optional[tuple[str, str]]:
    """
    Rotate a presented refresh token.

    Returns ``(new_raw_token, username)`` on success.
    Returns ``None`` when the token is UNKNOWN (caller may dual-read/fall back —
    e.g. a legacy session that predates rotation).
    Raises :class:`RefreshReplayError` when an already-rotated/revoked token of a
    live family is replayed (→ caller must also bump token_version).
    Raises :class:`RefreshInvalidError` when expired or on a lost rotation race.
    """
    if not raw_token:
        return None
    h = _hash(raw_token)
    now = datetime.now(UTC)
    async with get_session() as session:
        row = (await session.execute(
            select(RefreshToken).where(RefreshToken.token_hash == h)
        )).scalar_one_or_none()
        if row is None:
            return None  # unknown → dual-read fallback

        # Replay: this token was already rotated away or explicitly revoked.
        if row.replaced_by is not None or row.revoked_at is not None:
            await _revoke_family(session, row.family_id)
            await session.commit()
            raise RefreshReplayError(row.username)

        expires_at = row.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=UTC)
        if expires_at < now:
            row.revoked_at = now
            await session.commit()
            raise RefreshInvalidError("expired")

        # Atomically claim the rotation (guards concurrent-refresh race).
        new_raw = _new_raw()
        new_hash = _hash(new_raw)
        claimed = await session.execute(
            update(RefreshToken)
            .where(RefreshToken.id == row.id, RefreshToken.revoked_at.is_(None),
                   RefreshToken.replaced_by.is_(None))
            .values(revoked_at=now, replaced_by=new_hash)
        )
        if claimed.rowcount == 0:
            await session.rollback()
            raise RefreshInvalidError("rotation race lost")

        session.add(RefreshToken(
            username=row.username,
            family_id=row.family_id,
            generation=row.generation + 1,
            token_hash=new_hash,
            issued_at=now,
            expires_at=now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        ))
        await session.commit()
        return new_raw, row.username
