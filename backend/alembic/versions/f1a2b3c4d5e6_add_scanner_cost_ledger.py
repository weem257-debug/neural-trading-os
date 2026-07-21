"""add_scanner_cost_ledger

Revision ID: f1a2b3c4d5e6
Revises: e6b2c3d4e5f7
Create Date: 2026-07-21 12:00:00.000000

24/7 market scanner (ADR 0003) money-critical ledger:
  - scan_cost_entries : immutable per-LLM-call cost ledger
  - scan_cost_daily   : per-UTC-day spend aggregate the hard cap is checked against

Additive — two new tables only, no changes to existing schema.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "e6b2c3d4e5f7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Mirrors app.db.models._MONEY (Numeric(20, 8)); asdecimal handled at ORM layer.
_MONEY = sa.Numeric(20, 8)


def upgrade() -> None:
    op.create_table(
        "scan_cost_entries",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("symbol", sa.String(20), nullable=False),
        sa.Column("model", sa.String(60), nullable=False),
        sa.Column("input_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("output_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("cache_read_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("cache_write_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("cost_usd", _MONEY, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_scan_cost_entries_symbol", "scan_cost_entries", ["symbol"])
    op.create_index("ix_scan_cost_entries_created_at", "scan_cost_entries", ["created_at"])

    op.create_table(
        "scan_cost_daily",
        sa.Column("date_utc", sa.String(10), primary_key=True),
        sa.Column("spent_usd", _MONEY, nullable=False, server_default="0"),
        sa.Column("analyses_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("scan_cost_daily")
    op.drop_index("ix_scan_cost_entries_created_at", table_name="scan_cost_entries")
    op.drop_index("ix_scan_cost_entries_symbol", table_name="scan_cost_entries")
    op.drop_table("scan_cost_entries")
