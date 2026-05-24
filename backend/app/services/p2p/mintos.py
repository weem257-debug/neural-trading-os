"""
Mintos P2P Client
==================
Wraps the Mintos Investor API v2 (Bearer token auth).
Falls back to demo data when no API key is configured.

Docs: https://developers.mintos.com/

Required env var: MINTOS_API_KEY
"""
import os
from datetime import datetime, UTC
from typing import Optional

import httpx

MINTOS_BASE = "https://www.mintos.com/en/api/investor/v2"

# ---------------------------------------------------------------------------
# Public summary model
# ---------------------------------------------------------------------------

class MintosSummary:
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
            "platform": "mintos",
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


# ---------------------------------------------------------------------------
# Demo fallback
# ---------------------------------------------------------------------------

_DEMO = MintosSummary(
    total_invested=5_420.00,
    outstanding_principal=5_310.80,
    interest_month=38.47,
    total_interest=312.90,
    defaulted_amount=109.20,
    cash_balance=89.30,
    net_annual_return=8.4,
    num_active_loans=87,
    currency="EUR",
    fetched_at=datetime.now(UTC),
    is_demo=True,
)


# ---------------------------------------------------------------------------
# Client
# ---------------------------------------------------------------------------

async def fetch_summary(api_key: Optional[str] = None) -> MintosSummary:
    """
    Fetch portfolio summary from Mintos.
    Returns demo data if no API key is set or the request fails.
    """
    key = api_key or os.getenv("MINTOS_API_KEY", "")
    if not key:
        return _DEMO

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            headers = {"Authorization": f"Bearer {key}"}

            # Fetch account overview
            r_overview = await client.get(f"{MINTOS_BASE}/account/overview", headers=headers)
            r_overview.raise_for_status()
            overview = r_overview.json()

            # Fetch investments summary
            r_inv = await client.get(f"{MINTOS_BASE}/investments/summary", headers=headers)
            r_inv.raise_for_status()
            inv = r_inv.json()

        return MintosSummary(
            total_invested=float(inv.get("totalInvested", 0)),
            outstanding_principal=float(inv.get("outstandingPrincipal", 0)),
            interest_month=float(inv.get("interestReceivedCurrentMonth", 0)),
            total_interest=float(inv.get("totalInterestReceived", 0)),
            defaulted_amount=float(inv.get("defaultedAmount", 0)),
            cash_balance=float(overview.get("cashBalance", 0)),
            net_annual_return=_safe_float(inv.get("netAnnualReturn")),
            num_active_loans=int(inv.get("activeLoansCount", 0)),
            currency=overview.get("currency", "EUR"),
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
