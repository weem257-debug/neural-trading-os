"""
Comdirect Broker Client
=======================
Offizielle comdirect REST API (OAuth 2.0 + PHOTO-TAN).

Docs: https://developer.comdirect.de/

Authentifizierungsfluss (einmalig pro Session):
  1. POST /oauth/token  — client_credentials → access_token (Typ: CD_OAUTH2_ONETIME)
  2. POST /api/session/clients/user/v2/activeTAN  — PHOTO-TAN Challenge triggern
  3. User scannt TAN mit Foto-TAN App
  4. POST /oauth/token  — cd_secondary mit TAN-Response → finale access_token
  5. Token hat TTL ~20 min, danach Refresh nötig

WICHTIG: Die vollständige OAuth-Session mit PHOTO-TAN ist interaktiv und
         NICHT für automatisches Background-Polling geeignet. Das System
         speichert das Access-Token nach einmaliger Authentifizierung in der
         DB (AppSecret) und nutzt es bis zum Ablauf.

Verfügbare Daten (nach Auth):
  - Depot-Positionen (Aktien, ETFs, Fonds, Anleihen)
  - Depot-Transaktionen (Käufe, Verkäufe, Dividenden)
  - Konto-Salden (Girokonto, Tagesgeld)
  - Order-Übersicht (offene Orders)
  - Mehrere Depots (multi-depot Support)

Env-Variablen:
  COMDIRECT_CLIENT_ID      — aus dem comdirect API-Portal
  COMDIRECT_CLIENT_SECRET  — aus dem comdirect API-Portal
  COMDIRECT_ACCESS_TOKEN   — nach OAuth-Flow gesetzt (läuft ab!)
  COMDIRECT_SESSION_ID     — Session-ID für TAN-Challenges
"""
from __future__ import annotations

import os
from datetime import datetime, UTC
from typing import Optional

import httpx

COMDIRECT_BASE = "https://api.comdirect.de/api"
COMDIRECT_OAUTH = "https://api.comdirect.de/oauth/token"


# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------

class ComdirectPosition:
    """Eine Depot-Position bei comdirect."""

    def __init__(
        self,
        position_id: str,
        isin: str,
        wkn: str,
        name: str,
        quantity: float,
        current_price: float,
        currency: str,
        current_value: float,
        purchase_price: Optional[float],
        profit_loss_abs: Optional[float],
        profit_loss_pct: Optional[float],
        asset_type: str,   # "SHARE" | "ETF" | "FUND" | "BOND" | "CERTIFICATE"
        depot_id: str,
    ):
        self.position_id = position_id
        self.isin = isin
        self.wkn = wkn
        self.name = name
        self.quantity = quantity
        self.current_price = current_price
        self.currency = currency
        self.current_value = current_value
        self.purchase_price = purchase_price
        self.profit_loss_abs = profit_loss_abs
        self.profit_loss_pct = profit_loss_pct
        self.asset_type = asset_type
        self.depot_id = depot_id

    def to_dict(self) -> dict:
        return {
            "position_id": self.position_id,
            "isin": self.isin,
            "wkn": self.wkn,
            "name": self.name,
            "quantity": self.quantity,
            "current_price": self.current_price,
            "currency": self.currency,
            "current_value": self.current_value,
            "purchase_price": self.purchase_price,
            "profit_loss_abs": self.profit_loss_abs,
            "profit_loss_pct": self.profit_loss_pct,
            "asset_type": self.asset_type,
            "depot_id": self.depot_id,
        }


class ComdirectDepot:
    """Ein Depot bei comdirect (Nutzer kann mehrere haben)."""

    def __init__(
        self,
        depot_id: str,
        depot_name: str,
        total_value: float,
        total_profit_loss: float,
        currency: str,
        positions: list[ComdirectPosition],
    ):
        self.depot_id = depot_id
        self.depot_name = depot_name
        self.total_value = total_value
        self.total_profit_loss = total_profit_loss
        self.currency = currency
        self.positions = positions

    def to_dict(self) -> dict:
        return {
            "depot_id": self.depot_id,
            "depot_name": self.depot_name,
            "total_value": self.total_value,
            "total_profit_loss": self.total_profit_loss,
            "currency": self.currency,
            "num_positions": len(self.positions),
            "positions": [p.to_dict() for p in self.positions],
        }


