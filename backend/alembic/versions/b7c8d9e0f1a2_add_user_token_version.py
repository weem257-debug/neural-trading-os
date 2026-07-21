"""add_user_token_version

Revision ID: b7c8d9e0f1a2
Revises: f1a2b3c4d5e6
Create Date: 2026-07-21 14:30:00.000000

F-14 (session revocation): add users.token_version — a monotonic per-user
session generation embedded into every JWT as the "ver" claim. Bumping it
invalidates all previously issued tokens (HTTP + WebSocket) server-side.

Additive — one new NOT NULL column with server_default 0 (backfills existing
rows), no changes to existing columns.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b7c8d9e0f1a2"
down_revision: Union[str, Sequence[str], None] = "f1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "token_version",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "token_version")
