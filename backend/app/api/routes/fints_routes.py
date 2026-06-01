"""
FinTS Bank Connection Routes
=============================
Manage German bank connections and sync depot/account data.

POST /api/bank/sync           — one-time sync (PIN in body, not stored)
GET  /api/bank/connections    — list saved connections
POST /api/bank/connections    — save a bank connection (no PIN)
DELETE /api/bank/connections/{id} — remove a connection
"""
from datetime import datetime, UTC
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.api.auth import get_current_user, UserInfo
from app.db.database import get_session
from app.db.models import BankConnection
from app.services.fints.client import fetch_bank_data, BLZ_ENDPOINTS

router = APIRouter(prefix="/bank", tags=["Bank / FinTS"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class BankSyncRequest(BaseModel):
    blz: str = Field(..., min_length=8, max_length=8, description="8-digit Bankleitzahl")
    username: str = Field(..., min_length=1, max_length=100)
    pin: str = Field(..., min_length=4, max_length=20, description="Online banking PIN — not stored")
    fints_url: Optional[str] = Field(None, description="FinTS endpoint URL (auto-detected for major banks)")
    iban: Optional[str] = Field(None, description="Optional: IBAN to select specific account")


class BankConnectionCreate(BaseModel):
    bank_name: str = Field(..., min_length=1, max_length=100)
    blz: str = Field(..., min_length=8, max_length=8)
    username: str = Field(..., min_length=1, max_length=100)
    account_iban: Optional[str] = Field(None, max_length=34)
    portfolio_id: Optional[int] = None
    currency: str = Field("EUR", max_length=3)


class BankConnectionOut(BaseModel):
    id: int
    owner_username: Optional[str]
    bank_name: str
    blz: str
    username: str
    account_iban: Optional[str]
    portfolio_id: Optional[int]
    last_synced: Optional[datetime]
    last_balance: Optional[float]
    currency: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/sync")
async def sync_bank(
    body: BankSyncRequest,
    user: UserInfo = Depends(get_current_user),
) -> dict:
    """
    Perform a live FinTS sync.
    PIN is used in-memory for this request only — never persisted.
    """
    result = await fetch_bank_data(
        blz=body.blz,
        username=body.username,
        pin=body.pin,
        fints_url=body.fints_url,
        iban=body.iban,
    )

    if result.error and not result.is_demo:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"FinTS-Synchronisation fehlgeschlagen: {result.error}",
        )

    # Update last_synced on stored connection if it exists (scoped to owner)
    async with get_session() as session:
        q_result = await session.execute(
            select(BankConnection).where(
                BankConnection.owner_username == user.username,
                BankConnection.blz == body.blz,
                BankConnection.username == body.username,
            )
        )
        conn = q_result.scalar_one_or_none()
        if conn:
            conn.last_synced = datetime.now(UTC)
            conn.last_balance = result.balance
            if result.account_iban:
                conn.account_iban = result.account_iban
            await session.commit()

    return result.to_dict()


@router.get("/connections", response_model=list[BankConnectionOut])
async def list_connections(
    user: UserInfo = Depends(get_current_user),
) -> list[BankConnectionOut]:
    async with get_session() as session:
        result = await session.execute(
            select(BankConnection)
            .where(BankConnection.owner_username == user.username)
            .order_by(BankConnection.created_at)
        )
        connections = result.scalars().all()
    return [BankConnectionOut.model_validate(c) for c in connections]


@router.post("/connections", response_model=BankConnectionOut, status_code=status.HTTP_201_CREATED)
async def add_connection(
    body: BankConnectionCreate,
    user: UserInfo = Depends(get_current_user),
) -> BankConnectionOut:
    async with get_session() as session:
        conn = BankConnection(
            owner_username=user.username,
            bank_name=body.bank_name,
            blz=body.blz,
            username=body.username,
            account_iban=body.account_iban,
            portfolio_id=body.portfolio_id,
            currency=body.currency.upper(),
            created_at=datetime.now(UTC),
        )
        session.add(conn)
        await session.commit()
        await session.refresh(conn)
    return BankConnectionOut.model_validate(conn)


@router.delete("/connections/{connection_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_connection(
    connection_id: int,
    user: UserInfo = Depends(get_current_user),
) -> None:
    async with get_session() as session:
        result = await session.execute(
            select(BankConnection).where(
                BankConnection.id == connection_id,
                BankConnection.owner_username == user.username,
            )
        )
        conn = result.scalar_one_or_none()
        if not conn:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Verbindung nicht gefunden")
        await session.delete(conn)
        await session.commit()


@router.get("/known-banks")
async def list_known_banks(
    _user: UserInfo = Depends(get_current_user),
) -> list[dict]:
    """Returns the list of banks with auto-detected FinTS endpoints."""
    bank_names = {
        "20041155": "comdirect",
        "12030000": "DKB",
        "50010517": "ING-DiBa",
        "30060010": "Volksbank (Fiducia)",
    }
    return [
        {"blz": blz, "name": bank_names.get(blz, f"Bank {blz}"), "fints_url": url}
        for blz, url in BLZ_ENDPOINTS.items()
    ]