class ComdirectSummary:
    """Alle Depots des Nutzers aggregiert."""

    def __init__(
        self,
        depots: list[ComdirectDepot],
        total_value: float,
        total_profit_loss: float,
        currency: str,
        fetched_at: datetime,
        is_demo: bool = False,
        auth_required: bool = False,
    ):
        self.depots = depots
        self.total_value = total_value
        self.total_profit_loss = total_profit_loss
        self.currency = currency
        self.fetched_at = fetched_at
        self.is_demo = is_demo
        self.auth_required = auth_required

    def to_dict(self) -> dict:
        return {
            "broker": "comdirect",
            "total_value": self.total_value,
            "total_profit_loss": self.total_profit_loss,
            "currency": self.currency,
            "num_depots": len(self.depots),
            "depots": [d.to_dict() for d in self.depots],
            "fetched_at": self.fetched_at.isoformat(),
            "is_demo": self.is_demo,
            "auth_required": self.auth_required,
        }


# ---------------------------------------------------------------------------
# Demo fallback
# ---------------------------------------------------------------------------

_DEMO_POS_1 = [
    ComdirectPosition("p1", "US0378331005", "865985", "Apple Inc.", 15.0, 172.50, "EUR", 2_587.50, 145.0, 375.0, 17.2, "SHARE", "depot-1"),
    ComdirectPosition("p2", "IE00B4L5Y983", "A0RPWH", "iShares Core MSCI World", 50.0, 88.20, "EUR", 4_410.0, 72.0, 810.0, 22.5, "ETF", "depot-1"),
    ComdirectPosition("p3", "DE0005140008", "514000", "Deutsche Bank AG", 100.0, 12.30, "EUR", 1_230.0, 9.80, 250.0, 25.5, "SHARE", "depot-1"),
]

_DEMO_POS_2 = [
    ComdirectPosition("p4", "LU0274208692", "A0MMBM", "DWS Deutschland", 20.0, 145.60, "EUR", 2_912.0, 120.0, 512.0, 21.3, "FUND", "depot-2"),
    ComdirectPosition("p5", "DE0006231004", "623100", "Infineon Technologies", 75.0, 32.10, "EUR", 2_407.50, 28.0, 307.50, 14.6, "SHARE", "depot-2"),
]

_DEMO = ComdirectSummary(
    depots=[
        ComdirectDepot("depot-1", "Privat-Depot", 8_227.50, 1_435.0, "EUR", _DEMO_POS_1),
        ComdirectDepot("depot-2", "Wertpapier-Sparplan", 5_319.50, 819.50, "EUR", _DEMO_POS_2),
    ],
    total_value=13_547.0,
    total_profit_loss=2_254.50,
    currency="EUR",
    fetched_at=datetime.now(UTC),
    is_demo=True,
)


# ---------------------------------------------------------------------------
# OAuth 2.0 Helper
# ---------------------------------------------------------------------------

