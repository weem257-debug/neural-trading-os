"""
Bondora P2P Client
==================
Wraps the Bondora Public API v1 (Bearer token auth).
Falls back to demo data when no API key is configured.

Docs: https://api.bondora.com/

Required env var: BONDORA_API_KEY
"""
import os
from datetime import datetime, UTC
from typing import Optional

import httpx

BONDORA_BASE = "https://api.bondora.com/v1"


class BondoraSummary:
    def __init__(
        self,
        total_invested: float,
        outstanding_principal: float,
        interest_month: float,
        total_interest: float,
        defaulted_amount: float,
        cash_balance: float,
        net_annual_return: Optional[float],
        num_active_loans: int,
        currency: str,
        fetched_at: datetime,
        is_demo: bool = False,
    ):
        self.total_invested = total_invested
        self.outstanding_principal = outstanding_principal
        self.interest_month = interest_month
        self.total_interest = total_interest
        self.defaulted_amount = defaulted_amount
        self.cash_balance = cash_balance
        self.net_annual_return = net_annual_return
        self.num_active_loans = num_active_loans
        self.currency = currency
        self.fetched_at = fetched_at
        self.is_demo = is_demo

    def to_dict(self) -> dict:
        return {
            "platform": "bondora",
            "total_invested": self.total_invested,
            "outstanding_principal": self.outstanding_principal,
            "interest_month": self.interest_month,
            "total_interest": self.total_interest,
            "defaulted_amount": self.defaulted_amount,
            "cash_balance": self.cash_balance,
            "net_annual_return": self.net_annual_return,
            "num_active_loans": self.num_active_loans,
            "currency": self.currency,
            "fetched_at": self.fetched_at.isoformat(),
            "is_demo": self.is_demo,
        }


_DEMO = BondoraSummary(
    total_invested=3_200.00,
    outstanding_principal=3_050.00,
    interest_month=21.40,
    total_interest=198.60,
    defaulted_amount=150.00,
    cash_balance=34.20,
    net_annual_return=7.1,
    num_active_loans=54,
    currency="EUR",
    fetched_at=datetime.now(UTC),
    is_demo=True,
)


async def fetch_summary(api_key: Optional[str] = None) -> BondoraSummary:
    key = api_key or os.getenv("BONDORA_API_KEY", "")
    if not key:
        return _DEMO

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            headers = {"Authorization": f"Bearer {key}"}

            r = await client.get(f"{BONDORA_BASE}/account/balance", headers=headers)
            r.raise_for_status()
            balance = r.json().get("Payload", {})

            r_stats = await client.get(f"{BONDORA_BASE}/account/investments", headers=headers)
            r_stats.raise_for_status()
            stats = r_stats.json().get("Payload", {})

        total_principal = float(balance.get("TotalPrincipalOutstanding", 0))
        cash = float(balance.get("Balance", 0))
        total_int = float(stats.get("TotalInterestReceived", 0))
        defaulted = float(stats.get("TotalAmountDefaulted", 0))
        active = int(stats.get("NumberOfActiveLoans", 0))

        return BondoraSummary(
            total_invested=total_principal + cash,
            outstanding_principal=total_principal,
            interest_month=0.0,
            total_interest=total_int,
            defaulted_amount=defaulted,
            cash_balance=cash,
            net_annual_return=_safe_float(stats.get("NetAnnualReturn")),
            num_active_loans=active,
            currency="EUR",
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
