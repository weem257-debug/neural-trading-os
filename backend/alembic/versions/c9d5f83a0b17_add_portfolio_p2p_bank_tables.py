"""add portfolio, p2p, bank tables

Revision ID: c9d5f83a0b17
Revises: a7f3d91b2e04
Create Date: 2026-05-23

"""
from alembic import op
import sqlalchemy as sa

revision = 'c9d5f83a0b17'
down_revision = 'a7f3d91b2e04'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'portfolios',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('portfolio_type', sa.String(20), nullable=False, server_default='mixed'),
        sa.Column('category', sa.String(20), nullable=False, server_default='private'),
        sa.Column('currency', sa.String(3), nullable=False, server_default='EUR'),
        sa.Column('color', sa.String(7), nullable=False, server_default='#00D4FF'),
        sa.Column('is_default', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('description', sa.String(200), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table(
        'p2p_snapshots',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('portfolio_id', sa.Integer(), nullable=True),
        sa.Column('platform', sa.String(30), nullable=False),
        sa.Column('total_invested', sa.Float(), nullable=False, server_default='0'),
        sa.Column('outstanding_principal', sa.Float(), nullable=False, server_default='0'),
        sa.Column('interest_month', sa.Float(), nullable=False, server_default='0'),
        sa.Column('total_interest', sa.Float(), nullable=False, server_default='0'),
        sa.Column('defaulted_amount', sa.Float(), nullable=False, server_default='0'),
        sa.Column('cash_balance', sa.Float(), nullable=False, server_default='0'),
        sa.Column('net_annual_return', sa.Float(), nullable=True),
        sa.Column('num_active_loans', sa.Integer(), nullable=True),
        sa.Column('currency', sa.String(3), nullable=False, server_default='EUR'),
        sa.Column('fetched_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_p2p_snapshots_platform', 'p2p_snapshots', ['platform'])
    op.create_index('ix_p2p_snapshots_portfolio_id', 'p2p_snapshots', ['portfolio_id'])
    op.create_index('ix_p2p_snapshots_fetched_at', 'p2p_snapshots', ['fetched_at'])

    op.create_table(
        'bank_connections',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('portfolio_id', sa.Integer(), nullable=True),
        sa.Column('bank_name', sa.String(100), nullable=False),
        sa.Column('blz', sa.String(8), nullable=False),
        sa.Column('username', sa.String(100), nullable=False),
        sa.Column('account_iban', sa.String(34), nullable=True),
        sa.Column('last_synced', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_balance', sa.Float(), nullable=True),
        sa.Column('currency', sa.String(3), nullable=False, server_default='EUR'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_bank_connections_portfolio_id', 'bank_connections', ['portfolio_id'])


def downgrade() -> None:
    op.drop_index('ix_bank_connections_portfolio_id', table_name='bank_connections')
    op.drop_table('bank_connections')
    op.drop_index('ix_p2p_snapshots_fetched_at', table_name='p2p_snapshots')
    op.drop_index('ix_p2p_snapshots_portfolio_id', table_name='p2p_snapshots')
    op.drop_index('ix_p2p_snapshots_platform', table_name='p2p_snapshots')
    op.drop_table('p2p_snapshots')
    op.drop_table('portfolios')
