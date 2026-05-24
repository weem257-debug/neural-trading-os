"""
ORM Models — SQLAlchemy
-----------------------
SignalRecord      : persisted trading signals
OrderRecord       : persisted order history
WaitlistEntry     : landing-page email waitlist
Portfolio         : multi-portfolio (private / business, stocks / P2P / mixed)
P2PSnapshot       : periodic snapshots of P2P platform balances
BankConnection    : FinTS bank credentials and sync metadata
"""
import json
from datetime import datetime, UTC
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class SignalRecord(Base):
    """Persisted trading signal."""

    __tablename__ = "signals"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, index=True)
    ticker: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    direction: Mapped[str] = mapped_column(String(20), nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    reasoning: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    source: Mapped[str] = mapped_column(String(100), nullable=False)
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        index=True,
    )
    # JSON blob for agents_consensus dict
    agents_consensus: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Optional fields
    price_target: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    stop_loss: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    time_horizon: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    def agents_consensus_as_dict(self) -> dict:
        if self.agents_consensus:
            try:
                return json.loads(self.agents_consensus)
            except (json.JSONDecodeError, TypeError):
                return {}
        return {}


class SignalPerformance(Base):
    """Tracks return performance of past signals."""

    __tablename__ = "signal_performance"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    signal_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    ticker: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    direction: Mapped[str] = mapped_column(String(20), nullable=False)
    entry_price: Mapped[float] = mapped_column(Float, nullable=False)
    current_price: Mapped[float] = mapped_column(Float, nullable=False)
    return_pct: Mapped[float] = mapped_column(Float, nullable=False)
    evaluated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        index=True,
    )


class WaitlistEntry(Base):
    """Email waitlist — collected on the landing page."""

    __tablename__ = "waitlist"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(254), nullable=False, unique=True, index=True)
    plan_interest: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    source: Mapped[str] = mapped_column(String(50), nullable=False, default="landing-page")
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        index=True,
    )


class YoutubeInsight(Base):
    """
    Trading knowledge extracted from a YouTube video transcript.
    Claude analyzes the transcript and extracts actionable strategies.
    """

    __tablename__ = "youtube_insights"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    video_id: Mapped[str] = mapped_column(String(20), nullable=False, unique=True, index=True)
    video_title: Mapped[str] = mapped_column(String(300), nullable=False)
    channel: Mapped[str] = mapped_column(String(150), nullable=False)
    insight_text: Mapped[str] = mapped_column(Text, nullable=False)
    tags_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    strategy: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    timeframe: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    market_condition: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    asset_class: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    confidence_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.7)
    times_validated: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    times_invalidated: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        index=True,
    )


class TradeLearning(Base):
    """
    Pattern learned from real trade outcomes (SignalPerformance analysis).
    Captures what worked, what didn't, and under which conditions.
    """

    __tablename__ = "trade_learnings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ticker: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    direction: Mapped[str] = mapped_column(String(20), nullable=False)
    learning_text: Mapped[str] = mapped_column(Text, nullable=False)
    conditions_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    win_rate: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    sample_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    avg_return_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        index=True,
    )
    last_updated: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
    )


class LearningJob(Base):
    """
    Tracks background learning jobs (YouTube batch, trade review, post-trade).
    """

    __tablename__ = "learning_jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    job_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending", index=True)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    items_processed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
    )


class Portfolio(Base):
    """
    Named portfolio — owns a collection of positions, P2P accounts, and bank accounts.
    Users can separate private and business assets across multiple portfolios.
    """

    __tablename__ = "portfolios"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    # portfolio_type: "stocks" | "crypto" | "p2p" | "mixed"
    portfolio_type: Mapped[str] = mapped_column(String(20), nullable=False, default="mixed")
    # category: "private" | "business"
    category: Mapped[str] = mapped_column(String(20), nullable=False, default="private")
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="EUR")
    color: Mapped[str] = mapped_column(String(7), nullable=False, default="#00D4FF")
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    description: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
    )


class P2PSnapshot(Base):
    """
    Periodic balance snapshot for a P2P lending platform account.
    Fetched via platform API (Mintos, Bondora, PeerBerry) or manual entry.
    """

    __tablename__ = "p2p_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    portfolio_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, index=True)
    # platform: "mintos" | "bondora" | "peerberry" | "manual"
    platform: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    total_invested: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    outstanding_principal: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    interest_month: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    total_interest: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    defaulted_amount: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    cash_balance: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    net_annual_return: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    num_active_loans: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="EUR")
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        index=True,
    )


class BankConnection(Base):
    """
    FinTS bank connection — stores BLZ, masked credentials, and sync metadata.
    PIN is never stored; it must be supplied at sync time.
    """

    __tablename__ = "bank_connections"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    portfolio_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, index=True)
    bank_name: Mapped[str] = mapped_column(String(100), nullable=False)
    blz: Mapped[str] = mapped_column(String(8), nullable=False)
    username: Mapped[str] = mapped_column(String(100), nullable=False)
    account_iban: Mapped[Optional[str]] = mapped_column(String(34), nullable=True)
    last_synced: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_balance: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="EUR")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
    )


class OrderRecord(Base):
    """Persisted order from the execution engine."""

    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    order_id: Mapped[str] = mapped_column(String(36), nullable=False, unique=True, index=True)
    ticker: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    side: Mapped[str] = mapped_column(String(10), nullable=False)
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
    order_type: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    fill_price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    fill_qty: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    reason: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        index=True,
    )
