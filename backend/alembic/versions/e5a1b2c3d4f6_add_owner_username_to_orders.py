"""add_owner_username_to_orders

Revision ID: e5a1b2c3d4f6
Revises: d7f1a2b3c4e5
Create Date: 2026-07-01 10:00:00.000000

P0-3/P0-4 multi-tenancy: scope paper-trading order history to the submitting
user. Additive, nullable, safe for zero-downtime deploy — existing rows keep
owner_username=NULL (a documented residual gap for pre-migration history;
new orders are always written with the authenticated user's username, see
app/services/nautilus/client.py).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e5a1b2c3d4f6"
down_revision: Union[str, Sequence[str], None] = "d7f1a2b3c4e5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "orders",
        sa.Column("owner_username", sa.String(100), nullable=True),
    )
    op.create_index(
        "ix_orders_owner_username",
        "orders",
        ["owner_username"],
    )


def downgrade() -> None:
    op.drop_index("ix_orders_owner_username", table_name="orders")
    op.drop_column("orders", "owner_username")
