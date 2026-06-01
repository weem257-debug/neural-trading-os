"""
Crowdestor P2P / Crowdinvesting Client
========================================
Crowdestor hat keine öffentliche API.

Strategie:
  1. HTTP-Session mit E-Mail + Passwort (Cookie-basierte Auth)
  2. JSON-Endpunkte aus dem Web-Dashboard (via Browser-Dev-Tools ermittelt)
  3. Fallback: Demo-Daten

Diese Implementierung nutzt die internen API-Endpunkte des Crowdestor-Dashboards.
Diese können sich ohne Vorwarnung ändern — robuste Fehlerbehandlung ist kritisch.

Verfügbare Daten (nach Analyse des Dashboards):
  - Portfolio-Wert (aktuell investierter Betrag)
  - Zinsgutschriften (Einnahmen)
  - Projekte / Loan-Übersicht
  - Konto-Saldo

Env-Variablen:
  CROWDESTOR_EMAIL     — Konto-E-Mail-Adresse
  CROWDESTOR_PASSWORD  — Konto-Passwort
"""
from __future__ import annotations

import os
from datetime import datetime, UTC
from typing import Optional

import httpx

CROWDESTOR_BASE = "https://crowdestor.com"
CROWDESTOR_API = "https://crowdestor.com/api/v1"


# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------

class CrowdestorSummary:
    def __init__(
        self,
        total_invested: float,
        total_interest: float,
        cash_balance: float,
        num_active_projects: int,
        currency: str,
        fetched_at: datetime,
        is_demo: bool = False,
    ):
        self.total_invested = total_invested
        self.total_interest = total_interest
        self.cash_balance = cash_balance
        self.num_active_projects = num_active_projects
        self.currency = currency
        self.fetched_at = fetched_at
        self.is_demo = is_demo

    def to_dict(self) -> dict:
        return {
            "platform": "crowdestor",
            "total_invested": self.total_invested,
            "total_interest": self.total_interest,
            "cash_balance": self.cash_balance,
            "num_active_projects": self.num_active_projects,
            "currency": self.currency,
            "fetched_at": self.fetched_at.isoformat(),
            "is_demo": self.is_demo,
        }


# ---------------------------------------------------------------------------
# Demo fallback
# ---------------------------------------------------------------------------

_DEMO = CrowdestorSummary(
    total_invested=2_500.0,
    total_interest=187.50,
    cash_balance=125.0,
    num_active_projects=8,
    currency="EUR",
    fetched_at=datetime.now(UTC),
    is_demo=True,
)


# ---------------------------------------------------------------------------
# Client (inoffizielle API)
# ---------------------------------------------------------------------------

async def fetch_summary(
    email: Optional[str] = None,
    password: Optional[str] = None,
) -> CrowdestorSummary:
    """
    Ruft Crowdestor-Daten ab.
    Nutzt interne Dashboard-Endpunkte (cookie-basierte Session).
    """
    usr = email or os.getenv("CROWDESTOR_EMAIL", "")
    pwd = password or os.getenv("CROWDESTOR_PASSWORD", "")

    if not usr or not pwd:
        return _DEMO

    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
            # 1. Login — CSRF-Token holen
            login_page = await client.get(f"{CROWDESTOR_BASE}/login")
            # CSRF-Token aus Cookie oder HTML parsen
            csrf_token = _extract_csrf(login_page.text)

            # 2. Login POST
            login_data = {
                "email": usr,
                "password": pwd,
                "_token": csrf_token,
            }
            login_resp = await client.post(
                f"{CROWDESTOR_BASE}/login",
                data=login_data,
                headers={"Referer": f"{CROWDESTOR_BASE}/login"},
            )

            # Prüfen ob Login erfolgreich (Redirect zum Dashboard erwartet)
            if login_resp.status_code not in (200, 302) or "login" in str(login_resp.url):
                return _DEMO

            # 3. Dashboard-Daten abrufen
            dashboard_resp = await client.get(f"{CROWDESTOR_BASE}/dashboard")
            if dashboard_resp.status_code != 200:
                return _DEMO

            # 4. Portfolio-API-Endpunkt (intern)
            portfolio_resp = await client.get(
                f"{CROWDESTOR_BASE}/api/portfolio/summary",
                headers={"Accept": "application/json"},
            )

            if portfolio_resp.status_code == 200:
                try:
                    data = portfolio_resp.json()
                    return CrowdestorSummary(
                        total_invested=_safe_float(data.get("invested_amount")) or 0.0,
                        total_interest=_safe_float(data.get("interest_earned")) or 0.0,
                        cash_balance=_safe_float(data.get("available_balance")) or 0.0,
                        num_active_projects=int(data.get("active_investments", 0)),
                        currency="EUR",
                        fetched_at=datetime.now(UTC),
                        is_demo=False,
                    )
                except Exception:
                    pass

            # Fallback: HTML-Parsing des Dashboards
            return _parse_dashboard_html(dashboard_resp.text)

    except Exception:
        return _DEMO


def _extract_csrf(html: str) -> str:
    """Extrahiert CSRF-Token aus dem HTML."""
    import re
    match = re.search(r'<meta name="csrf-token" content="([^"]+)"', html)
    if match:
        return match.group(1)
    match = re.search(r'_token["\s]*value["\s]*=["\s]*[\'"]([^"\']+)[\'"]', html)
    if match:
        return match.group(1)
    return ""


def _parse_dashboard_html(html: str) -> CrowdestorSummary:
    """
    Letzter Fallback: Extrahiert Zahlen direkt aus dem Dashboard-HTML.
    Sehr fragil — nur wenn API-Endpunkte nicht verfügbar.
    """
    import re

    def _find_amount(pattern: str) -> float:
        match = re.search(pattern, html, re.IGNORECASE)
        if match:
            return _safe_float(match.group(1).replace(",", "").replace(" ", "")) or 0.0
        return 0.0

    # Typische Muster im Crowdestor-Dashboard
    invested = _find_amount(r'invested[^>]*>\s*€?\s*([\d,\.]+)')
    interest = _find_amount(r'interest[^>]*>\s*€?\s*([\d,\.]+)')
    balance = _find_amount(r'balance[^>]*>\s*€?\s*([\d,\.]+)')

    if invested > 0 or interest > 0 or balance > 0:
        return CrowdestorSummary(
            total_invested=invested,
            total_interest=interest,
            cash_balance=balance,
            num_active_projects=0,
            currency="EUR",
            fetched_at=datetime.now(UTC),
            is_demo=False,
        )

    return _DEMO


def _safe_float(v) -> Optional[float]:
    try:
        return float(str(v).replace(",", "").replace(" ", "")) if v is not None else None
    except (TypeError, ValueError):
        return None
