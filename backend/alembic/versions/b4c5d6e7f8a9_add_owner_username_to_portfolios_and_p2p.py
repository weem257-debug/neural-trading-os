"""add_owner_username_to_portfolios_and_p2p

Revision ID: b4c5d6e7f8a9
Revises: a2b3c4d5e6f7
Create Date: 2026-05-28 14:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b4c5d6e7f8a9'
down_revision: Union[str, Sequence[str], None] = 'a2b3c4d5e6f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "portfolios",
        sa.Column("owner_username", sa.String(100), nullable=True),
    )
    op.create_index(
        "ix_portfolios_owner_username",
        "portfolios",
        ["owner_username"],
    )

    op.add_column(
        "p2p_snapshots",
        sa.Column("owner_username", sa.String(100), nullable=True),
    )
    op.create_index(
        "ix_p2p_snapshots_owner_username",
        "p2p_snapshots",
        ["owner_username"],
    )


def downgrade() -> None:
    op.drop_index("ix_p2p_snapshots_owner_username", table_name="p2p_snapshots")
    op.drop_column("p2p_snapshots", "owner_username")

    op.drop_index("ix_portfolios_owner_username", table_name="portfolios")
    op.drop_column("portfolios", "owner_username")
