"""
Broker Integration Routes
==========================
Aggregiert alle 9 Broker-Integrationen in einer einheitlichen API.

Endpunkte:
  GET  /api/brokers/status          — Übersicht aller Broker (konfiguriert / Demo)
  GET  /api/brokers/summary         — Aggregiertes Portfolio über alle Broker
  GET  /api/brokers/bitpanda        — Bitpanda Portfolio (offizielle API)
  GET  /api/brokers/bitpanda/transactions  — Bitpanda Transaktionen
  GET  /api/brokers/comdirect       — Comdirect Portfolio (OAuth2)
  GET  /api/brokers/comdirect/transactions — Comdirect Transaktionen
  GET  /api/brokers/degiro          — DEGIRO Portfolio (Community-Lib)
  GET  /api/brokers/flatex          — Flatex Konto (FinTS)
  POST /api/brokers/flatex/import-csv — Flatex Depot-CSV importieren
  GET  /api/brokers/crowdestor      — Crowdestor P2P (inoffizielle API)
  GET  /api/brokers/trade-republic  — Trade Republic (pytr / WebSocket)
  GET  /api/brokers/wh-selfinvest   — WH SelfInvest (cTrader API)
"""
import asyncio
from typing import Optional

from fastapi import APIRouter, Depends, File, Query, UploadFile

from app.api.auth import get_current_user, UserInfo
from app.services import credentials as creds_svc
from app.services.brokers import bitpanda as bitpanda_svc
from app.services.brokers import comdirect as comdirect_svc
from app.services.brokers import degiro as degiro_svc
from app.services.brokers import flatex as flatex_svc
from app.services.brokers import crowdestor as crowdestor_svc
from app.services.brokers import trade_republic as tr_svc
from app.services.brokers import wh_selfinvest as wh_svc

router = APIRouter(prefix="/brokers", tags=["Brokers"])


# ---------------------------------------------------------------------------
# Status-Übersicht
# ---------------------------------------------------------------------------

@router.get("/status")
async def get_broker_status(
    _user: UserInfo = Depends(get_current_user),
) -> dict:
    """
    Zeigt für jeden Broker an, ob Credentials konfiguriert sind.
    Gibt KEINE Credentials zurück — nur "configured" | "not_set".
    """
    checks = {
        "bitpanda": await creds_svc.get_credential("BITPANDA_API_KEY"),
        "comdirect_client_id": await creds_svc.get_credential("COMDIRECT_CLIENT_ID"),
        "comdirect_token": await creds_svc.get_credential("COMDIRECT_ACCESS_TOKEN"),
        "degiro_username": await creds_svc.get_credential("DEGIRO_USERNAME"),
        "flatex_user": await creds_svc.get_credential("FLATEX_FINTS_USER"),
        "crowdestor_email": await creds_svc.get_credential("CROWDESTOR_EMAIL"),
        "trade_republic_phone": await creds_svc.get_credential("TR_PHONE_NUMBER"),
        "wh_selfinvest_token": await creds_svc.get_credential("WH_CTRADER_ACCESS_TOKEN"),
    }

    return {
        "bitpanda": {
            "status": "configured" if checks["bitpanda"] else "not_set",
            "api_type": "official_rest",
            "phase": 1,
        },
        "comdirect": {
            "status": "configured" if checks["comdirect_token"] else (
                "oauth_pending" if checks["comdirect_client_id"] else "not_set"
            ),
            "api_type": "official_oauth2",
            "phase": 1,
            "note": "PHOTO-TAN erforderlich für initiales Auth",
        },
        "degiro": {
            "status": "configured" if checks["degiro_username"] else "not_set",
            "api_type": "community_lib",
            "phase": 2,
            "requires": "pip install degiro-connector",
        },
        "flatex": {
            "status": "configured" if checks["flatex_user"] else "not_set",
            "api_type": "fints_hbci",
            "phase": 2,
            "requires": "pip install python-fints",
            "note": "Nur Kontostand via FinTS; Depot via CSV-Import",
        },
        "crowdestor": {
            "status": "configured" if checks["crowdestor_email"] else "not_set",
            "api_type": "unofficial_scraping",
            "phase": 2,
        },
        "trade_republic": {
            "status": "configured" if checks["trade_republic_phone"] else "not_set",
            "api_type": "websocket_reverse_engineering",
            "phase": 3,
            "requires": "pip install pytr",
            "note": "2FA-Bestätigung via App bei erstem Connect nötig",
        },
        "wh_selfinvest": {
            "status": "configured" if checks["wh_selfinvest_token"] else "not_set",
            "api_type": "ctrader_open_api",
            "phase": 3,
            "note": "Benötigt cTrader-Konto + OAuth2-Flow",
        },
        "bondora": {"status": "implemented", "api_type": "official_rest", "phase": 1, "route": "/api/p2p/bondora"},
        "mintos": {"status": "implemented", "api_type": "official_rest", "phase": 1, "route": "/api/p2p/mintos"},
    }


