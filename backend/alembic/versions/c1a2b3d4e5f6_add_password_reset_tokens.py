"""add_password_reset_tokens

Revision ID: c1a2b3d4e5f6
Revises: b7c1d2e3f4a5
Create Date: 2026-06-15 19:30:00.000000

SECURITY (P0 #5): persistent, single-use, TTL-enforced password-reset tokens.
Replaces the previous in-memory dict that did not survive redeploys and broke
with more than one replica. Only the SHA-256 hash of the token is stored.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c1a2b3d4e5f6'
down_revision: Union[str, Sequence[str], None] = 'b7c1d2e3f4a5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "password_reset_tokens",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("username", sa.String(50), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_password_reset_tokens_token_hash",
        "password_reset_tokens",
        ["token_hash"],
        unique=True,
    )
    op.create_index(
        "ix_password_reset_tokens_username",
        "password_reset_tokens",
        ["username"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_password_reset_tokens_username", table_name="password_reset_tokens")
    op.drop_index("ix_password_reset_tokens_token_hash", table_name="password_reset_tokens")
    op.drop_table("password_reset_tokens")