async def get_oauth_token(client_id: str, client_secret: str) -> Optional[str]:
    """
    Schritt 1: Client-Credentials Flow für den initialen One-Time-Token.
    Dieser Token ist NUR für den TAN-Challenge-Step geeignet, NICHT für API-Calls.
    """
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                COMDIRECT_OAUTH,
                data={
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "grant_type": "client_credentials",
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            resp.raise_for_status()
            return resp.json().get("access_token")
    except Exception:
        return None


async def refresh_access_token(
    client_id: str,
    client_secret: str,
    refresh_token: str,
) -> Optional[dict]:
    """
    Schritt 4b: Access-Token per Refresh-Token verlängern (kein PHOTO-TAN nötig).
    Gibt ein Dict mit 'access_token', 'refresh_token', 'expires_in' zurück.
    Schlägt fehl wenn Refresh-Token abgelaufen ist (dann vollständiger OAuth-Flow nötig).
    """
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                COMDIRECT_OAUTH,
                data={
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "grant_type": "refresh_token",
                    "refresh_token": refresh_token,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            resp.raise_for_status()
            data = resp.json()
            return {
                "access_token": data.get("access_token"),
                "refresh_token": data.get("refresh_token"),
                "expires_in": data.get("expires_in", 1200),
                "token_type": data.get("token_type", "Bearer"),
            }
    except Exception:
        return None


async def request_tan_challenge(
    client_id: str,
    client_secret: str,
    onetime_token: str,
    session_id: str,
) -> Optional[dict]:
    """
    Schritt 2: Photo-TAN Challenge anfordern.
    Gibt die Challenge-Daten zurück (enthält den QR-Code Base64-String).
    """
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            headers = {
                "Authorization": f"Bearer {onetime_token}",
                "x-http-request-info": f'{{"clientRequestId":{{"sessionId":"{session_id}","requestId":"req-1"}}}}',
                "Content-Type": "application/json",
            }
            resp = await client.post(
                f"{COMDIRECT_BASE}/session/clients/user/v2/tan/challenge",
                headers=headers,
                json={"identifier": "P_TAN_PUSH", "challengeType": "P_TAN"},
            )
            resp.raise_for_status()
            return resp.json()
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Main API Client
# ---------------------------------------------------------------------------

async def fetch_portfolio(access_token: Optional[str] = None) -> ComdirectSummary:
    """
    Ruft alle Depots und Positionen über die comdirect API ab.

    Benötigt ein gültiges Access-Token (nach OAuth + PHOTO-TAN-Flow).
    Wenn kein Token vorhanden → Demo-Daten + auth_required=True.
    Wenn Token abgelaufen (401) → auth_required=True.
    """
    token = access_token or os.getenv("COMDIRECT_ACCESS_TOKEN", "")
    if not token:
        demo = _DEMO
        demo.auth_required = True
        return demo

    try:
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

        async with httpx.AsyncClient(timeout=20) as client:
            # 1. Depot-Liste abrufen
            depots_resp = await client.get(
                f"{COMDIRECT_BASE}/brokerage/clients/user/v3/depots",
                headers=headers,
            )

            if depots_resp.status_code in (401, 403):
                # Token abgelaufen oder ungültig
                return ComdirectSummary(
                    depots=[],
                    total_value=0.0,
                    total_profit_loss=0.0,
                    currency="EUR",
                    fetched_at=datetime.now(UTC),
                    is_demo=True,
                    auth_required=True,
                )

            depots_resp.raise_for_status()
            depots_data = depots_resp.json()

            # 2. Für jedes Depot die Positionen abrufen
            all_depots: list[ComdirectDepot] = []
            for depot_info in depots_data.get("values", []):
                depot_id = depot_info.get("depotId", "")
                depot_name = depot_info.get("depotDisplayId", depot_id)

                positions_resp = await client.get(
                    f"{COMDIRECT_BASE}/brokerage/v3/depots/{depot_id}/positions",
                    headers=headers,
                )
                positions_resp.raise_for_status()
                pos_data = positions_resp.json()

                positions: list[ComdirectPosition] = []
                for pos in pos_data.get("values", []):
                    instrument = pos.get("instrument", {})
                    current = pos.get("currentValue", {})
                    purchase = pos.get("purchaseValue", {})

                    qty = _safe_float(pos.get("quantity", {}).get("value"))
                    cur_price = _safe_float(pos.get("currentPrice", {}).get("price", {}).get("value"))
                    cur_value = _safe_float(current.get("value"))
                    purch_value = _safe_float(purchase.get("value"))

                    pl_abs = None
                    pl_pct = None
                    if cur_value is not None and purch_value is not None and purch_value > 0:
                        pl_abs = round(cur_value - purch_value, 2)
                        pl_pct = round((pl_abs / purch_value) * 100, 2)

                    positions.append(ComdirectPosition(
                        position_id=str(pos.get("depotPositionId", "")),
                        isin=instrument.get("isin", ""),
                        wkn=instrument.get("wkn", ""),
                        name=instrument.get("name", "Unknown"),
                        quantity=qty or 0.0,
                        current_price=cur_price or 0.0,
                        currency=current.get("currencyId", "EUR"),
                        current_value=cur_value or 0.0,
                        purchase_price=_safe_float(pos.get("purchasePrice", {}).get("value")),
                        profit_loss_abs=pl_abs,
                        profit_loss_pct=pl_pct,
                        asset_type=instrument.get("typeId", "SHARE"),
                        depot_id=depot_id,
                    ))

                total_depot_value = sum(p.current_value for p in positions)
                total_depot_pl = sum(p.profit_loss_abs or 0 for p in positions)

                all_depots.append(ComdirectDepot(
                    depot_id=depot_id,
                    depot_name=depot_name,
                    total_value=round(total_depot_value, 2),
                    total_profit_loss=round(total_depot_pl, 2),
                    currency="EUR",
                    positions=positions,
                ))

        total_value = sum(d.total_value for d in all_depots)
        total_pl = sum(d.total_profit_loss for d in all_depots)

        return ComdirectSummary(
            depots=all_depots,
            total_value=round(total_value, 2),
            total_profit_loss=round(total_pl, 2),
            currency="EUR",
            fetched_at=datetime.now(UTC),
            is_demo=False,
            auth_required=False,
        )

    except Exception:
        return _DEMO


async def fetch_transactions(
    access_token: Optional[str] = None,
    depot_id: Optional[str] = None,
    limit: int = 50,
) -> list[dict]:
    """
    Ruft Depot-Transaktionen ab (Käufe, Verkäufe, Dividenden).
    """
    token = access_token or os.getenv("COMDIRECT_ACCESS_TOKEN", "")
    if not token:
        return []

    try:
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
        params = {
            "paging-count": str(min(limit, 100)),
            "paging-first": "0",
        }

        # Wenn kein depot_id angegeben, zuerst Depot-Liste abrufen
        if not depot_id:
            async with httpx.AsyncClient(timeout=15) as client:
                depots_resp = await client.get(
                    f"{COMDIRECT_BASE}/brokerage/clients/user/v3/depots",
                    headers=headers,
                )
                depots_resp.raise_for_status()
                depots_data = depots_resp.json()
                depot_ids = [d.get("depotId") for d in depots_data.get("values", [])]
        else:
            depot_ids = [depot_id]

        all_transactions = []
        async with httpx.AsyncClient(timeout=20) as client:
            for did in depot_ids:
                resp = await client.get(
                    f"{COMDIRECT_BASE}/brokerage/v3/depots/{did}/transactions",
                    headers=headers,
                    params=params,
                )
                resp.raise_for_status()
                data = resp.json()

                for tx in data.get("values", []):
                    instrument = tx.get("instrument", {})
                    all_transactions.append({
                        "id": tx.get("transactionId"),
                        "depot_id": did,
                        "type": tx.get("transactionType", {}).get("text", "unknown"),
                        "isin": instrument.get("isin"),
                        "wkn": instrument.get("wkn"),
                        "name": instrument.get("name"),
                        "quantity": _safe_float(tx.get("quantity", {}).get("value")),
                        "price": _safe_float(tx.get("price", {}).get("value")),
                        "currency": tx.get("price", {}).get("currencyId", "EUR"),
                        "total": _safe_float(tx.get("totalValue", {}).get("value")),
                        "executed_at": tx.get("bookingDate"),
                    })

        return all_transactions[:limit]

    except Exception:
        return []


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _safe_float(v) -> Optional[float]:
    try:
        return float(v) if v is not None else None
    except (TypeError, ValueError):
        return None
