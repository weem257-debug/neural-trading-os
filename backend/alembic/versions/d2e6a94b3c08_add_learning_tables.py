"""add learning tables (youtube_insights, trade_learnings, learning_jobs)

Revision ID: d2e6a94b3c08
Revises: c9d5f83a0b17
Create Date: 2026-05-23

"""
from alembic import op
import sqlalchemy as sa

revision = 'd2e6a94b3c08'
down_revision = 'c9d5f83a0b17'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'youtube_insights',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('video_id', sa.String(20), nullable=False),
        sa.Column('video_title', sa.String(300), nullable=False),
        sa.Column('channel', sa.String(150), nullable=False),
        sa.Column('insight_text', sa.Text(), nullable=False),
        sa.Column('tags_json', sa.Text(), nullable=True),
        sa.Column('strategy', sa.String(100), nullable=True),
        sa.Column('timeframe', sa.String(20), nullable=True),
        sa.Column('market_condition', sa.String(50), nullable=True),
        sa.Column('asset_class', sa.String(50), nullable=True),
        sa.Column('confidence_score', sa.Float(), nullable=False, server_default='0.7'),
        sa.Column('times_validated', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('times_invalidated', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('video_id', name='uq_youtube_insights_video_id'),
    )
    op.create_index('ix_youtube_insights_video_id', 'youtube_insights', ['video_id'])
    op.create_index('ix_youtube_insights_strategy', 'youtube_insights', ['strategy'])
    op.create_index('ix_youtube_insights_created_at', 'youtube_insights', ['created_at'])

    op.create_table(
        'trade_learnings',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('ticker', sa.String(20), nullable=False),
        sa.Column('direction', sa.String(20), nullable=False),
        sa.Column('learning_text', sa.Text(), nullable=False),
        sa.Column('conditions_json', sa.Text(), nullable=True),
        sa.Column('win_rate', sa.Float(), nullable=True),
        sa.Column('sample_count', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('avg_return_pct', sa.Float(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('last_updated', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_trade_learnings_ticker', 'trade_learnings', ['ticker'])
    op.create_index('ix_trade_learnings_created_at', 'trade_learnings', ['created_at'])

    op.create_table(
        'learning_jobs',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('job_type', sa.String(50), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='pending'),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('finished_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('items_processed', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('error', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_learning_jobs_job_type', 'learning_jobs', ['job_type'])
    op.create_index('ix_learning_jobs_status', 'learning_jobs', ['status'])


def downgrade() -> None:
    op.drop_index('ix_learning_jobs_status', table_name='learning_jobs')
    op.drop_index('ix_learning_jobs_job_type', table_name='learning_jobs')
    op.drop_table('learning_jobs')
    op.drop_index('ix_trade_learnings_created_at', table_name='trade_learnings')
    op.drop_index('ix_trade_learnings_ticker', table_name='trade_learnings')
    op.drop_table('trade_learnings')
    op.drop_index('ix_youtube_insights_created_at', table_name='youtube_insights')
    op.drop_index('ix_youtube_insights_strategy', table_name='youtube_insights')
    op.drop_index('ix_youtube_insights_video_id', table_name='youtube_insights')
    op.drop_table('youtube_insights')
