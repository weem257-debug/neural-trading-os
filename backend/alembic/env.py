"""
Alembic env.py — configured for Trading Dashboard
---------------------------------------------------
- Reads DATABASE_URL from Settings (strips async driver for sync migrations)
- Imports all SQLAlchemy models via Base.metadata (autogenerate support)
"""
import os
import sys
from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool

from alembic import context

# ---------------------------------------------------------------------------
# Make sure the backend app package is importable
# ---------------------------------------------------------------------------
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

# ---------------------------------------------------------------------------
# Alembic config object
# ---------------------------------------------------------------------------
config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# ---------------------------------------------------------------------------
# Import models so they register with Base.metadata
# ---------------------------------------------------------------------------
from app.db.database import Base  # noqa: E402
from app.db import models  # noqa: F401, E402  (registers all ORM models)

target_metadata = Base.metadata

# ---------------------------------------------------------------------------
# Resolve database URL (sync driver for Alembic)
# ---------------------------------------------------------------------------
def _get_sync_url() -> str:
    """Return a *sync* driver URL for Alembic (no asyncpg / aiosqlite).

    For SQLite (local/test/CI) the resolved file MUST be the exact same one the
    app's async engine opens (see app/db/database.py). Otherwise Alembic migrates
    one file while the app reads another, producing "no such column" errors even
    though `alembic upgrade head` reports success.
    """
    try:
        from app.core.config import settings
        db_url: str = settings.DATABASE_URL
    except Exception:
        db_url = os.getenv("DATABASE_URL", "sqlite:///./trading_dashboard.db")

    # Postgres (Railway/Heroku): swap async driver for the sync psycopg2 driver.
    if "postgres" in db_url:
        return db_url.replace("postgresql+asyncpg://", "postgresql+psycopg2://")

    # SQLite: mirror app/db/database.py path resolution exactly — honor
    # TRADING_DB_PATH, else dashboard/trading_dashboard.db (one level above
    # the backend dir, NOT cwd-relative).
    db_path = os.getenv(
        "TRADING_DB_PATH",
        os.path.join(os.path.dirname(__file__), "..", "..", "trading_dashboard.db"),
    )
    return f"sqlite:///{os.path.abspath(db_path)}"


# Override the sqlalchemy.url in alembic.ini at runtime
config.set_main_option("sqlalchemy.url", _get_sync_url())


# ---------------------------------------------------------------------------
# Offline migrations
# ---------------------------------------------------------------------------
def run_migrations_offline() -> None:
    """Emit SQL to stdout without connecting to the DB."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


# ---------------------------------------------------------------------------
# Online migrations
# ---------------------------------------------------------------------------
def run_migrations_online() -> None:
    """Connect to DB and apply migrations."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