# ---------------------------------------------------------------------------
# Aggregiertes Gesamt-Portfolio
# ---------------------------------------------------------------------------

@router.get("/summary")
async def get_broker_summary(
    _user: UserInfo = Depends(get_current_user),
) -> dict:
    """
    Ruft alle konfigurierten Broker parallel ab und aggregiert die Werte.
    Nicht konfigurierte Broker werden mit Demo-Daten oder übersprungen.
    """
    # Credentials laden
    bitpanda_key = await creds_svc.get_credential("BITPANDA_API_KEY")
    comdirect_token = await creds_svc.get_credential("COMDIRECT_ACCESS_TOKEN")
    degiro_user = await creds_svc.get_credential("DEGIRO_USERNAME")
    degiro_pass = await creds_svc.get_credential("DEGIRO_PASSWORD")
    flatex_user = await creds_svc.get_credential("FLATEX_FINTS_USER")
    crowdestor_email = await creds_svc.get_credential("CROWDESTOR_EMAIL")
    crowdestor_pass = await creds_svc.get_credential("CROWDESTOR_PASSWORD")
    tr_phone = await creds_svc.get_credential("TR_PHONE_NUMBER")
    tr_pin = await creds_svc.get_credential("TR_PIN")
    wh_token = await creds_svc.get_credential("WH_CTRADER_ACCESS_TOKEN")
    wh_account = await creds_svc.get_credential("WH_CTRADER_ACCOUNT_ID")

    # Alle Broker parallel abrufen
    results = await asyncio.gather(
        bitpanda_svc.fetch_portfolio(bitpanda_key),
        comdirect_svc.fetch_portfolio(comdirect_token),
        degiro_svc.fetch_portfolio(degiro_user, degiro_pass),
        flatex_svc.fetch_account(flatex_user),
        crowdestor_svc.fetch_summary(crowdestor_email, crowdestor_pass),
        tr_svc.fetch_portfolio(tr_phone, tr_pin),
        wh_svc.fetch_account(wh_token, wh_account),
        return_exceptions=True,
    )

    bitpanda_data, comdirect_data, degiro_data, flatex_data, crowdestor_data, tr_data, wh_data = results

    # Fehlerhafte Ergebnisse abfangen
    def _to_dict_safe(obj, fallback_broker: str) -> dict:
        if isinstance(obj, Exception):
            return {"broker": fallback_broker, "error": str(obj), "is_demo": True}
        return obj.to_dict()

    broker_data = [
        _to_dict_safe(bitpanda_data, "bitpanda"),
        _to_dict_safe(comdirect_data, "comdirect"),
        _to_dict_safe(degiro_data, "degiro"),
        _to_dict_safe(flatex_data, "flatex"),
        _to_dict_safe(tr_data, "trade_republic"),
        _to_dict_safe(wh_data, "wh_selfinvest"),
    ]

    # P2P-Daten separat (Crowdestor)
    p2p_data = [_to_dict_safe(crowdestor_data, "crowdestor")]

    # Summen berechnen (nur Broker mit Wert-Daten)
    total_broker_value = sum(
        d.get("total_value_eur") or d.get("total_value") or 0.0
        for d in broker_data
        if not d.get("error")
    )
    total_p2p_invested = sum(
        d.get("total_invested") or 0.0
        for d in p2p_data
        if not d.get("error")
    )

    from datetime import datetime, UTC
    return {
        "total_portfolio_value": round(total_broker_value + total_p2p_invested, 2),
        "total_broker_value": round(total_broker_value, 2),
        "total_p2p_invested": round(total_p2p_invested, 2),
        "currency": "EUR",
        "brokers": broker_data,
        "p2p": p2p_data,
        "fetched_at": datetime.now(UTC).isoformat(),
    }


# ---------------------------------------------------------------------------
# Bitpanda
# ---------------------------------------------------------------------------

@router.get("/bitpanda")
async def get_bitpanda(
    _user: UserInfo = Depends(get_current_user),
) -> dict:
    """Bitpanda Portfolio (Crypto, ETFs, Aktien, Metalle)."""
    api_key = await creds_svc.get_credential("BITPANDA_API_KEY")
    summary = await bitpanda_svc.fetch_portfolio(api_key)
    return summary.to_dict()


