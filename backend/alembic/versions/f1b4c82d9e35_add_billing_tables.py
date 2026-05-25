"""add_billing_tables

Revision ID: f1b4c82d9e35
Revises: e3127ba88968
Create Date: 2026-05-25 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f1b4c82d9e35'
down_revision: Union[str, Sequence[str], None] = 'e3127ba88968'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "subscriptions",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.String(100), nullable=False, index=True, unique=True),
        sa.Column("stripe_customer_id", sa.String(100), nullable=True, unique=True),
        sa.Column("stripe_subscription_id", sa.String(100), nullable=True, unique=True),
        sa.Column("plan", sa.String(30), nullable=False, server_default="free"),
        sa.Column("status", sa.String(30), nullable=False, server_default="active"),
        sa.Column("current_period_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancel_at_period_end", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "billing_events",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("stripe_event_id", sa.String(100), nullable=False, unique=True, index=True),
        sa.Column("event_type", sa.String(100), nullable=False),
        sa.Column("processed", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("payload", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("billing_events")
    op.drop_table("subscriptions")
