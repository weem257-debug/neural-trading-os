"""add_user_id_to_signals

Revision ID: b3c7e91d4a02
Revises: f1b4c82d9e35
Create Date: 2026-05-27 10:00:00.000000

Adds nullable user_id to signals table for per-user quota tracking.
Existing rows get NULL, which is treated as the legacy single-user
"admin" account in _check_signal_quota().
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b3c7e91d4a02'
down_revision: Union[str, Sequence[str], None] = 'f1b4c82d9e35'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'signals',
        sa.Column('user_id', sa.String(100), nullable=True, index=True),
    )
    # Backfill existing rows to "admin" so quota counts remain correct
    op.execute("UPDATE signals SET user_id = 'admin' WHERE user_id IS NULL")


def downgrade() -> None:
    op.drop_column('signals', 'user_id')
