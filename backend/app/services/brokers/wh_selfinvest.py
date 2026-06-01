"""
WH SelfInvest Client
=====================
WH SelfInvest ist ein CFD/Futures-Broker ohne öffentliche REST API.

Strategie:
  Option A: cTrader Open API (falls der Nutzer ein cTrader-Konto hat)
            — offizielle gRPC/WebSocket API
            — Docs: https://help.ctrader.com/open-api/

  Option B: FIX-Protokoll (für institutionelle/professionelle Kunden)
            — sehr komplex, braucht Broker-Freischaltung

  Option C: MT4/MT5-DLL-Connector (MetaTrader)
            — nur auf Windows mit installiertem MT4/MT5 nutzbar
            — nicht geeignet für Cloud-Deployment

Diese Implementierung fokussiert auf cTrader Open API als primären Weg,
da WH SelfInvest cTrader als Trading-Plattform anbietet.

Env-Variablen:
  WH_CTRADER_CLIENT_ID      — cTrader API Client ID (von spotware.com)
  WH_CTRADER_CLIENT_SECRET  — cTrader API Client Secret
  WH_CTRADER_ACCESS_TOKEN   — OAuth2 Access Token (nach Auth-Flow)
  WH_CTRADER_ACCOUNT_ID     — Trading Account ID

Verfügbare Daten (via cTrader Open API):
  - Account-Saldo (Balance, Equity, Used/Free Margin)
  - Offene Positionen (CFDs, Futures)
  - Geschlossene Trades (Gewinn/Verlust)
  - Transaktionshistorie (Einzahlungen, Auszahlungen)
"""
from __future__ import annotations

import os
from datetime import datetime, UTC
from typing import Optional

import httpx

# cTrader Open API Endpoints
CTRADER_API_HOST = "https://openapi.ctrader.com"
CTRADER_AUTH = "https://openapi.ctrader.com/apps/token"


# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------

class WHPosition:
    """Eine offene CFD/Futures-Position."""

    def __init__(
        self,
        position_id: str,
        symbol: str,
        direction: str,       # "BUY" | "SELL"
        volume: float,        # Kontraktgröße
        open_price: float,
        current_price: float,
        unrealized_pnl: float,
        swap: float,
        commission: float,
        currency: str,
        opened_at: Optional[str],
    ):
        self.position_id = position_id
        self.symbol = symbol
        self.direction = direction
        self.volume = volume
        self.open_price = open_price
        self.current_price = current_price
        self.unrealized_pnl = unrealized_pnl
        self.swap = swap
        self.commission = commission
        self.currency = currency
        self.opened_at = opened_at

    def to_dict(self) -> dict:
        return {
            "position_id": self.position_id,
            "symbol": self.symbol,
            "direction": self.direction,
            "volume": self.volume,
            "open_price": self.open_price,
            "current_price": self.current_price,
            "unrealized_pnl": self.unrealized_pnl,
            "swap": self.swap,
            "commission": self.commission,
            "currency": self.currency,
            "opened_at": self.opened_at,
        }


class WHSelfInvestSummary:
    """Konto-Übersicht WH SelfInvest via cTrader API."""

    def __init__(
        self,
        account_id: str,
        balance: float,
        equity: float,
        used_margin: float,
        free_margin: float,
        margin_level_pct: float,
        unrealized_pnl: float,
        currency: str,
        open_positions: list[WHPosition],
        fetched_at: datetime,
        is_demo: bool = False,
        api_missing: bool = False,
    ):
        self.account_id = account_id
        self.balance = balance
        self.equity = equity
        self.used_margin = used_margin
        self.free_margin = free_margin
        self.margin_level_pct = margin_level_pct
        self.unrealized_pnl = unrealized_pnl
        self.currency = currency
        self.open_positions = open_positions
        self.fetched_at = fetched_at
        self.is_demo = is_demo
        self.api_missing = api_missing

    def to_dict(self) -> dict:
        return {
            "broker": "wh_selfinvest",
            "account_id": self.account_id,
            "balance": self.balance,
            "equity": self.equity,
            "used_margin": self.used_margin,
            "free_margin": self.free_margin,
            "margin_level_pct": self.margin_level_pct,
            "unrealized_pnl": self.unrealized_pnl,
            "currency": self.currency,
            "num_open_positions": len(self.open_positions),
            "open_positions": [p.to_dict() for p in self.open_positions],
            "fetched_at": self.fetched_at.isoformat(),
            "is_demo": self.is_demo,
            "api_missing": self.api_missing,
        }


# ---------------------------------------------------------------------------
# Demo fallback
# ---------------------------------------------------------------------------

