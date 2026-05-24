"""
Portfolio Management — CRUD
============================
Manage named portfolios (private / business, stocks / P2P / mixed).

GET    /api/portfolios         — list all portfolios
POST   /api/portfolios         — create new portfolio
PATCH  /api/portfolios/{id}    — update portfolio
DELETE /api/portfolios/{id}    — delete portfolio
POST   /api/portfolios/{id}/default — set as default
"""
from datetime import datetime, UTC
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select, update

from app.api.auth import get_current_user, UserInfo
from app.db.database import get_session
from app.db.models import Portfolio

router = APIRouter(prefix="/portfolios", tags=["Portfolios"])

# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

VALID_TYPES = {"stocks", "crypto", "p2p", "mixed"}
VALID_CATEGORIES = {"private", "business"}


class PortfolioCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    portfolio_type: str = Field("mixed")
    category: str = Field("private")
    currency: str = Field("EUR", max_length=3)
    color: str = Field("#00D4FF", max_length=7)
    description: Optional[str] = Field(None, max_length=200)


class PortfolioUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    portfolio_type: Optional[str] = None
    category: Optional[str] = None
    currency: Optional[str] = Field(None, max_length=3)
    color: Optional[str] = Field(None, max_length=7)
    description: Optional[str] = Field(None, max_length=200)


class PortfolioOut(BaseModel):
    id: int
    name: str
    portfolio_type: str
    category: str
    currency: str
    color: str
    is_default: bool
    description: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _validate_type(v: Optional[str]) -> Optional[str]:
    if v is not None and v not in VALID_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"portfolio_type must be one of: {', '.join(sorted(VALID_TYPES))}",
        )
    return v


def _validate_category(v: Optional[str]) -> Optional[str]:
    if v is not None and v not in VALID_CATEGORIES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"category must be one of: {', '.join(sorted(VALID_CATEGORIES))}",
        )
    return v


async def _get_or_404(portfolio_id: int) -> Portfolio:
    async with get_session() as session:
        result = await session.execute(
            select(Portfolio).where(Portfolio.id == portfolio_id)
        )
        portfolio = result.scalar_one_or_none()
    if not portfolio:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Portfolio not found")
    return portfolio


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/", response_model=list[PortfolioOut])
async def list_portfolios(
    _user: UserInfo = Depends(get_current_user),
) -> list[PortfolioOut]:
    async with get_session() as session:
        result = await session.execute(
            select(Portfolio).order_by(Portfolio.is_default.desc(), Portfolio.created_at)
        )
        portfolios = result.scalars().all()
    return [PortfolioOut.model_validate(p) for p in portfolios]


@router.post("/", response_model=PortfolioOut, status_code=status.HTTP_201_CREATED)
async def create_portfolio(
    body: PortfolioCreate,
    _user: UserInfo = Depends(get_current_user),
) -> PortfolioOut:
    _validate_type(body.portfolio_type)
    _validate_category(body.category)

    async with get_session() as session:
        # If this is the first portfolio, make it default
        count_result = await session.execute(select(Portfolio))
        is_first = len(count_result.scalars().all()) == 0

        portfolio = Portfolio(
            name=body.name,
            portfolio_type=body.portfolio_type,
            category=body.category,
            currency=body.currency.upper(),
            color=body.color,
            description=body.description,
            is_default=is_first,
            created_at=datetime.now(UTC),
        )
        session.add(portfolio)
        await session.commit()
        await session.refresh(portfolio)

    return PortfolioOut.model_validate(portfolio)


@router.patch("/{portfolio_id}", response_model=PortfolioOut)
async def update_portfolio(
    portfolio_id: int,
    body: PortfolioUpdate,
    _user: UserInfo = Depends(get_current_user),
) -> PortfolioOut:
    _validate_type(body.portfolio_type)
    _validate_category(body.category)

    portfolio = await _get_or_404(portfolio_id)

    async with get_session() as session:
        result = await session.execute(
            select(Portfolio).where(Portfolio.id == portfolio_id)
        )
        p = result.scalar_one()
        if body.name is not None:
            p.name = body.name
        if body.portfolio_type is not None:
            p.portfolio_type = body.portfolio_type
        if body.category is not None:
            p.category = body.category
        if body.currency is not None:
            p.currency = body.currency.upper()
        if body.color is not None:
            p.color = body.color
        if body.description is not None:
            p.description = body.description
        await session.commit()
        await session.refresh(p)
        return PortfolioOut.model_validate(p)


@router.delete("/{portfolio_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_portfolio(
    portfolio_id: int,
    _user: UserInfo = Depends(get_current_user),
) -> None:
    portfolio = await _get_or_404(portfolio_id)
    if portfolio.is_default:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete the default portfolio. Set another portfolio as default first.",
        )
    async with get_session() as session:
        result = await session.execute(
            select(Portfolio).where(Portfolio.id == portfolio_id)
        )
        p = result.scalar_one()
        await session.delete(p)
        await session.commit()


@router.post("/{portfolio_id}/default", response_model=PortfolioOut)
async def set_default_portfolio(
    portfolio_id: int,
    _user: UserInfo = Depends(get_current_user),
) -> PortfolioOut:
    await _get_or_404(portfolio_id)

    async with get_session() as session:
        # Clear all defaults first
        await session.execute(
            update(Portfolio).values(is_default=False)
        )
        result = await session.execute(
            select(Portfolio).where(Portfolio.id == portfolio_id)
        )
        p = result.scalar_one()
        p.is_default = True
        await session.commit()
        await session.refresh(p)
        return PortfolioOut.model_validate(p)
