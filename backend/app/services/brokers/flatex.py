"""
Flatex / flatexDEGIRO Bank Client
===================================
Flatex hat keine offizielle öffentliche API für Endkunden.
Fallback-Strategie (in dieser Reihenfolge):

  1. FinTS/HBCI (python-fints) — Flatex unterstützt FinTS für Konten
     BLZ: 30080080 (flatexDEGIRO Bank AG)
     Einschränkung: FinTS gibt nur Kontostand und Buchungen, NICHT Depot-Positionen
     mit aktuellem Marktwert zurück.

  2. flatex API Bibliothek (inoffiziell, community) — nicht stabil genug für
     Production-Einsatz.

  3. Empfehlung: Depot-Import via CSV (flatex erlaubt CSV-Export).

Für dieses System nutzen wir den FinTS-Weg für Kontostand-Abruf und
bieten CSV-Import als Alternative für Depot-Positionen.

Env-Variablen:
  FLATEX_FINTS_BLZ      — 30080080 (flatexDEGIRO Bank)
  FLATEX_FINTS_USER     — Kundennummer / Benutzername
  FLATEX_FINTS_PIN      — Online-Banking PIN (NIE im Klartext speichern!)
  FLATEX_FINTS_ACCOUNT  — IBAN des Verrechnungskontos (optional)

Hinweis: Die PIN wird NICHT in der DB gespeichert. Sie muss bei jeder
         Session-Abfrage übergeben werden.
"""
from __future__ import annotations

import os
from datetime import datetime, UTC
from typing import Optional

_FINTS_AVAILABLE = False
try:
    from fints.client import FinTS3PinTanClient
    _FINTS_AVAILABLE = True
except ImportError:
    pass


# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------

class FlatexAccountSummary:
    """Konto-Übersicht via FinTS (Saldo + Buchungen)."""

    def __init__(
        self,
        account_iban: str,
        balance: float,
        currency: str,
        transactions: list[dict],
        fetched_at: datetime,
        is_demo: bool = False,
        lib_missing: bool = False,
        method: str = "fints",
    ):
        self.account_iban = account_iban
        self.balance = balance
        self.currency = currency
        self.transactions = transactions
        self.fetched_at = fetched_at
        self.is_demo = is_demo
        self.lib_missing = lib_missing
        self.method = method

    def to_dict(self) -> dict:
        return {
            "broker": "flatex",
            "account_iban": self.account_iban,
            "balance": self.balance,
            "currency": self.currency,
            "num_transactions": len(self.transactions),
            "transactions": self.transactions[:20],  # Max 20 in der Summary
            "method": self.method,
            "fetched_at": self.fetched_at.isoformat(),
            "is_demo": self.is_demo,
            "lib_missing": self.lib_missing,
        }


class FlatexPortfolio:
    """
    Depot-Positionen (nur via CSV-Import oder manuell, da FinTS keine
    realtime Marktwerte liefert).
    """

    def __init__(
        self,
        positions: list[dict],
        total_value: float,
        currency: str,
        source: str,  # "csv_import" | "fints" | "manual" | "demo"
        fetched_at: datetime,
        is_demo: bool = False,
    ):
        self.positions = positions
        self.total_value = total_value
        self.currency = currency
        self.source = source
        self.fetched_at = fetched_at
        self.is_demo = is_demo

    def to_dict(self) -> dict:
        return {
            "broker": "flatex",
            "total_value": self.total_value,
            "currency": self.currency,
            "num_positions": len(self.positions),
            "positions": self.positions,
            "source": self.source,
            "fetched_at": self.fetched_at.isoformat(),
            "is_demo": self.is_demo,
        }


# ---------------------------------------------------------------------------
# Demo data
# ---------------------------------------------------------------------------

_DEMO_ACCOUNT = FlatexAccountSummary(
    account_iban="DE89 3008 0080 0123 4567 00",
    balance=1_250.75,
    currency="EUR",
    transactions=[
        {"date": "2025-01-15", "amount": -500.0, "description": "Wertpapierkauf ISIN DE0005140008", "type": "debit"},
        {"date": "2025-01-10", "amount": 250.0, "description": "Dividende ASML Holding", "type": "credit"},
        {"date": "2025-01-05", "amount": 2_000.0, "description": "Einzahlung", "type": "credit"},
    ],
    fetched_at=datetime.now(UTC),
    is_demo=True,
)

_DEMO_PORTFOLIO = FlatexPortfolio(
    positions=[
        {"isin": "DE0005140008", "wkn": "514000", "name": "Deutsche Bank AG", "quantity": 50.0, "avg_price": 9.80, "current_value": 615.0, "currency": "EUR"},
        {"isin": "LU0274208692", "wkn": "A0MMBM", "name": "DWS Deutschland LC", "quantity": 15.0, "avg_price": 130.0, "current_value": 2_184.0, "currency": "EUR"},
        {"isin": "DE0006231004", "wkn": "623100", "name": "Infineon Technologies", "quantity": 30.0, "avg_price": 28.50, "current_value": 963.0, "currency": "EUR"},
    ],
    total_value=3_762.0,
    currency="EUR",
    source="demo",
    fetched_at=datetime.now(UTC),
    is_demo=True,
)


# ---------------------------------------------------------------------------
# FinTS Client (Kontostand)
# ---------------------------------------------------------------------------

