"""
Trade Republic Client
======================
Trade Republic hat KEINE offizielle öffentliche API.
Die App kommuniziert ausschließlich über WebSocket mit einem proprietären Protokoll.

Basis: Reverse-Engineering der TR-App (pytr Community-Bibliothek).
Repo:  https://github.com/pytr-org/pytr

Status: PHASE 3 — Komplex, WebSocket + Auth per ECDH-Key-Exchange.

Authentifizierung:
  1. Telefonnummer + PIN (wie in der TR-App)
  2. 2FA per SMS (einmalig bei erstem Connect)
  3. WebSocket-Verbindung zu wss://api.traderepublic.com
  4. Proprietäres JSON-Protokoll über den Socket

Verfügbare Daten (via pytr):
  - Portfolio (Aktien, ETFs, Crypto Saveplans)
  - Cashkonto-Saldo
  - Transaktionshistorie
  - Kontoauszug (PDF/Steuerberichte)
  - Aktuelle Preise

Env-Variablen:
  TR_PHONE_NUMBER  — Telefonnummer (mit Ländervorwahl, z.B. +49123456789)
  TR_PIN           — 4-stellige PIN der TR-App

WICHTIG: Nutzung des TR-Protokolls ohne explizite Erlaubnis verstößt
         möglicherweise gegen die TR-AGB. Eigenverantwortung des Nutzers.
"""
from __future__ import annotations

import os
from datetime import datetime, UTC
from typing import Optional

_PYTR_AVAILABLE = False
try:
    import pytr  # noqa: F401
    _PYTR_AVAILABLE = True
except ImportError:
    pass


# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------

class TradeRepublicPosition:
    def __init__(
        self,
        isin: str,
        name: str,
        quantity: float,
        current_price: float,
        average_price: float,
        current_value: float,
        profit_loss_abs: float,
        profit_loss_pct: float,
        currency: str,
        asset_type: str,
    ):
        self.isin = isin
        self.name = name
        self.quantity = quantity
        self.current_price = current_price
        self.average_price = average_price
        self.current_value = current_value
        self.profit_loss_abs = profit_loss_abs
        self.profit_loss_pct = profit_loss_pct
        self.currency = currency
        self.asset_type = asset_type

    def to_dict(self) -> dict:
        return {
            "isin": self.isin,
            "name": self.name,
            "quantity": self.quantity,
            "current_price": self.current_price,
            "average_price": self.average_price,
            "current_value": self.current_value,
            "profit_loss_abs": self.profit_loss_abs,
            "profit_loss_pct": self.profit_loss_pct,
            "currency": self.currency,
            "asset_type": self.asset_type,
        }


class TradeRepublicSummary:
    def __init__(
        self,
        total_value: float,
        cash_balance: float,
        invested_value: float,
        total_profit_loss: float,
        total_profit_loss_pct: float,
        positions: list[TradeRepublicPosition],
        fetched_at: datetime,
        is_demo: bool = False,
        lib_missing: bool = False,
    ):
        self.total_value = total_value
        self.cash_balance = cash_balance
        self.invested_value = invested_value
        self.total_profit_loss = total_profit_loss
        self.total_profit_loss_pct = total_profit_loss_pct
        self.positions = positions
        self.fetched_at = fetched_at
        self.is_demo = is_demo
        self.lib_missing = lib_missing

    def to_dict(self) -> dict:
        return {
            "broker": "trade_republic",
            "total_value": self.total_value,
            "cash_balance": self.cash_balance,
            "invested_value": self.invested_value,
            "total_profit_loss": self.total_profit_loss,
            "total_profit_loss_pct": self.total_profit_loss_pct,
            "num_positions": len(self.positions),
            "positions": [p.to_dict() for p in self.positions],
            "fetched_at": self.fetched_at.isoformat(),
            "is_demo": self.is_demo,
            "lib_missing": self.lib_missing,
        }


# ---------------------------------------------------------------------------
# Demo data
# ---------------------------------------------------------------------------

