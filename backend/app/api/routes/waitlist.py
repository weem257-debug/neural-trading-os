"""
/api/waitlist — Email Waitlist
"""
import re
from datetime import datetime, UTC
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.api.auth import UserInfo, get_current_user
from app.core.rate_limits import limiter
from app.db.database import get_session
from app.db.models import WaitlistEntry

router = APIRouter(prefix="/waitlist", tags=["Waitlist"])

_EMAIL_RE = re.compile(r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$")


class WaitlistJoinRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=254)
    plan_interest: Optional[Literal["basic", "pro", "institutional"]] = None
    source: str = Field(default="landing-page", max_length=50)

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        v = v.strip().lower()
        if not _EMAIL_RE.match(v):
            raise ValueError("Invalid email address")
        return v


class WaitlistJoinResponse(BaseModel):
    success: bool
    already_joined: bool
    position: int
    message: str


class WaitlistCountResponse(BaseModel):
    count: int


@router.post(
    "/",
    summary="Join the early-access waitlist",
    response_model=WaitlistJoinResponse,
    status_code=200,
)
@limiter.limit("5/minute")
async def join_waitlist(request: Request, body: WaitlistJoinRequest) -> WaitlistJoinResponse:
    async with get_session() as session:
        # Check existing
        existing = await session.execute(
            select(WaitlistEntry).where(WaitlistEntry.email == body.email)
        )
        row = existing.scalar_one_or_none()
        if row is not None:
            count_result = await session.execute(select(func.count()).select_from(WaitlistEntry))
            total = count_result.scalar_one()
            return WaitlistJoinResponse(
                success=True,
                already_joined=True,
                position=total,
                message="You are already on the waitlist.",
            )

        entry = WaitlistEntry(
            email=body.email,
            plan_interest=body.plan_interest,
            source=body.source,
            joined_at=datetime.now(UTC),
        )
        session.add(entry)
        try:
            await session.commit()
            await session.refresh(entry)
        except IntegrityError:
            await session.rollback()
            count_result = await session.execute(select(func.count()).select_from(WaitlistEntry))
            total = count_result.scalar_one()
            return WaitlistJoinResponse(
                success=True,
                already_joined=True,
                position=total,
                message="You are already on the waitlist.",
            )

        count_result = await session.execute(select(func.count()).select_from(WaitlistEntry))
        total = count_result.scalar_one()

    return WaitlistJoinResponse(
        success=True,
        already_joined=False,
        position=total,
        message=f"Welcome aboard! You are #{total} on the waitlist.",
    )


@router.get(
    "/count",
    summary="Get total waitlist signup count (public)",
    response_model=WaitlistCountResponse,
    status_code=200,
)
async def get_waitlist_count() -> WaitlistCountResponse:
    async with get_session() as session:
        result = await session.execute(select(func.count()).select_from(WaitlistEntry))
        total = result.scalar_one()
    return WaitlistCountResponse(count=total)


class WaitlistAdminEntry(BaseModel):
    id: int
    email: str
    plan_interest: Optional[str]
    source: str
    joined_at: datetime


class WaitlistAdminResponse(BaseModel):
    count: int
    entries: list[WaitlistAdminEntry]


@router.get(
    "/admin",
    summary="List all waitlist entries (admin only, requires JWT)",
    response_model=WaitlistAdminResponse,
    status_code=200,
)
async def list_waitlist_admin(
    _user: UserInfo = Depends(get_current_user),
) -> WaitlistAdminResponse:
    async with get_session() as session:
        result = await session.execute(
            select(WaitlistEntry).order_by(WaitlistEntry.joined_at.desc())
        )
        rows = result.scalars().all()
    entries = [
        WaitlistAdminEntry(
            id=r.id,
            email=r.email,
            plan_interest=r.plan_interest,
            source=r.source,
            joined_at=r.joined_at,
        )
        for r in rows
    ]
    return WaitlistAdminResponse(count=len(entries), entries=entries)
