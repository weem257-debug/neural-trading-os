"""
Database Engine & Session Factory
----------------------------------
Supports both SQLite (development) and PostgreSQL (production via DATABASE_URL).

Priority:
  1. DATABASE_URL env var  → PostgreSQL (asyncpg driver)
  2. TRADING_DB_PATH       → SQLite at custom path
  3. default               → SQLite next to project root

Usage:
    from app.db.database import get_session

    async with get_session() as session:
        session.add(record)
        await session.commit()
"""
import logging
import os
from contextlib import asynccontextmanager
from typing import AsyncIterator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Resolve DB URL — PostgreSQL takes priority over SQLite
# ---------------------------------------------------------------------------

_raw_database_url = os.getenv("DATABASE_URL", "")

if _raw_database_url and ("postgres" in _raw_database_url or "postgresql" in _raw_database_url):
    # Railway / Heroku supply postgres:// — SQLAlchemy asyncpg needs postgresql+asyncpg://
    _DB_URL = (
        _raw_database_url
        .replace("postgres://", "postgresql+asyncpg://", 1)
        .replace("postgresql://", "postgresql+asyncpg://", 1)
    )
    _engine = create_async_engine(
        _DB_URL,
        echo=os.getenv("SQL_ECHO", "false").lower() == "true",
        future=True,
        pool_size=10,
        max_overflow=20,
        pool_pre_ping=True,
    )
    logger.info("db_engine_postgresql")
else:
    # SQLite fallback for local development
    _DB_PATH = os.getenv(
        "TRADING_DB_PATH",
        os.path.join(os.path.dirname(__file__), "..", "..", "..", "trading_dashboard.db"),
    )
    _DB_URL = f"sqlite+aiosqlite:///{os.path.abspath(_DB_PATH)}"
    _engine = create_async_engine(
        _DB_URL,
        echo=os.getenv("SQL_ECHO", "false").lower() == "true",
        future=True,
        connect_args={"check_same_thread": False},
    )
    logger.info("db_engine_sqlite", path=_DB_URL)

# ---------------------------------------------------------------------------
# Session factory
# ---------------------------------------------------------------------------

_AsyncSessionFactory: async_sessionmaker[AsyncSession] = async_sessionmaker(
    _engine,
    expire_on_commit=False,
    class_=AsyncSession,
)


# ---------------------------------------------------------------------------
# Declarative base (shared with models.py)
# ---------------------------------------------------------------------------

class Base(DeclarativeBase):
    pass


# ---------------------------------------------------------------------------
# Public helpers
# ---------------------------------------------------------------------------

@asynccontextmanager
async def get_session() -> AsyncIterator[AsyncSession]:
    """Async context-manager that yields a usable DB session."""
    async with _AsyncSessionFactory() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


async def create_all_tables() -> None:
    """Create all ORM-registered tables if they do not exist yet."""
    from app.db import models  # noqa: F401 — registers all ORM models

    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("db_tables_ready", extra={"db_url": _DB_URL})
