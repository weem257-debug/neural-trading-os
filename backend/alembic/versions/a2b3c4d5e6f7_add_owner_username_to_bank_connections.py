"""add_owner_username_to_bank_connections

Revision ID: a2b3c4d5e6f7
Revises: f0a1b2c3d4e5
Create Date: 2026-05-28 14:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a2b3c4d5e6f7'
down_revision: Union[str, Sequence[str], None] = 'f0a1b2c3d4e5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "bank_connections",
        sa.Column("owner_username", sa.String(100), nullable=True),
    )
    op.create_index(
        "ix_bank_connections_owner_username",
        "bank_connections",
        ["owner_username"],
    )


def downgrade() -> None:
    op.drop_index("ix_bank_connections_owner_username", table_name="bank_connections")
    op.drop_column("bank_connections", "owner_username")