@router.get("/bitpanda/transactions")
async def get_bitpanda_transactions(
    limit: int = Query(50, ge=1, le=200),
    _user: UserInfo = Depends(get_current_user),
) -> list[dict]:
    """Bitpanda Transaktionshistorie."""
    api_key = await creds_svc.get_credential("BITPANDA_API_KEY")
    return await bitpanda_svc.fetch_transactions(api_key, limit)


# ---------------------------------------------------------------------------
# Comdirect
# ---------------------------------------------------------------------------

@router.get("/comdirect")
async def get_comdirect(
    _user: UserInfo = Depends(get_current_user),
) -> dict:
    """Comdirect Portfolio (alle Depots). Benötigt gültiges OAuth2-Token."""
    token = await creds_svc.get_credential("COMDIRECT_ACCESS_TOKEN")
    summary = await comdirect_svc.fetch_portfolio(token)
    return summary.to_dict()


@router.get("/comdirect/transactions")
async def get_comdirect_transactions(
    depot_id: Optional[str] = Query(None, description="Depot-ID (optional, Standard: alle Depots)"),
    limit: int = Query(50, ge=1, le=200),
    _user: UserInfo = Depends(get_current_user),
) -> list[dict]:
    """Comdirect Transaktionshistorie."""
    token = await creds_svc.get_credential("COMDIRECT_ACCESS_TOKEN")
    return await comdirect_svc.fetch_transactions(token, depot_id, limit)


@router.post("/comdirect/oauth/initiate")
async def comdirect_oauth_initiate(
    _user: UserInfo = Depends(get_current_user),
) -> dict:
    """
    Schritt 1 des Comdirect OAuth2-Flows: Holt One-Time-Token.
    Nutzer muss danach PHOTO-TAN in der App scannen.
    """
    client_id = await creds_svc.get_credential("COMDIRECT_CLIENT_ID")
    client_secret = await creds_svc.get_credential("COMDIRECT_CLIENT_SECRET")

    if not client_id or not client_secret:
        return {
            "success": False,
            "error": "COMDIRECT_CLIENT_ID und COMDIRECT_CLIENT_SECRET müssen konfiguriert sein.",
            "setup_url": "https://developer.comdirect.de",
        }

    token = await comdirect_svc.get_oauth_token(client_id, client_secret)
    if not token:
        return {"success": False, "error": "OAuth-Token-Request fehlgeschlagen."}

    return {
        "success": True,
        "onetime_token": token,
        "next_step": "PHOTO-TAN in der comdirect App scannen, dann /comdirect/oauth/complete aufrufen.",
    }


@router.post("/comdirect/oauth/refresh")
async def comdirect_oauth_refresh(
    _user: UserInfo = Depends(get_current_user),
) -> dict:
    """
    Comdirect Token-Refresh: Verlängert das Access-Token via Refresh-Token.
    Kein PHOTO-TAN nötig — solange der Refresh-Token noch gültig ist.
    Speichert das neue Access-Token automatisch in der DB.

    Workflow:
      1. Automatisch aufgerufen wenn /comdirect einen 401 zurückgibt.
      2. Manuell über diesen Endpunkt auslösen.
      3. Bei Fehler → vollständiger OAuth-Flow via /comdirect/oauth/initiate.
    """
    client_id = await creds_svc.get_credential("COMDIRECT_CLIENT_ID")
    client_secret = await creds_svc.get_credential("COMDIRECT_CLIENT_SECRET")
    refresh_token = await creds_svc.get_credential("COMDIRECT_REFRESH_TOKEN")

    if not client_id or not client_secret:
        return {
            "success": False,
            "error": "Client-Credentials fehlen. Zuerst OAuth über /initiate starten.",
        }

    if not refresh_token:
        return {
            "success": False,
            "error": "Kein Refresh-Token vorhanden. Vollständiger OAuth-Flow über /initiate erforderlich.",
            "action": "initiate_oauth",
        }

    result = await comdirect_svc.refresh_access_token(client_id, client_secret, refresh_token)

    if not result or not result.get("access_token"):
        return {
            "success": False,
            "error": "Refresh-Token abgelaufen. Neuer PHOTO-TAN-Login über /initiate erforderlich.",
            "action": "initiate_oauth",
        }

    # Neues Access-Token in der DB speichern
    try:
        await creds_svc.set_credential("COMDIRECT_ACCESS_TOKEN", result["access_token"])
        if result.get("refresh_token"):
            # Refresh-Token rotieren (falls Server neuen sendet)
            await creds_svc.set_credential("COMDIRECT_REFRESH_TOKEN", result["refresh_token"])
    except Exception as e:
        return {"success": False, "error": f"Token-Speicherung fehlgeschlagen: {e}"}

    return {
        "success": True,
        "message": "Access-Token erfolgreich erneuert.",
        "expires_in": result.get("expires_in", 1200),
        "token_rotated": bool(result.get("refresh_token")),
    }


