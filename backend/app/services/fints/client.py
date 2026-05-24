"""
FinTS German Bank Client
========================
Wraps python-fints to fetch depot holdings, account balances,
and recent transactions from any FinTS-compatible German bank.

Supported: comdirect, DKB, ING-DiBa, Sparkasse, Volksbank, Postbank, etc.
FinTS requires online PIN; PIN is never persisted — supplied per request.

Usage:
    from app.services.fints.client import fetch_bank_data

    result = await fetch_bank_data(
        blz="20041155",          # comdirect BLZ
        username="1234567890",
        pin="mypin",
        fints_url="https://fints.comdirect.de/fints",
    )
"""
import asyncio
import os
from datetime import date, datetime, UTC, timedelta
from typing import Optional


# ---------------------------------------------------------------------------
# Known BLZ → FinTS endpoint mapping (extend as needed)
# ---------------------------------------------------------------------------
BLZ_ENDPOINTS: dict[str, str] = {
    "20041155": "https://fints.comdirect.de/fints",
    "12030000": "https://banking-dkb.s-fints-pt-dkb.de/fints30",
    "50010517": "https://fints.ing-diba.de/fints/",
    # Sparkasse uses regional endpoints — user must supply URL
    # Volksbank uses cooperative endpoint
    "30060010": "https://www.fiducia.de/FKS/Logon",  # Volksbank via Fiducia
}


class FinTSHolding:
    def __init__(self, isin: str, name: str, quantity: float, price: float, currency: str, value_eur: float):
        self.isin = isin
        self.name = name
        self.quantity = quantity
        self.price = price
        self.currency = currency
        self.value_eur = value_eur

    def to_dict(self) -> dict:
        return {
            "isin": self.isin,
            "name": self.name,
            "quantity": self.quantity,
            "price": self.price,
            "currency": self.currency,
            "value_eur": self.value_eur,
        }


class FinTSResult:
    def __init__(
        self,
        bank_name: str,
        blz: str,
        account_iban: Optional[str],
        balance: float,
        currency: str,
        holdings: list[FinTSHolding],
        fetched_at: datetime,
        is_demo: bool = False,
        error: Optional[str] = None,
    ):
        self.bank_name = bank_name
        self.blz = blz
        self.account_iban = account_iban
        self.balance = balance
        self.currency = currency
        self.holdings = holdings
        self.fetched_at = fetched_at
        self.is_demo = is_demo
        self.error = error

    def to_dict(self) -> dict:
        return {
            "bank_name": self.bank_name,
            "blz": self.blz,
            "account_iban": self.account_iban,
            "balance": self.balance,
            "currency": self.currency,
            "holdings": [h.to_dict() for h in self.holdings],
            "holdings_total_eur": sum(h.value_eur for h in self.holdings),
            "fetched_at": self.fetched_at.isoformat(),
            "is_demo": self.is_demo,
            "error": self.error,
        }


# ---------------------------------------------------------------------------
# Demo fallback
# ---------------------------------------------------------------------------

_DEMO_RESULT = FinTSResult(
    bank_name="Demo Bank (comdirect)",
    blz="20041155",
    account_iban="DE89370400440532013000",
    balance=3_420.80,
    currency="EUR",
    holdings=[
        FinTSHolding("DE0005140008", "Deutsche Bank AG", 50.0, 11.24, "EUR", 562.0),
        FinTSHolding("DE0005752000", "Lufthansa AG", 100.0, 7.83, "EUR", 783.0),
        FinTSHolding("US0378331005", "Apple Inc.", 20.0, 172.50, "EUR", 3_450.0),
    ],
    fetched_at=datetime.now(UTC),
    is_demo=True,
)


# ---------------------------------------------------------------------------
# Live fetch via python-fints (runs in thread — FinTS is synchronous)
# ---------------------------------------------------------------------------