_DEMO_POSITIONS = [
    WHPosition("pos-1", "EUR/USD", "BUY", 10000.0, 1.0850, 1.0862, 12.0, -0.50, -3.50, "EUR", "2025-01-10T09:30:00Z"),
    WHPosition("pos-2", "GER40", "SELL", 1.0, 17_850.0, 17_780.0, 70.0, -2.80, -5.0, "EUR", "2025-01-12T14:00:00Z"),
]

_DEMO = WHSelfInvestSummary(
    account_id="demo-123",
    balance=10_000.0,
    equity=10_079.20,
    used_margin=500.0,
    free_margin=9_579.20,
    margin_level_pct=2_015.84,
    unrealized_pnl=82.0,
    currency="EUR",
    open_positions=_DEMO_POSITIONS,
    fetched_at=datetime.now(UTC),
    is_demo=True,
)


# ---------------------------------------------------------------------------
# cTrader Open API Client
# ---------------------------------------------------------------------------

async def fetch_account(
    access_token: Optional[str] = None,
    account_id: Optional[str] = None,
) -> WHSelfInvestSummary:
    """
    Ruft Konto-Daten via cTrader Open API ab.

    Access Token muss zuvor via OAuth2-Flow bezogen werden:
    https://openapi.ctrader.com/apps/token
    """
    token = access_token or os.getenv("WH_CTRADER_ACCESS_TOKEN", "")
    acct_id = account_id or os.getenv("WH_CTRADER_ACCOUNT_ID", "")

    if not token or not acct_id:
        return _DEMO

    try:
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient(timeout=20) as client:
            # Konto-Details
            account_resp = await client.get(
                f"{CTRADER_API_HOST}/v2/webserv/traders/{acct_id}",
                headers=headers,
            )

            if account_resp.status_code in (401, 403):
                return WHSelfInvestSummary(
                    account_id=acct_id,
                    balance=0.0,
                    equity=0.0,
                    used_margin=0.0,
                    free_margin=0.0,
                    margin_level_pct=0.0,
                    unrealized_pnl=0.0,
                    currency="EUR",
                    open_positions=[],
                    fetched_at=datetime.now(UTC),
                    is_demo=True,
                    api_missing=True,
                )

            account_resp.raise_for_status()
            account_data = account_resp.json()

            # Offene Positionen
            positions_resp = await client.get(
                f"{CTRADER_API_HOST}/v2/webserv/traders/{acct_id}/positions",
                headers=headers,
            )
            positions_resp.raise_for_status()
            positions_data = positions_resp.json()

        # Konto-Werte (cTrader gibt Beträge in Cent zurück!)
        divisor = 100.0  # Cent → EUR/USD

        balance = _safe_float(account_data.get("balance")) or 0.0
        balance /= divisor

        equity = _safe_float(account_data.get("equity")) or 0.0
        equity /= divisor

        used_margin = _safe_float(account_data.get("usedMargin")) or 0.0
        used_margin /= divisor

        free_margin = equity - used_margin
        margin_level = (equity / used_margin * 100) if used_margin > 0 else 0.0

        currency = account_data.get("depositCurrency", "EUR")

        # Positionen verarbeiten
        positions: list[WHPosition] = []
        total_unrealized = 0.0

        for pos in positions_data.get("position", []):
            trade_data = pos.get("tradeData", {})
            live_data = pos.get("positionStatus", "")

            unrealized = (_safe_float(pos.get("swap")) or 0.0) + (_safe_float(pos.get("commission")) or 0.0)
            # Unrealized P&L wird aus Equity - Balance abgeleitet
            total_unrealized += unrealized

            volume = _safe_float(trade_data.get("volume")) or 0.0
            volume /= 100.0  # cTrader: Volume in 1/100 Lot

            positions.append(WHPosition(
                position_id=str(pos.get("positionId", "")),
                symbol=trade_data.get("symbolName", "?"),
                direction="BUY" if trade_data.get("tradeSide", 1) == 1 else "SELL",
                volume=volume,
                open_price=(_safe_float(trade_data.get("openPrice")) or 0.0) / 100_000,
                current_price=(_safe_float(pos.get("price")) or 0.0) / 100_000,
                unrealized_pnl=unrealized / divisor,
                swap=(_safe_float(pos.get("swap")) or 0.0) / divisor,
                commission=(_safe_float(pos.get("commission")) or 0.0) / divisor,
                currency=currency,
                opened_at=trade_data.get("openTime"),
            ))

        return WHSelfInvestSummary(
            account_id=acct_id,
            balance=round(balance, 2),
            equity=round(equity, 2),
            used_margin=round(used_margin, 2),
            free_margin=round(free_margin, 2),
            margin_level_pct=round(margin_level, 2),
            unrealized_pnl=round(equity - balance, 2),
            currency=currency,
            open_positions=positions,
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
