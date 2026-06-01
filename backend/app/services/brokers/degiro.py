"""
DEGIRO Broker Client
=====================
Nutzt die Community-Bibliothek `degiro-connector` (pip install degiro-connector).
Inoffizielle API — kein offizielles Support von DEGIRO, aber stabil seit Jahren.

Docs/Repo: https://github.com/Chavithra/degiro-connector

Verfügbare Daten:
  - Portfolio-Positionen mit aktuellem Wert
  - Konto-Saldo (Verfügbares Guthaben)
  - Transaktionshistorie (Käufe, Verkäufe)
  - Dividendenhistorie
  - Produktsuche / Instrumenten-Details

Authentifizierung:
  - Username + Passwort (+ optional TOTP-2FA)
  - Session wird intern von degiro-connector verwaltet

Env-Variablen:
  DEGIRO_USERNAME   — DEGIRO-Konto-Benutzername
  DEGIRO_PASSWORD   — DEGIRO-Konto-Passwort
  DEGIRO_TOTP_TOKEN — TOTP-2FA-Secret (optional, falls 2FA aktiviert)

WICHTIG: degiro-connector muss installiert sein:
  pip install degiro-connector
"""
from __future__ import annotations

import os
from datetime import datetime, UTC
from typing import Optional

_DEGIRO_AVAILABLE = False
try:
    from degiro_connector.trading.api import API as DegiroAPI
    from degiro_connector.trading.models.trading_pb2 import (
        Credentials,
        PortfolioTotal,
        Update,
    )
    _DEGIRO_AVAILABLE = True
except ImportError:
    pass


# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------

class DegiroPosition:
    def __init__(
        self,
        product_id: str,
        symbol: str,
        name: str,
        isin: str,
        quantity: float,
        current_price: float,
        currency: str,
        current_value: float,
        break_even_price: Optional[float],
        profit_loss_abs: Optional[float],
        profit_loss_pct: Optional[float],
        asset_type: str,
    ):
        self.product_id = product_id
        self.symbol = symbol
        self.name = name
        self.isin = isin
        self.quantity = quantity
        self.current_price = current_price
        self.currency = currency
        self.current_value = current_value
        self.break_even_price = break_even_price
        self.profit_loss_abs = profit_loss_abs
        self.profit_loss_pct = profit_loss_pct
        self.asset_type = asset_type

    def to_dict(self) -> dict:
        return {
            "product_id": self.product_id,
            "symbol": self.symbol,
            "name": self.name,
            "isin": self.isin,
            "quantity": self.quantity,
            "current_price": self.current_price,
            "currency": self.currency,
            "current_value": self.current_value,
            "break_even_price": self.break_even_price,
            "profit_loss_abs": self.profit_loss_abs,
            "profit_loss_pct": self.profit_loss_pct,
            "asset_type": self.asset_type,
        }


class DegiroSummary:
    def __init__(
        self,
        total_value: float,
        free_cash: float,
        total_profit_loss: float,
        currency: str,
        positions: list[DegiroPosition],
        fetched_at: datetime,
        is_demo: bool = False,
        lib_missing: bool = False,
    ):
        self.total_value = total_value
        self.free_cash = free_cash
        self.total_profit_loss = total_profit_loss
        self.currency = currency
        self.positions = positions
        self.fetched_at = fetched_at
        self.is_demo = is_demo
        self.lib_missing = lib_missing

    def to_dict(self) -> dict:
        return {
            "broker": "degiro",
            "total_value": self.total_value,
            "free_cash": self.free_cash,
            "total_profit_loss": self.total_profit_loss,
            "currency": self.currency,
            "num_positions": len(self.positions),
            "positions": [p.to_dict() for p in self.positions],
            "fetched_at": self.fetched_at.isoformat(),
            "is_demo": self.is_demo,
            "lib_missing": self.lib_missing,
        }


# ---------------------------------------------------------------------------
# Demo fallback
# ---------------------------------------------------------------------------

_DEMO_POSITIONS = [
    DegiroPosition("123", "VWRL", "Vanguard FTSE All-World UCITS ETF", "IE00B3RBWM25", 40.0, 108.50, "EUR", 4_340.0, 85.0, 940.0, 27.6, "ETF"),
    DegiroPosition("456", "ASML", "ASML Holding N.V.", "NL0010273215", 3.0, 720.0, "EUR", 2_160.0, 600.0, 360.0, 20.0, "SHARE"),
    DegiroPosition("789", "NL0000009165", "Heineken", "NL0000009165", 10.0, 82.50, "EUR", 825.0, 90.0, -75.0, -8.3, "SHARE"),
]

