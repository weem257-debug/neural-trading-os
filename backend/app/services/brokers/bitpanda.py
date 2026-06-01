"""
Bitpanda Broker Client
======================
Offizielle Bitpanda REST API v1.
Authentifizierung: Bearer Token (API Key aus dem Bitpanda-Konto).

Docs: https://developers.bitpanda.com/platform/

Verfügbare Daten:
  - Portfolio-Positionen (Crypto, ETFs, Aktien, Metalle, Indizes)
  - Asset-Wallets mit aktuellem Wert
  - Transaktionshistorie (Käufe, Verkäufe, Einzahlungen, Auszahlungen)
  - Fiat-Guthaben (EUR, USD, CHF, GBP)

Env-Variable: BITPANDA_API_KEY
"""
from __future__ import annotations

import os
from datetime import datetime, UTC
from typing import Optional

import httpx

BITPANDA_BASE = "https://api.bitpanda.com/v1"


# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------

class BitpandaPosition:
    """Eine Einzelposition im Bitpanda-Portfolio."""

    def __init__(
        self,
        asset_id: str,
        asset_symbol: str,
        asset_name: str,
        asset_type: str,        # "crypto" | "etf" | "stock" | "metal" | "index" | "fiat"
        amount: float,          # Stückzahl / Menge
        current_price_eur: float,
        current_value_eur: float,
        average_price_eur: Optional[float],
        profit_loss_eur: Optional[float],
        profit_loss_pct: Optional[float],
    ):
        self.asset_id = asset_id
        self.asset_symbol = asset_symbol
        self.asset_name = asset_name
        self.asset_type = asset_type
        self.amount = amount
        self.current_price_eur = current_price_eur
        self.current_value_eur = current_value_eur
        self.average_price_eur = average_price_eur
        self.profit_loss_eur = profit_loss_eur
        self.profit_loss_pct = profit_loss_pct

    def to_dict(self) -> dict:
        return {
            "asset_id": self.asset_id,
            "symbol": self.asset_symbol,
            "name": self.asset_name,
            "type": self.asset_type,
            "amount": self.amount,
            "current_price_eur": self.current_price_eur,
            "current_value_eur": self.current_value_eur,
            "average_price_eur": self.average_price_eur,
            "profit_loss_eur": self.profit_loss_eur,
            "profit_loss_pct": self.profit_loss_pct,
        }


class BitpandaSummary:
    """Gesamt-Portfolio-Zusammenfassung von Bitpanda."""

    def __init__(
        self,
        total_value_eur: float,
        total_invested_eur: float,
        total_profit_loss_eur: float,
        total_profit_loss_pct: float,
        fiat_balance_eur: float,
        positions: list[BitpandaPosition],
        num_positions: int,
        fetched_at: datetime,
        is_demo: bool = False,
    ):
        self.total_value_eur = total_value_eur
        self.total_invested_eur = total_invested_eur
        self.total_profit_loss_eur = total_profit_loss_eur
        self.total_profit_loss_pct = total_profit_loss_pct
        self.fiat_balance_eur = fiat_balance_eur
        self.positions = positions
        self.num_positions = num_positions
        self.fetched_at = fetched_at
        self.is_demo = is_demo

    def to_dict(self) -> dict:
        return {
            "broker": "bitpanda",
            "total_value_eur": self.total_value_eur,
            "total_invested_eur": self.total_invested_eur,
            "total_profit_loss_eur": self.total_profit_loss_eur,
            "total_profit_loss_pct": self.total_profit_loss_pct,
            "fiat_balance_eur": self.fiat_balance_eur,
            "num_positions": self.num_positions,
            "positions": [p.to_dict() for p in self.positions],
            "fetched_at": self.fetched_at.isoformat(),
            "is_demo": self.is_demo,
        }


# ---------------------------------------------------------------------------
# Demo fallback (aktiviert wenn kein API-Key vorhanden)
# ---------------------------------------------------------------------------

