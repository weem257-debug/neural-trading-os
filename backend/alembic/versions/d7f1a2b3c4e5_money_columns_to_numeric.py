"""money/price/quantity columns to NUMERIC for exact ledger storage (P1-2)

Revision ID: d7f1a2b3c4e5
Revises: c1a2b3d4e5f6
Create Date: 2026-06-29 09:00:00.000000

P1-2 money-math: convert binary-float (DOUBLE PRECISION) money, price and
quantity columns to NUMERIC so the production Postgres ledger stores exact
decimal values instead of accumulating IEEE-754 drift. Statistical ratio
columns (confidence, return_pct, win_rate, avg_return_pct, net_annual_return,
confidence_score) are intentionally left as float.

Dialect-aware: on Postgres uses ALTER ... TYPE numeric USING <col>::numeric.
On SQLite (not used in production; tests build the schema via create_all) the
batch operation is a no-op-safe table rewrite.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d7f1a2b3c4e5"
down_revision: Union[str, Sequence[str], None] = "c1a2b3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_MONEY = sa.Numeric(20, 8)
_QTY = sa.Numeric(28, 10)

# (table, column, new_type, nullable)
_COLS: list[tuple[str, str, sa.types.TypeEngine, bool]] = [
    ("signals", "price_target", _MONEY, True),
    ("signals", "stop_loss", _MONEY, True),
    ("signal_performance", "entry_price", _MONEY, False),
    ("signal_performance", "current_price", _MONEY, False),
    ("p2p_snapshots", "total_invested", _MONEY, False),
    ("p2p_snapshots", "outstanding_principal", _MONEY, False),
    ("p2p_snapshots", "interest_month", _MONEY, False),
    ("p2p_snapshots", "total_interest", _MONEY, False),
    ("p2p_snapshots", "defaulted_amount", _MONEY, False),
    ("p2p_snapshots", "cash_balance", _MONEY, False),
    ("bank_connections", "last_balance", _MONEY, True),
    ("orders", "quantity", _QTY, False),
    ("orders", "fill_price", _MONEY, True),
    ("orders", "fill_qty", _QTY, True),
    ("price_alerts", "threshold", _MONEY, False),
    ("price_alerts", "fired_price", _MONEY, True),
]


def _alter(to_money: bool) -> None:
    bind = op.get_bind()
    is_pg = bind.dialect.name == "postgresql"
    for table, col, money_type, nullable in _COLS:
        new_type = money_type if to_money else sa.Float()
        old_type = sa.Float() if to_money else money_type
        kwargs: dict = {"existing_type": old_type, "existing_nullable": nullable}
        if is_pg:
            cast = "numeric" if to_money else "double precision"
            kwargs["postgresql_using"] = f"{col}::{cast}"
        op.alter_column(table, col, type_=new_type, **kwargs)


def upgrade() -> None:
    _alter(to_money=True)


def downgrade() -> None:
    _alter(to_money=False)
