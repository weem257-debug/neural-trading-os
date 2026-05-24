"""
P2P Lending Platform Routes
============================
Aggregates Mintos, Bondora, PeerBerry data in one API.

GET  /api/p2p/summary        — all platforms combined (demo if no keys)
GET  /api/p2p/mintos         — Mintos only
GET  /api/p2p/bondora        — Bondora only
GET  /api/p2p/peerberry      — PeerBerry only
POST /api/p2p/snapshot       — persist latest snapshot to DB
GET  /api/p2p/history        — last N snapshots per platform
"""
import asyncio
from datetime import datetime, UTC
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select

from app.api.auth import get_current_user, UserInfo
from app.db.database import get_session
from app.db.models import P2PSnapshot
from app.services.p2p import mintos as mintos_svc
from app.services.p2p import bondora as bondora_svc
from app.services.p2p import peerberry as peerberry_svc

router = APIRouter(prefix="/p2p", tags=["P2P Lending"])


# ---------------------------------------------------------------------------
# Individual platform endpoints
# ---------------------------------------------------------------------------

@router.get("/mintos")
async def get_mintos(
    api_key: Optional[str] = Query(None, description="Mintos API key (overrides env var)"),
    _user: UserInfo = Depends(get_current_user),
) -> dict:
    summary = await mintos_svc.fetch_summary(api_key)
    return summary.to_dict()


@router.get("/bondora")
async def get_bondora(
    api_key: Optional[str] = Query(None, description="Bondora API key (overrides env var)"),
    _user: UserInfo = Depends(get_current_user),
) -> dict:
    summary = await bondora_svc.fetch_summary(api_key)
    return summary.to_dict()


@router.get("/peerberry")
async def get_peerberry(
    email: Optional[str] = Query(None),
    password: Optional[str] = Query(None),
    _user: UserInfo = Depends(get_current_user),
) -> dict:
    summary = await peerberry_svc.fetch_summary(email, password)
    return summary.to_dict()


# ---------------------------------------------------------------------------
# Combined summary (fetches all platforms in parallel)
# ---------------------------------------------------------------------------

@router.get("/summary")
async def get_p2p_summary(
    _user: UserInfo = Depends(get_current_user),
) -> dict:
    mintos_task = asyncio.create_task(mintos_svc.fetch_summary())
    bondora_task = asyncio.create_task(bondora_svc.fetch_summary())
    peerberry_task = asyncio.create_task(peerberry_svc.fetch_summary())

    mintos_data, bondora_data, peerberry_data = await asyncio.gather(
        mintos_task, bondora_task, peerberry_task
    )

    platforms = [mintos_data.to_dict(), bondora_data.to_dict(), peerberry_data.to_dict()]

    total_invested = sum(p["total_invested"] for p in platforms)
    total_interest = sum(p["total_interest"] for p in platforms)
    total_defaulted = sum(p["defaulted_amount"] for p in platforms)
    total_cash = sum(p["cash_balance"] for p in platforms)
    total_principal = sum(p["outstanding_principal"] for p in platforms)
    all_demo = all(p["is_demo"] for p in platforms)

    # Weighted average net annual return (by outstanding principal)
    war = None
    weighted_sum = sum(
        (p["net_annual_return"] or 0) * p["outstanding_principal"]
        for p in platforms
        if p["net_annual_return"] is not None
    )
    if total_principal > 0:
        war = round(weighted_sum / total_principal, 2)

    return {
        "total_invested": round(total_invested, 2),
        "outstanding_principal": round(total_principal, 2),
        "total_interest": round(total_interest, 2),
        "total_defaulted": round(total_defaulted, 2),
        "cash_balance": round(total_cash, 2),
        "net_annual_return_weighted": war,
        "platforms": platforms,
        "is_demo": all_demo,
        "fetched_at": datetime.now(UTC).isoformat(),
    }


# ---------------------------------------------------------------------------
# Persist snapshot
# ---------------------------------------------------------------------------

@router.post("/snapshot", status_code=201)
async def save_snapshot(
    portfolio_id: Optional[int] = Query(None),
    _user: UserInfo = Depends(get_current_user),
) -> dict:
    """Fetch all platforms and persist the current values as DB snapshots."""
    mintos_data = await mintos_svc.fetch_summary()
    bondora_data = await bondora_svc.fetch_summary()
    peerberry_data = await peerberry_svc.fetch_summary()

    saved = []
    async with get_session() as session:
        for svc_data in [mintos_data, bondora_data, peerberry_data]:
            snap = P2PSnapshot(
                portfolio_id=portfolio_id,
                platform=svc_data.to_dict()["platform"],
                total_invested=svc_data.total_invested,
                outstanding_principal=svc_data.outstanding_principal,
                interest_month=svc_data.interest_month,
                total_interest=svc_data.total_interest,
                defaulted_amount=svc_data.defaulted_amount,
                cash_balance=svc_data.cash_balance,
                net_annual_return=svc_data.net_annual_return,
                num_active_loans=svc_data.num_active_loans,
                currency=svc_data.currency,
                fetched_at=datetime.now(UTC),
            )
            session.add(snap)
            saved.append(snap.platform)
        await session.commit()

    return {"saved": saved, "portfolio_id": portfolio_id}


# ---------------------------------------------------------------------------
# History
# ---------------------------------------------------------------------------

@router.get("/history")
async def get_p2p_history(
    platform: Optional[str] = Query(None, description="Filter by platform name"),
    limit: int = Query(30, ge=1, le=200),
    _user: UserInfo = Depends(get_current_user),
) -> list[dict]:
    async with get_session() as session:
        q = select(P2PSnapshot).order_by(P2PSnapshot.fetched_at.desc()).limit(limit)
        if platform:
            q = q.where(P2PSnapshot.platform == platform)
        result = await session.execute(q)
        snapshots = result.scalars().all()

    return [
        {
            "id": s.id,
            "platform": s.platform,
            "portfolio_id": s.portfolio_id,
            "total_invested": s.total_invested,
            "outstanding_principal": s.outstanding_principal,
            "interest_month": s.interest_month,
            "total_interest": s.total_interest,
            "defaulted_amount": s.defaulted_amount,
            "cash_balance": s.cash_balance,
            "net_annual_return": s.net_annual_return,
            "num_active_loans": s.num_active_loans,
            "currency": s.currency,
            "fetched_at": s.fetched_at.isoformat(),
        }
        for s in snapshots
    ]
