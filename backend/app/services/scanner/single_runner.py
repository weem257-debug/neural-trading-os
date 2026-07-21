"""
Single-runner guard for the 24/7 market scanner (ADR 0003) — money-critical.

Railway may run more than one replica of the backend. Without coordination each
replica would run the scan loop, producing duplicate signals AND duplicate
(paid) Sonnet calls that each count against the daily cap. A Postgres
*session-level advisory lock* elects exactly one runner: only the replica that
wins ``pg_try_advisory_lock`` proceeds; the others skip the cycle.

The lock is held for the lifetime of the DB session/connection it was taken on,
so the caller must keep that session open for the duration of the scan cycle
and let it close (releasing the lock) at the end.

On non-Postgres dialects (SQLite dev/test) there is only ever one process, so
the guard is a no-op that always grants the lock.
"""
import logging

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# Arbitrary but stable 64-bit advisory-lock key, unique to the scanner.
SCAN_LOCK_KEY = 875219004417


async def try_acquire_scan_lock(session: AsyncSession) -> bool:
    """
    Non-blocking attempt to become the sole scanner runner.

    Returns True if this process now holds (or, on non-Postgres dialects,
    is granted by default) the scan lock; False if another replica already
    holds it and this cycle should be skipped.
    """
    dialect = ""
    try:
        dialect = session.bind.dialect.name
    except Exception:
        dialect = ""

    if dialect != "postgresql":
        logger.debug(
            "scan_lock_skipped_non_postgres_dialect", extra={"dialect": dialect}
        )
        return True

    result = await session.execute(
        text("SELECT pg_try_advisory_lock(:key)"), {"key": SCAN_LOCK_KEY}
    )
    acquired = bool(result.scalar())
    logger.info("scan_lock_acquire_result", extra={"acquired": acquired})
    return acquired