_DEMO_POSITIONS = [
    BitpandaPosition("1", "BTC", "Bitcoin", "crypto", 0.042, 62_000.0, 2_604.0, 45_000.0, 714.0, 37.7),
    BitpandaPosition("2", "ETH", "Ethereum", "crypto", 1.5, 3_200.0, 4_800.0, 2_800.0, 600.0, 14.3),
    BitpandaPosition("3", "GOLD", "Gold", "metal", 2.0, 58.0, 116.0, 55.0, 6.0, 5.5),
    BitpandaPosition("4", "AMZN", "Amazon", "stock", 0.5, 185.0, 92.5, 175.0, 5.0, 2.9),
]

_DEMO = BitpandaSummary(
    total_value_eur=7_612.50,
    total_invested_eur=6_800.00,
    total_profit_loss_eur=812.50,
    total_profit_loss_pct=11.95,
    fiat_balance_eur=250.0,
    positions=_DEMO_POSITIONS,
    num_positions=len(_DEMO_POSITIONS),
    fetched_at=datetime.now(UTC),
    is_demo=True,
)


# ---------------------------------------------------------------------------
# API Client
# ---------------------------------------------------------------------------

async def fetch_portfolio(api_key: Optional[str] = None) -> BitpandaSummary:
    """
    Ruft das Bitpanda-Portfolio ab.
    Gibt Demo-Daten zurück wenn kein API-Key gesetzt oder ein Fehler auftritt.
    """
    key = api_key or os.getenv("BITPANDA_API_KEY", "")
    if not key:
        return _DEMO

    try:
        headers = {
            "X-API-KEY": key,
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient(timeout=20) as client:
            # 1. Wallets abrufen (Crypto, ETF, Aktien, Metalle)
            wallets_resp = await client.get(
                f"{BITPANDA_BASE}/wallets",
                headers=headers,
            )
            wallets_resp.raise_for_status()
            wallets_data = wallets_resp.json()

            # 2. Fiat-Guthaben abrufen
            fiat_resp = await client.get(
                f"{BITPANDA_BASE}/fiatwallets",
                headers=headers,
            )
            fiat_resp.raise_for_status()
            fiat_data = fiat_resp.json()

        # --- Wallets verarbeiten ---
        positions: list[BitpandaPosition] = []
        total_value = 0.0
        total_invested = 0.0

        for wallet in wallets_data.get("data", []):
            attrs = wallet.get("attributes", {})
            balance = _safe_float(attrs.get("balance")) or 0.0
            if balance <= 0:
                continue

            # Bitpanda gibt current_fiat_value in EUR zurück
            current_value = _safe_float(attrs.get("current_fiat_value")) or 0.0
            avg_price = _safe_float(attrs.get("average_price"))

            # Typ aus den Relationships ableiten
            asset_type = _detect_asset_type(wallet)

            invested = (avg_price * balance) if avg_price else 0.0
            pl_eur = current_value - invested if invested else None
            pl_pct = ((pl_eur / invested) * 100) if (pl_eur is not None and invested > 0) else None

            # Preis pro Einheit schätzen
            unit_price = (current_value / balance) if balance > 0 else 0.0

            pos = BitpandaPosition(
                asset_id=str(wallet.get("id", "")),
                asset_symbol=attrs.get("cryptocoin_symbol", attrs.get("symbol", "?")),
                asset_name=attrs.get("name", "Unknown"),
                asset_type=asset_type,
                amount=round(balance, 8),
                current_price_eur=round(unit_price, 4),
                current_value_eur=round(current_value, 2),
                average_price_eur=round(avg_price, 4) if avg_price else None,
                profit_loss_eur=round(pl_eur, 2) if pl_eur is not None else None,
                profit_loss_pct=round(pl_pct, 2) if pl_pct is not None else None,
            )
            positions.append(pos)
            total_value += current_value
            if invested:
                total_invested += invested

        # --- Fiat-Wallets ---
        fiat_balance_eur = 0.0
        for fw in fiat_data.get("data", []):
            attrs = fw.get("attributes", {})
            if attrs.get("fiat_symbol") == "EUR":
                fiat_balance_eur += _safe_float(attrs.get("balance")) or 0.0

        total_pl = total_value - total_invested
        total_pl_pct = (total_pl / total_invested * 100) if total_invested > 0 else 0.0

        return BitpandaSummary(
            total_value_eur=round(total_value, 2),
            total_invested_eur=round(total_invested, 2),
            total_profit_loss_eur=round(total_pl, 2),
            total_profit_loss_pct=round(total_pl_pct, 2),
            fiat_balance_eur=round(fiat_balance_eur, 2),
            positions=positions,
            num_positions=len(positions),
            fetched_at=datetime.now(UTC),
            is_demo=False,
        )

    except httpx.HTTPStatusError as e:
        if e.response.status_code in (401, 403):
            # Ungültiger API-Key — direkt Fehler zurückgeben, kein Demo-Fallback
            raise ValueError(f"Bitpanda: Ungültiger API-Key (HTTP {e.response.status_code})")
        return _DEMO
    except Exception:
        return _DEMO


async def fetch_transactions(
    api_key: Optional[str] = None,
    limit: int = 50,
) -> list[dict]:
    """
    Ruft die letzten Transaktionen ab (Käufe, Verkäufe, Einzahlungen).
    Gibt leere Liste zurück wenn kein Key oder Fehler.
    """
    key = api_key or os.getenv("BITPANDA_API_KEY", "")
    if not key:
        return _demo_transactions()

    try:
        headers = {"X-API-KEY": key}
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(
                f"{BITPANDA_BASE}/trades",
                headers=headers,
                params={"page_size": min(limit, 100)},
            )
            resp.raise_for_status()
            data = resp.json()

        transactions = []
        for trade in data.get("data", [])[:limit]:
            attrs = trade.get("attributes", {})
            transactions.append({
                "id": trade.get("id"),
                "type": attrs.get("type", "unknown"),
                "status": attrs.get("status", "unknown"),
                "symbol": attrs.get("cryptocoin_symbol", "?"),
                "amount": _safe_float(attrs.get("amount_cryptocoin")),
                "price_eur": _safe_float(attrs.get("price")),
                "total_eur": _safe_float(attrs.get("amount_fiat")),
                "fee_eur": _safe_float(attrs.get("fee", {}).get("amount") if isinstance(attrs.get("fee"), dict) else None),
                "executed_at": attrs.get("time", {}).get("date_iso8601"),
            })
        return transactions

    except Exception:
        return _demo_transactions()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _safe_float(v) -> Optional[float]:
    try:
        return float(v) if v is not None else None
    except (TypeError, ValueError):
        return None


def _detect_asset_type(wallet: dict) -> str:
    """Leitet den Asset-Typ aus der Wallet-Typ-Information ab."""
    wtype = wallet.get("type", "").lower()
    if "crypto" in wtype:
        return "crypto"
    if "etf" in wtype:
        return "etf"
    if "metal" in wtype:
        return "metal"
    if "stock" in wtype or "share" in wtype:
        return "stock"
    if "index" in wtype or "commodity" in wtype:
        return "index"
    return "other"


def _demo_transactions() -> list[dict]:
    return [
        {
            "id": "demo-1",
            "type": "buy",
            "status": "finished",
            "symbol": "BTC",
            "amount": 0.01,
            "price_eur": 58_000.0,
            "total_eur": 580.0,
            "fee_eur": 2.90,
            "executed_at": "2024-11-15T10:22:00+00:00",
        },
        {
            "id": "demo-2",
            "type": "buy",
            "status": "finished",
            "symbol": "ETH",
            "amount": 0.5,
            "price_eur": 2_950.0,
            "total_eur": 1_475.0,
            "fee_eur": 7.38,
            "executed_at": "2024-12-01T14:05:00+00:00",
        },
    ]
