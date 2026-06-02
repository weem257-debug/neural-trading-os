"""add signal_insight_usage attribution table

Revision ID: b7c1d2e3f4a5
Revises: c5d6e7f8a9b0
Create Date: 2026-06-02

Records exactly which YoutubeInsight rows were injected into the prompt that
produced a given signal, so the self-learning feedback loop can validate the
insights that actually influenced a trade instead of guessing by recency.
"""
from alembic import op
import sqlalchemy as sa

revision = 'b7c1d2e3f4a5'
down_revision = 'c5d6e7f8a9b0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'signal_insight_usage',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('signal_id', sa.String(36), nullable=False),
        sa.Column('insight_id', sa.Integer(), nullable=False),
        sa.Column('rank', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_signal_insight_usage_signal_id', 'signal_insight_usage', ['signal_id'])
    op.create_index('ix_signal_insight_usage_insight_id', 'signal_insight_usage', ['insight_id'])
    op.create_index('ix_signal_insight_usage_created_at', 'signal_insight_usage', ['created_at'])


def downgrade() -> None:
    op.drop_index('ix_signal_insight_usage_created_at', table_name='signal_insight_usage')
    op.drop_index('ix_signal_insight_usage_insight_id', table_name='signal_insight_usage')
    op.drop_index('ix_signal_insight_usage_signal_id', table_name='signal_insight_usage')
    op.drop_table('signal_insight_usage')
