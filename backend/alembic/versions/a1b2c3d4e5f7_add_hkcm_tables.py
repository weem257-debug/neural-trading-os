"""add_hkcm_tables

Revision ID: a1b2c3d4e5f7
Revises: c3d4e5f6a7b8
Create Date: 2026-08-27 17:30:00.000000

New feature: ingestion of the HKCM ("Hopf-Klinkmüller Capital Management")
newsletter into structured per-instrument analyses. Additive — two new tables,
no changes to existing schema.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a1b2c3d4e5f7"
down_revision: Union[str, Sequence[str], None] = "c3d4e5f6a7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Mirrors app.db.models._MONEY so prices land in NUMERIC on Postgres.
_MONEY = sa.Numeric(20, 8, asdecimal=False)


def upgrade() -> None:
    op.create_table(
        "hkcm_issues",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("owner_username", sa.String(100), nullable=False),
        sa.Column("message_id", sa.String(255), nullable=True),
        sa.Column("content_hash", sa.String(64), nullable=False),
        sa.Column("subject", sa.String(255), nullable=False, server_default=""),
        sa.Column("category", sa.String(100), nullable=False, server_default=""),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("news", sa.Text(), nullable=False, server_default=""),
        sa.Column("upcoming", sa.String(500), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_hkcm_issues_owner_username", "hkcm_issues", ["owner_username"])
    op.create_index("ix_hkcm_issues_message_id", "hkcm_issues", ["message_id"])
    op.create_index("ix_hkcm_issues_content_hash", "hkcm_issues", ["content_hash"])
    op.create_index("ix_hkcm_issues_sent_at", "hkcm_issues", ["sent_at"])
    # Re-import of the same mail must be a no-op rather than a duplicate row.
    op.create_index(
        "uq_hkcm_issues_owner_hash",
        "hkcm_issues",
        ["owner_username", "content_hash"],
        unique=True,
    )

    op.create_table(
        "hkcm_analyses",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("issue_id", sa.Integer(), nullable=False),
        sa.Column("owner_username", sa.String(100), nullable=False),
        sa.Column("ticker", sa.String(20), nullable=False),
        sa.Column("isin", sa.String(12), nullable=False, server_default=""),
        sa.Column("name", sa.String(120), nullable=False, server_default=""),
        sa.Column("headline", sa.String(255), nullable=False, server_default=""),
        sa.Column("entry", _MONEY, nullable=True),
        sa.Column("entry_kind", sa.String(20), nullable=False, server_default=""),
        sa.Column("entry_potential", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("stop", _MONEY, nullable=True),
        sa.Column("stop_note", sa.String(120), nullable=False, server_default=""),
        sa.Column("partial_exit", _MONEY, nullable=True),
        sa.Column("risk_note", sa.String(255), nullable=False, server_default=""),
        sa.Column("what_happened", sa.Text(), nullable=False, server_default=""),
        sa.Column("primary_scenario", sa.Text(), nullable=False, server_default=""),
        sa.Column("alternative_scenario", sa.Text(), nullable=False, server_default=""),
        sa.Column("alternative_probability", sa.Integer(), nullable=True),
        sa.Column("outlook", sa.Text(), nullable=False, server_default=""),
        sa.Column("opportunities", sa.Text(), nullable=False, server_default=""),
        sa.Column("supports_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("resistances_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("target_zones_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("chart_urls_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_hkcm_analyses_issue_id", "hkcm_analyses", ["issue_id"])
    op.create_index("ix_hkcm_analyses_owner_username", "hkcm_analyses", ["owner_username"])
    op.create_index("ix_hkcm_analyses_ticker", "hkcm_analyses", ["ticker"])
    op.create_index("ix_hkcm_analyses_sent_at", "hkcm_analyses", ["sent_at"])
    # "newest analysis for ticker X of user Y" — the hot read path.
    op.create_index(
        "ix_hkcm_analyses_owner_ticker_sent",
        "hkcm_analyses",
        ["owner_username", "ticker", "sent_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_hkcm_analyses_owner_ticker_sent", table_name="hkcm_analyses")
    op.drop_index("ix_hkcm_analyses_sent_at", table_name="hkcm_analyses")
    op.drop_index("ix_hkcm_analyses_ticker", table_name="hkcm_analyses")
    op.drop_index("ix_hkcm_analyses_owner_username", table_name="hkcm_analyses")
    op.drop_index("ix_hkcm_analyses_issue_id", table_name="hkcm_analyses")
    op.drop_table("hkcm_analyses")

    op.drop_index("uq_hkcm_issues_owner_hash", table_name="hkcm_issues")
    op.drop_index("ix_hkcm_issues_sent_at", table_name="hkcm_issues")
    op.drop_index("ix_hkcm_issues_content_hash", table_name="hkcm_issues")
    op.drop_index("ix_hkcm_issues_message_id", table_name="hkcm_issues")
    op.drop_index("ix_hkcm_issues_owner_username", table_name="hkcm_issues")
    op.drop_table("hkcm_issues")
