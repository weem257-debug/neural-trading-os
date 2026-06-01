"""add_owner_username_to_learning

Revision ID: c5d6e7f8a9b0
Revises: b4c5d6e7f8a9
Create Date: 2026-05-28 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c5d6e7f8a9b0'
down_revision: Union[str, Sequence[str], None] = 'b4c5d6e7f8a9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "trade_learnings",
        sa.Column("owner_username", sa.String(100), nullable=True),
    )
    op.create_index(
        "ix_trade_learnings_owner_username",
        "trade_learnings",
        ["owner_username"],
    )

    op.add_column(
        "learning_jobs",
        sa.Column("owner_username", sa.String(100), nullable=True),
    )
    op.create_index(
        "ix_learning_jobs_owner_username",
        "learning_jobs",
        ["owner_username"],
    )


def downgrade() -> None:
    op.drop_index("ix_learning_jobs_owner_username", table_name="learning_jobs")
    op.drop_column("learning_jobs", "owner_username")

    op.drop_index("ix_trade_learnings_owner_username", table_name="trade_learnings")
    op.drop_column("trade_learnings", "owner_username")