_DEMO = DegiroSummary(
    total_value=7_325.0,
    free_cash=445.80,
    total_profit_loss=1_225.0,
    currency="EUR",
    positions=_DEMO_POSITIONS,
    fetched_at=datetime.now(UTC),
    is_demo=True,
)


# ---------------------------------------------------------------------------
# Client
# ---------------------------------------------------------------------------

async def fetch_portfolio(
    username: Optional[str] = None,
    password: Optional[str] = None,
    totp_token: Optional[str] = None,
) -> DegiroSummary:
    """
    Ruft das DEGIRO-Portfolio ab.
    Benötigt degiro-connector (pip install degiro-connector).
    """
    if not _DEGIRO_AVAILABLE:
        demo = DegiroSummary(
            total_value=0.0,
            free_cash=0.0,
            total_profit_loss=0.0,
            currency="EUR",
            positions=[],
            fetched_at=datetime.now(UTC),
            is_demo=True,
            lib_missing=True,
        )
        return demo

    usr = username or os.getenv("DEGIRO_USERNAME", "")
    pwd = password or os.getenv("DEGIRO_PASSWORD", "")
    totp = totp_token or os.getenv("DEGIRO_TOTP_TOKEN", "")

    if not usr or not pwd:
        return _DEMO

    try:
        import asyncio

        def _fetch_sync():
            """Synchroner DEGIRO-Aufruf — in Thread-Pool ausgeführt."""
            creds = Credentials(
                username=usr,
                password=pwd,
                totp_secret_key=totp if totp else None,
            )
            api = DegiroAPI(credentials=creds)
            api.connect()

            # Portfolio-Update anfordern
            request = Update.Request()
            request.list.extend([
                Update.RequestType.PORTFOLIO,
                Update.RequestType.CASH_FUNDS,
                Update.RequestType.TOTAL_PORTFOLIO,
            ])

            update = api.get_update(request_list=request, raw=False)
            return update, api

        update, api = await asyncio.to_thread(_fetch_sync)

        if not update:
            return _DEMO

        # Portfolio-Positionen verarbeiten
        positions: list[DegiroPosition] = []
        portfolio = update.portfolio if hasattr(update, "portfolio") else None

        if portfolio:
            for item in getattr(portfolio, "values", []):
                item_dict = {f.name: v.as_dict() if hasattr(v, "as_dict") else v for f, v in item.ListFields()}
                pos_type = item_dict.get("positionType", "")
                if pos_type != "PRODUCT":
                    continue

                size = _safe_float(item_dict.get("size"))
                price = _safe_float(item_dict.get("price"))
                value = _safe_float(item_dict.get("value"))
                break_even = _safe_float(item_dict.get("breakEvenPrice"))

                pl_abs = None
                pl_pct = None
                if value is not None and break_even is not None and size is not None:
                    invested = break_even * size
                    if invested > 0:
                        pl_abs = round(value - invested, 2)
                        pl_pct = round((pl_abs / invested) * 100, 2)

                positions.append(DegiroPosition(
                    product_id=str(item_dict.get("id", "")),
                    symbol=str(item_dict.get("symbol", "?")),
                    name=str(item_dict.get("name", "Unknown")),
                    isin=str(item_dict.get("isin", "")),
                    quantity=size or 0.0,
                    current_price=price or 0.0,
                    currency=str(item_dict.get("currency", "EUR")),
                    current_value=value or 0.0,
                    break_even_price=break_even,
                    profit_loss_abs=pl_abs,
                    profit_loss_pct=pl_pct,
                    asset_type=str(item_dict.get("productType", "SHARE")),
                ))

        # Cash-Saldo
        free_cash = 0.0
        cash_funds = update.cash_funds if hasattr(update, "cash_funds") else None
        if cash_funds:
            for cf in getattr(cash_funds, "values", []):
                cf_dict = {f.name: v for f, v in cf.ListFields()}
                if cf_dict.get("currencyCode", "") == "EUR":
                    free_cash += _safe_float(cf_dict.get("value")) or 0.0

        total_value = sum(p.current_value for p in positions) + free_cash
        total_pl = sum(p.profit_loss_abs or 0 for p in positions)

        return DegiroSummary(
            total_value=round(total_value, 2),
            free_cash=round(free_cash, 2),
            total_profit_loss=round(total_pl, 2),
            currency="EUR",
            positions=positions,
            fetched_at=datetime.now(UTC),
            is_demo=False,
        )

    except Exception:
        return _DEMO


def _safe_float(v) -> Optional[float]:
    try:
        return float(v) if v is not None else None
    except (TypeError, ValueError):
        return None
