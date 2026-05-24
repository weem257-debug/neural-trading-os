"""add_waitlist_table

Revision ID: a7f3d91b2e04
Revises: e20379f03c3a
Create Date: 2026-05-23 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a7f3d91b2e04'
down_revision: Union[str, Sequence[str], None] = 'e20379f03c3a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'waitlist',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('email', sa.String(length=254), nullable=False),
        sa.Column('plan_interest', sa.String(length=20), nullable=True),
        sa.Column('source', sa.String(length=50), nullable=False),
        sa.Column('joined_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_waitlist_email'), 'waitlist', ['email'], unique=True)
    op.create_index(op.f('ix_waitlist_joined_at'), 'waitlist', ['joined_at'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_waitlist_joined_at'), table_name='waitlist')
    op.drop_index(op.f('ix_waitlist_email'), table_name='waitlist')
    op.drop_table('waitlist')