_DEMO_POSITIONS = [
    TradeRepublicPosition("US0231351067", "Amazon.com Inc.", 2.0, 190.50, 170.0, 381.0, 41.0, 12.06, "EUR", "stock"),
    TradeRepublicPosition("US5949181045", "Microsoft Corp.", 5.0, 415.0, 380.0, 2_075.0, 175.0, 9.21, "EUR", "stock"),
    TradeRepublicPosition("IE00B4L5Y983", "iShares Core MSCI World", 30.0, 88.50, 72.0, 2_655.0, 495.0, 22.92, "EUR", "etf"),
]

_DEMO = TradeRepublicSummary(
    total_value=5_611.0,
    cash_balance=400.0,
    invested_value=4_900.0,
    total_profit_loss=711.0,
    total_profit_loss_pct=14.51,
    positions=_DEMO_POSITIONS,
    fetched_at=datetime.now(UTC),
    is_demo=True,
)


# ---------------------------------------------------------------------------
# Client (via pytr — falls installiert)
# ---------------------------------------------------------------------------

async def fetch_portfolio(
    phone_number: Optional[str] = None,
    pin: Optional[str] = None,
) -> TradeRepublicSummary:
    """
    Ruft das Trade Republic Portfolio ab.
    Benötigt pytr: pip install pytr
    """
    if not _PYTR_AVAILABLE:
        return TradeRepublicSummary(
            total_value=0.0,
            cash_balance=0.0,
            invested_value=0.0,
            total_profit_loss=0.0,
            total_profit_loss_pct=0.0,
            positions=[],
            fetched_at=datetime.now(UTC),
            is_demo=True,
            lib_missing=True,
        )

    phone = phone_number or os.getenv("TR_PHONE_NUMBER", "")
    tr_pin = pin or os.getenv("TR_PIN", "")

    if not phone or not tr_pin:
        return _DEMO

    try:
        import asyncio

        # pytr ist async-nativ
        async def _fetch_async():
            from pytr.api import TradeRepublicApi
            from pytr.portfolio import Portfolio

            api = TradeRepublicApi(phone_no=phone, pin=tr_pin)
            await api.initiate_device_reset()
            # WICHTIG: Bei erstem Connect ist 2FA-Verification nötig
            # Das System erwartet, dass der User die App-Benachrichtigung bestätigt
            await api.complete_device_reset(verification_code="")

            portfolio = Portfolio(api)
            await portfolio.portfolio_loop()

            return portfolio

        portfolio = await _fetch_async()

        positions = []
        total_invested = 0.0

        for item in getattr(portfolio, "portfolio_items", []):
            qty = _safe_float(item.get("quantity"))
            avg_price = _safe_float(item.get("averageBuyIn"))
            cur_price = _safe_float(item.get("lastPrice", {}).get("value"))
            if not qty or not cur_price:
                continue

            cur_value = qty * cur_price
            invested = qty * (avg_price or 0)
            pl_abs = cur_value - invested
            pl_pct = (pl_abs / invested * 100) if invested > 0 else 0.0
            total_invested += invested

            positions.append(TradeRepublicPosition(
                isin=item.get("instrumentId", ""),
                name=item.get("instrument", {}).get("shortName", "Unknown"),
                quantity=qty,
                current_price=cur_price,
                average_price=avg_price or 0.0,
                current_value=round(cur_value, 2),
                profit_loss_abs=round(pl_abs, 2),
                profit_loss_pct=round(pl_pct, 2),
                currency="EUR",
                asset_type=item.get("instrument", {}).get("typeId", "stock").lower(),
            ))

        total_value = sum(p.current_value for p in positions)
        total_pl = sum(p.profit_loss_abs for p in positions)
        total_pl_pct = (total_pl / total_invested * 100) if total_invested > 0 else 0.0

        return TradeRepublicSummary(
            total_value=round(total_value, 2),
            cash_balance=0.0,  # Cash-Saldo separat abfragen
            invested_value=round(total_invested, 2),
            total_profit_loss=round(total_pl, 2),
            total_profit_loss_pct=round(total_pl_pct, 2),
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