def _sync_fetch(blz: str, username: str, pin: str, fints_url: str, iban: Optional[str]) -> FinTSResult:
    """Blocking FinTS call — must be wrapped in asyncio.to_thread()."""
    try:
        from fints.client import FinTS3PinTanClient
        from fints.models import SEPAAccount

        client = FinTS3PinTanClient(
            bank_identifier=blz,
            user_id=username,
            pin=pin,
            server=fints_url,
            product_id="F4NTASTICF1NTS00001",  # required by spec — replace with real ID for production
        )

        # Resolve bank name
        bank_name = client.get_information().get("bank", {}).get("name", f"Bank {blz}")

        # Get all accounts
        accounts = client.get_sepa_accounts()
        if not accounts:
            return FinTSResult(
                bank_name=bank_name, blz=blz, account_iban=None,
                balance=0.0, currency="EUR", holdings=[],
                fetched_at=datetime.now(UTC), is_demo=False,
                error="No SEPA accounts found",
            )

        # Use first account or find matching IBAN
        account = accounts[0]
        if iban:
            for a in accounts:
                if hasattr(a, "iban") and a.iban == iban:
                    account = a
                    break

        # Fetch balance
        balance_result = client.get_balance(account)
        balance = float(balance_result.amount.amount) if balance_result else 0.0
        currency = str(balance_result.amount.currency) if balance_result else "EUR"

        # Fetch depot holdings (may not be available for all accounts)
        holdings: list[FinTSHolding] = []
        try:
            depot_accounts = [a for a in accounts if hasattr(a, "depot_id")]
            if depot_accounts:
                positions = client.get_holdings(depot_accounts[0])
                for pos in positions:
                    holdings.append(FinTSHolding(
                        isin=getattr(pos, "isin", "") or "",
                        name=getattr(pos, "name", "") or "",
                        quantity=float(getattr(pos, "pieces", 0) or 0),
                        price=float(getattr(pos, "price", 0) or 0),
                        currency=str(getattr(pos, "currency", "EUR")),
                        value_eur=float(getattr(pos, "market_value", 0) or 0),
                    ))
        except Exception:
            pass  # Holdings not available — balance only

        return FinTSResult(
            bank_name=bank_name,
            blz=blz,
            account_iban=getattr(account, "iban", None),
            balance=balance,
            currency=currency,
            holdings=holdings,
            fetched_at=datetime.now(UTC),
            is_demo=False,
        )

    except ImportError:
        return FinTSResult(
            bank_name=f"Bank {blz}", blz=blz, account_iban=None,
            balance=0.0, currency="EUR", holdings=[],
            fetched_at=datetime.now(UTC), is_demo=True,
            error="python-fints not installed — install it with: pip install python-fints",
        )
    except Exception as e:
        return FinTSResult(
            bank_name=f"Bank {blz}", blz=blz, account_iban=None,
            balance=0.0, currency="EUR", holdings=[],
            fetched_at=datetime.now(UTC), is_demo=False,
            error=str(e)[:200],
        )


async def fetch_bank_data(
    blz: str,
    username: str,
    pin: str,
    fints_url: Optional[str] = None,
    iban: Optional[str] = None,
) -> FinTSResult:
    """
    Async wrapper for FinTS data fetch.
    If blz or pin is empty → returns demo data.
    Runs blocking FinTS I/O in a thread pool.
    """
    if not blz or not pin or not username:
        return _DEMO_RESULT

    url = fints_url or BLZ_ENDPOINTS.get(blz, "")
    if not url:
        return FinTSResult(
            bank_name=f"Bank {blz}", blz=blz, account_iban=None,
            balance=0.0, currency="EUR", holdings=[],
            fetched_at=datetime.now(UTC), is_demo=False,
            error=f"No FinTS URL known for BLZ {blz}. Please supply fints_url.",
        )

    return await asyncio.to_thread(_sync_fetch, blz, username, pin, url, iban)