FLATEX_BLZ = "30080080"  # flatexDEGIRO Bank AG
FLATEX_FINTS_URL = "https://banking.flatex.de/fints"


async def fetch_account(
    username: Optional[str] = None,
    pin: Optional[str] = None,
    iban: Optional[str] = None,
) -> FlatexAccountSummary:
    """
    Ruft Kontostand via FinTS ab.
    PIN wird NICHT gespeichert — muss jedes Mal übergeben werden.
    """
    if not _FINTS_AVAILABLE:
        result = FlatexAccountSummary(
            account_iban="",
            balance=0.0,
            currency="EUR",
            transactions=[],
            fetched_at=datetime.now(UTC),
            is_demo=True,
            lib_missing=True,
        )
        return result

    usr = username or os.getenv("FLATEX_FINTS_USER", "")
    pwd = pin or os.getenv("FLATEX_FINTS_PIN", "")
    target_iban = iban or os.getenv("FLATEX_FINTS_ACCOUNT", "")

    if not usr or not pwd:
        return _DEMO_ACCOUNT

    try:
        import asyncio

        def _fetch_sync():
            client = FinTS3PinTanClient(
                bank_identifier=FLATEX_BLZ,
                user_id=usr,
                pin=pwd,
                server=FLATEX_FINTS_URL,
            )
            with client:
                accounts = client.get_sepa_accounts()
                if not accounts:
                    return None, []

                # Ziel-Konto wählen (IBAN-Filter oder erstes Konto)
                account = None
                for acc in accounts:
                    if not target_iban or acc.iban == target_iban:
                        account = acc
                        break

                if not account:
                    account = accounts[0]

                balance_result = client.get_balance(account)
                transactions_result = client.get_transactions(account)

                return balance_result, transactions_result

        balance, raw_transactions = await asyncio.to_thread(_fetch_sync)

        if balance is None:
            return _DEMO_ACCOUNT

        balance_val = float(balance.balance.amount)
        currency = str(balance.balance.currency)
        account_iban = target_iban or ""

        # Transaktionen aufbereiten
        transactions = []
        for tx in (raw_transactions or [])[:50]:
            tx_data = {
                "date": tx.data.get("date", ""),
                "amount": float(tx.data.get("amount", {}).get("amount", 0)),
                "currency": str(tx.data.get("amount", {}).get("currency", "EUR")),
                "description": tx.data.get("transaction_code", ""),
                "applicant_name": tx.data.get("applicant_name", ""),
                "purpose": tx.data.get("purpose", ""),
                "type": "credit" if float(tx.data.get("amount", {}).get("amount", 0)) > 0 else "debit",
            }
            transactions.append(tx_data)

        return FlatexAccountSummary(
            account_iban=account_iban,
            balance=balance_val,
            currency=currency,
            transactions=transactions,
            fetched_at=datetime.now(UTC),
            is_demo=False,
            method="fints",
        )

    except Exception:
        return _DEMO_ACCOUNT


def parse_csv_portfolio(csv_content: str) -> FlatexPortfolio:
    """
    Parsed einen flatex Depot-Export (CSV).
    CSV-Format von flatex: Trennzeichen Semikolon, UTF-8-Encoding.

    Erwartete Spalten (flatex Standard-Export):
      WKN; ISIN; Bezeichnung; Stuecke; Kaufkurs; Kaufwert; Kurs; Kurswert; W-Gewinn-Verlust-EUR
    """
    import csv
    import io

    positions = []
    total_value = 0.0

    try:
        reader = csv.DictReader(io.StringIO(csv_content), delimiter=";")
        for row in reader:
            # Normalisierung der Spaltennamen (flatex ist inkonsistent)
            row = {k.strip().lower().replace(" ", "_"): v.strip() for k, v in row.items()}

            name = row.get("bezeichnung") or row.get("name") or "Unknown"
            isin = row.get("isin", "")
            wkn = row.get("wkn", "")
            qty = _safe_float(row.get("stuecke") or row.get("quantity") or "0")
            avg_price = _safe_float(row.get("kaufkurs") or row.get("purchase_price") or "0")
            current_value = _safe_float(row.get("kurswert") or row.get("current_value") or "0")

            if not name or not current_value:
                continue

            positions.append({
                "isin": isin,
                "wkn": wkn,
                "name": name,
                "quantity": qty or 0.0,
                "avg_price": avg_price,
                "current_value": current_value,
                "currency": "EUR",
            })
            total_value += current_value or 0.0

    except Exception:
        return FlatexPortfolio(
            positions=[],
            total_value=0.0,
            currency="EUR",
            source="csv_import_error",
            fetched_at=datetime.now(UTC),
            is_demo=False,
        )

    return FlatexPortfolio(
        positions=positions,
        total_value=round(total_value, 2),
        currency="EUR",
        source="csv_import",
        fetched_at=datetime.now(UTC),
        is_demo=False,
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _safe_float(v) -> Optional[float]:
    if v is None:
        return None
    try:
        # Deutsches Zahlenformat: Punkt als Tausendertrennzeichen, Komma als Dezimal
        cleaned = str(v).replace(".", "").replace(",", ".").strip()
        return float(cleaned)
    except (TypeError, ValueError):
        return None
