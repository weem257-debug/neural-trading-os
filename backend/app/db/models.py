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

from sqlalchemy import Boolean, DateTime, Float, Integer, Numeric, String, Text

# P1-2 money-math: money/price/quantity columns use NUMERIC for exact storage in
# Postgres (production), eliminating binary-float drift in the ledger. asdecimal
# is left False so the Python layer continues to receive floats — this keeps the
# storage fix decoupled from a (larger) Python-side Decimal-arithmetic refactor
# and avoids mixed Decimal/float TypeErrors across the codebase. Statistical
# ratios (confidence, return_pct, win_rate, ...) intentionally remain Float.
_MONEY = Numeric(20, 8, asdecimal=False)   # prices, balances, amounts
_QTY = Numeric(28, 10, asdecimal=False)    # share / unit quantities
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

    # Per-user quota tracking (nullable for legacy rows; NULL treated as "admin")
    user_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)

    # Optional fields
    price_target: Mapped[Optional[float]] = mapped_column(_MONEY, nullable=True)
    stop_loss: Mapped[Optional[float]] = mapped_column(_MONEY, nullable=True)
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
    entry_price: Mapped[float] = mapped_column(_MONEY, nullable=False)
    current_price: Mapped[float] = mapped_column(_MONEY, nullable=False)
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
    owner_username: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
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
    owner_username: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
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


class SignalInsightUsage(Base):
    """
    Attribution link: records exactly which YoutubeInsight rows were injected into
    the prompt that produced a given signal.

    This is the ground truth for the self-learning feedback loop. When a signal's
    outcome is known, we validate/invalidate *these* insights — the ones that
    actually influenced the trade — instead of re-deriving a recency-based guess.
    """

    __tablename__ = "signal_insight_usage"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    signal_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    insight_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    # Retrieval rank (0 = top-ranked) at injection time, for later analysis.
    rank: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        index=True,
    )


class Portfolio(Base):
    """
    Named portfolio — owns a collection of positions, P2P accounts, and bank accounts.
    Users can separate private and business assets across multiple portfolios.
    """

    __tablename__ = "portfolios"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    owner_username: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
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
    owner_username: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    portfolio_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, index=True)
    # platform: "mintos" | "bondora" | "peerberry" | "manual"
    platform: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    total_invested: Mapped[float] = mapped_column(_MONEY, nullable=False, default=0.0)
    outstanding_principal: Mapped[float] = mapped_column(_MONEY, nullable=False, default=0.0)
    interest_month: Mapped[float] = mapped_column(_MONEY, nullable=False, default=0.0)
    total_interest: Mapped[float] = mapped_column(_MONEY, nullable=False, default=0.0)
    defaulted_amount: Mapped[float] = mapped_column(_MONEY, nullable=False, default=0.0)
    cash_balance: Mapped[float] = mapped_column(_MONEY, nullable=False, default=0.0)
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
    owner_username: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    portfolio_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, index=True)
    bank_name: Mapped[str] = mapped_column(String(100), nullable=False)
    blz: Mapped[str] = mapped_column(String(8), nullable=False)
    username: Mapped[str] = mapped_column(String(100), nullable=False)
    account_iban: Mapped[Optional[str]] = mapped_column(String(34), nullable=True)
    last_synced: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_balance: Mapped[Optional[float]] = mapped_column(_MONEY, nullable=True)
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
    quantity: Mapped[float] = mapped_column(_QTY, nullable=False)
    order_type: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    fill_price: Mapped[Optional[float]] = mapped_column(_MONEY, nullable=True)
    fill_qty: Mapped[Optional[float]] = mapped_column(_QTY, nullable=True)
    reason: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        index=True,
    )


class Subscription(Base):
    """Stripe subscription — one row per user (single-user MVP, user_id="admin")."""

    __tablename__ = "subscriptions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(100), nullable=False, index=True, unique=True)
    stripe_customer_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, unique=True)
    stripe_subscription_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, unique=True)
    # plan: "free" | "basic" | "pro" | "institutional" | "signals"
    plan: Mapped[str] = mapped_column(String(30), nullable=False, default="free")
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="active")
    current_period_end: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    cancel_at_period_end: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )


class BillingEvent(Base):
    """Stripe webhook event log — idempotency guard."""

    __tablename__ = "billing_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    stripe_event_id: Mapped[str] = mapped_column(String(100), nullable=False, unique=True, index=True)
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)
    processed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    payload: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
    )


class TelegramChat(Base):
    """Telegram chat connection — one row per user."""

    __tablename__ = "telegram_chats"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(100), nullable=False, unique=True, index=True)
    chat_id: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    username: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    connected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
    )


class AppSecret(Base):
    """
    Key-value store for backend credentials set via the Settings UI.
    Checked before falling back to env vars in service code.
    """

    __tablename__ = "app_secrets"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )


class PriceAlertRecord(Base):
    """Persisted price alert — survives container restarts."""

    __tablename__ = "price_alerts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    alert_id: Mapped[str] = mapped_column(String(36), nullable=False, unique=True, index=True)
    ticker: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    condition: Mapped[str] = mapped_column(String(20), nullable=False)
    threshold: Mapped[float] = mapped_column(_MONEY, nullable=False)
    status: Mapped[str] = mapped_column(String(10), nullable=False, default="active", index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        index=True,
    )
    fired_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    fired_price: Mapped[Optional[float]] = mapped_column(_MONEY, nullable=True)
    username: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)


class User(Base):
    """
    Registered user account — created via self-service registration.
    The admin/demo user is NOT stored here; it lives in auth.py as fallback.
    """

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(50), nullable=False, unique=True, index=True)
    email: Mapped[str] = mapped_column(String(254), nullable=False, unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(200), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="trader")
    tier: Mapped[str] = mapped_column(String(20), nullable=False, default="free")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        index=True,
    )
    referred_by: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, default=None)
    email_unsubscribed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class PasswordResetToken(Base):
    """
    Persistent password-reset token store (replaces the in-memory dict).

    SECURITY (P0 #5):
      - Only the SHA-256 *hash* of the token is stored, never the raw token.
      - `expires_at` enforces a TTL (default 1h, set by the issuer).
      - `used_at` enforces single-use: a token with used_at != NULL is dead.
    Survives redeploys and works across >1 replica (DB is the single source of truth).
    """

    __tablename__ = "password_reset_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    username: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, default=None)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
    )
