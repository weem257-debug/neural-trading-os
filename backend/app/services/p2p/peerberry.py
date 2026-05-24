"""
PeerBerry P2P Client
====================
Wraps the PeerBerry API v1 (email/password Bearer auth).
Falls back to demo data when no credentials are configured.

Docs: https://peerberry.com/en/api

Required env vars: PEERBERRY_EMAIL, PEERBERRY_PASSWORD
"""
import os
from datetime import datetime, UTC
from typing import Optional

import httpx

PEERBERRY_BASE = "https://api.peerberry.com/v1"


class PeerBerrySummary:
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
            "platform": "peerberry",
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


_DEMO = PeerBerrySummary(
    total_invested=2_800.00,
    outstanding_principal=2_750.00,
    interest_month=18.60,
    total_interest=142.30,
    defaulted_amount=0.0,
    cash_balance=50.00,
    net_annual_return=9.8,
    num_active_loans=42,
    currency="EUR",
    fetched_at=datetime.now(UTC),
    is_demo=True,
)


async def _get_token(email: str, password: str, client: httpx.AsyncClient) -> str:
    r = await client.post(
        f"{PEERBERRY_BASE}/auth/login",
        json={"email": email, "password": password},
        timeout=15,
    )
    r.raise_for_status()
    return r.json()["access_token"]


async def fetch_summary(email: Optional[str] = None, password: Optional[str] = None) -> PeerBerrySummary:
    _email = email or os.getenv("PEERBERRY_EMAIL", "")
    _password = password or os.getenv("PEERBERRY_PASSWORD", "")
    if not _email or not _password:
        return _DEMO

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            token = await _get_token(_email, _password, client)
            headers = {"Authorization": f"Bearer {token}"}

            r_bal = await client.get(f"{PEERBERRY_BASE}/investor/summary", headers=headers)
            r_bal.raise_for_status()
            summary = r_bal.json()

        return PeerBerrySummary(
            total_invested=float(summary.get("totalInvested", 0)),
            outstanding_principal=float(summary.get("outstandingPrincipal", 0)),
            interest_month=float(summary.get("interestCurrentMonth", 0)),
            total_interest=float(summary.get("totalInterestEarned", 0)),
            defaulted_amount=float(summary.get("lateAmount", 0)),
            cash_balance=float(summary.get("availableCash", 0)),
            net_annual_return=_safe_float(summary.get("netAnnualReturn")),
            num_active_loans=int(summary.get("activeLoansCount", 0)),
            currency=summary.get("currency", "EUR"),
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
