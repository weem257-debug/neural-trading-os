"""add_analysis_watchlist_table

Revision ID: e6b2c3d4e5f7
Revises: e5a1b2c3d4f6
Create Date: 2026-07-01 10:05:00.000000

New feature: per-user watchlist for the live market-analysis endpoints
(GET/PUT /api/analysis/watchlist). Additive — new table only, no changes to
existing schema.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e6b2c3d4e5f7"
down_revision: Union[str, Sequence[str], None] = "e5a1b2c3d4f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "analysis_watchlist",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("owner_username", sa.String(100), nullable=False),
        sa.Column("symbol", sa.String(20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_analysis_watchlist_owner_username",
        "analysis_watchlist",
        ["owner_username"],
    )


def downgrade() -> None:
    op.drop_index("ix_analysis_watchlist_owner_username", table_name="analysis_watchlist")
    op.drop_table("analysis_watchlist")