# ---------------------------------------------------------------------------
# DEGIRO
# ---------------------------------------------------------------------------

@router.get("/degiro")
async def get_degiro(
    _user: UserInfo = Depends(get_current_user),
) -> dict:
    """DEGIRO Portfolio. Benötigt degiro-connector (pip install degiro-connector)."""
    username = await creds_svc.get_credential("DEGIRO_USERNAME")
    password = await creds_svc.get_credential("DEGIRO_PASSWORD")
    totp = await creds_svc.get_credential("DEGIRO_TOTP_TOKEN")
    summary = await degiro_svc.fetch_portfolio(username, password, totp)
    return summary.to_dict()


# ---------------------------------------------------------------------------
# Flatex
# ---------------------------------------------------------------------------

@router.get("/flatex/account")
async def get_flatex_account(
    _user: UserInfo = Depends(get_current_user),
) -> dict:
    """Flatex Kontostand via FinTS — PIN aus FLATEX_FINTS_PIN env-var."""
    import os
    username = await creds_svc.get_credential("FLATEX_FINTS_USER")
    pin = os.getenv("FLATEX_FINTS_PIN", "")
    account = await flatex_svc.fetch_account(username, pin)
    return account.to_dict()


@router.post("/flatex/sync")
async def flatex_sync(
    body: dict,
    _user: UserInfo = Depends(get_current_user),
) -> dict:
    """
    Flatex Kontostand-Sync mit session-PIN aus dem Request-Body.
    PIN wird NIEMALS gespeichert — gilt nur für diese Anfrage.

    Body: { "pin": "1234", "iban": "DE89..." }   (iban optional)
    """
    pin: str = body.get("pin", "").strip()
    iban: str = body.get("iban", "").strip()
    if not pin:
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail="PIN fehlt im Request-Body.")
    username = await creds_svc.get_credential("FLATEX_FINTS_USER")
    account = await flatex_svc.fetch_account(username, pin, iban or None)
    return account.to_dict()


@router.post("/flatex/import-csv")
async def flatex_import_csv(
    file: UploadFile = File(..., description="Flatex Depot-Export (CSV, Semikolon-getrennt)"),
    _user: UserInfo = Depends(get_current_user),
) -> dict:
    """
    Importiert einen Flatex Depot-CSV-Export.
    CSV unter: Mein Depot > Export > CSV-Export herunterladen.
    """
    content = await file.read()
    try:
        csv_text = content.decode("utf-8")
    except UnicodeDecodeError:
        # Flatex verwendet manchmal Windows-1252 (ANSI)
        csv_text = content.decode("windows-1252", errors="replace")

    portfolio = flatex_svc.parse_csv_portfolio(csv_text)
    return portfolio.to_dict()


# ---------------------------------------------------------------------------
# Crowdestor
# ---------------------------------------------------------------------------

@router.get("/crowdestor")
async def get_crowdestor(
    _user: UserInfo = Depends(get_current_user),
) -> dict:
    """Crowdestor P2P Crowdinvesting-Übersicht (inoffizielle API)."""
    email = await creds_svc.get_credential("CROWDESTOR_EMAIL")
    password = await creds_svc.get_credential("CROWDESTOR_PASSWORD")
    summary = await crowdestor_svc.fetch_summary(email, password)
    return summary.to_dict()


# ---------------------------------------------------------------------------
# Trade Republic
# ---------------------------------------------------------------------------

@router.get("/trade-republic")
async def get_trade_republic(
    _user: UserInfo = Depends(get_current_user),
) -> dict:
    """
    Trade Republic Portfolio via WebSocket-Reverse-Engineering (pytr).
    Benötigt: pip install pytr
    Bei erstem Connect: 2FA-Bestätigung in der TR-App erforderlich.
    """
    phone = await creds_svc.get_credential("TR_PHONE_NUMBER")
    pin = await creds_svc.get_credential("TR_PIN")
    summary = await tr_svc.fetch_portfolio(phone, pin)
    return summary.to_dict()


# ---------------------------------------------------------------------------
# WH SelfInvest
# ---------------------------------------------------------------------------

@router.get("/wh-selfinvest")
async def get_wh_selfinvest(
    _user: UserInfo = Depends(get_current_user),
) -> dict:
    """WH SelfInvest CFD/Futures Konto via cTrader Open API."""
    token = await creds_svc.get_credential("WH_CTRADER_ACCESS_TOKEN")
    account_id = await creds_svc.get_credential("WH_CTRADER_ACCOUNT_ID")
    summary = await wh_svc.fetch_account(token, account_id)
    return summary.to_dict()
