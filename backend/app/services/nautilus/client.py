"""
Nautilus Trader Execution Service
-----------------------------------
Wraps nautilus_trader for high-performance order execution.
Nautilus supports 15+ broker adapters (Alpaca, Binance, Bybit, IB, etc.)

This client manages:
  - Submitting orders via nautilus execution engine
  - Paper trading via in-memory simulation when ENABLE_LIVE_TRADING=False
  - Live trading via TradingNode when ENABLE_LIVE_TRADING=True
"""
import logging
import uuid
from datetime import datetime, UTC
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

from app.core.config import settings
from app.models.schemas import OrderRequest, OrderResponse, Position, PortfolioSnapshot

logger = logging.getLogger(__name__)

_CENT = Decimal("0.01")


def _money(value: float) -> float:
    """
    Quantize a monetary amount to whole cents using banker-safe rounding.

    The paper-trading engine keeps float-typed public schemas, but raw float
    arithmetic accumulates binary-representation drift (e.g. 0.1 + 0.2). Routing
    every money result through Decimal-quantization keeps stored cash / PnL exact
    to the cent. (Real-money execution should use Decimal end-to-end — tracked as
    a follow-up; this path is simulation only.)
    """
    try:
        return float(Decimal(str(value)).quantize(_CENT, rounding=ROUND_HALF_UP))
    except Exception:
        return value


# ---------------------------------------------------------------------------
# DB persistence helpers (module-level, async)
# ---------------------------------------------------------------------------

async def _persist_order_to_db(record: "_OrderRecord") -> None:
    """Persist a filled/rejected order to SQLite. Silently skips on error."""
    try:
        from datetime import datetime, UTC
        from app.db.database import get_session
        from app.db.models import OrderRecord

        async with get_session() as session:
            db_rec = OrderRecord(
                order_id=record.order_id,
                ticker=record.ticker,
                side=record.side,
                quantity=record.quantity,
                order_type=record.order_type,
                status=record.status,
                fill_price=record.fill_price,
                fill_qty=record.quantity if record.status == "filled" else None,
                reason=record.reject_reason,
                submitted_at=record.timestamp,
                owner_username=record.owner_username,
            )
            session.add(db_rec)
            await session.commit()
    except Exception as db_err:
        logger.debug("order_db_persist_skipped", extra={"reason": str(db_err)})


# ---------------------------------------------------------------------------
# Internal order record (richer than OrderResponse — tracks fills + portfolio)
# ---------------------------------------------------------------------------

class _OrderRecord:
    """Internal representation of a submitted order."""

    def __init__(
        self,
        order_id: str,
        ticker: str,
        side: str,
        quantity: float,
        order_type: str,
        status: str,
        fill_price: Optional[float],
        timestamp: datetime,
        reject_reason: Optional[str] = None,
        owner_username: Optional[str] = None,
    ):
        self.order_id = order_id
        self.ticker = ticker
        self.side = side
        self.quantity = quantity
        self.order_type = order_type
        self.status = status
        self.fill_price = fill_price
        self.timestamp = timestamp
        self.reject_reason = reject_reason
        self.owner_username = owner_username

    def to_response(self) -> OrderResponse:
        return OrderResponse(
            order_id=self.order_id,
            ticker=self.ticker,
            side=self.side,  # type: ignore[arg-type]
            quantity=self.quantity,
            order_type=self.order_type,  # type: ignore[arg-type]
            status=self.status,
            filled_price=self.fill_price,
            reject_reason=self.reject_reason,
            created_at=self.timestamp,
            broker="paper",
        )


# ---------------------------------------------------------------------------
# Price helper
# ---------------------------------------------------------------------------

from app.core.cache import cached as _cached


@_cached(ttl_seconds=10)
def _fetch_price(ticker: str) -> Optional[float]:
    """Fetch last close price from yfinance. Returns None on failure. Cached 10s."""
    try:
        import yfinance as yf  # type: ignore
        t = yf.Ticker(ticker)
        hist = t.history(period="1d")
        if hist.empty:
            return None
        return float(hist["Close"].iloc[-1])
    except Exception as exc:  # pragma: no cover
        logger.warning("yfinance price fetch failed for %s: %s", ticker, exc)
        return None


# ---------------------------------------------------------------------------
# NautilusExecutionClient
# ---------------------------------------------------------------------------

class NautilusExecutionClient:
    """
    Thin async wrapper around nautilus_trader execution.

    In paper mode: fully self-contained in-memory simulation.
    In live mode: routes to the nautilus TradingNode (requires engine init).

    Paper-trading state:
      _cash            — available cash (starts at INITIAL_CAPITAL)
      _positions       — ticker → {quantity, avg_price, realized_pnl}
      _orders          — order_id → _OrderRecord (complete history)
      _day_start_value — portfolio value at session start (for daily PnL)
    """

    INITIAL_CAPITAL: float = 100_000.0

    def __init__(self):
        self._engine = None
        self._initialized = False
        self._mode: str = "paper"          # "paper" | "live"

        # Paper trading state
        self._cash: float = self.INITIAL_CAPITAL
        self._positions: dict[str, dict] = {}   # ticker → {qty, avg_price, realized_pnl}
        self._orders: dict[str, _OrderRecord] = {}
        self._day_start_value: float = self.INITIAL_CAPITAL

    # ------------------------------------------------------------------ init

    async def initialize(self) -> bool:
        """
        Start the nautilus trading engine.
        In paper mode: BacktestNode with simulated fills.
        In live mode: TradingNode with real broker connections.
        """
        try:
            import nautilus_trader  # type: ignore  # noqa: F401
            logger.info(
                "Nautilus Trader found — version %s",
                nautilus_trader.__version__,
            )
            self._initialized = False   # full engine init deferred — complex setup
            return True
        except ImportError:
            logger.warning(
                "nautilus_trader package not installed. "
                "Run: pip install nautilus_trader. "
                "Using pure paper-trading simulation."
            )
            return False

    # ----------------------------------------------------------------- mode

    @property
    def mode(self) -> str:
        return self._mode

    def set_mode(self, mode: str) -> None:
        """Switch execution mode. paper→live requires explicit caller check."""
        if mode not in ("paper", "live"):
            raise ValueError(f"Unknown mode: {mode}")
        self._mode = mode

    # --------------------------------------------------------------- orders

    async def submit_order(
        self, req: OrderRequest, owner_username: Optional[str] = None
    ) -> OrderResponse:
        """
        Submit a trading order.
        Routes to live or paper execution based on config and current mode.

        Live execution (P0-safety): live orders are NEVER silently simulated.
        `mode == "live"` only reaches the paper simulator if a real broker
        engine is actually initialised (`self._initialized` and `self._engine`
        set by a future live-engine implementation — currently always absent).
        Until that follow-up ships, a live-mode order is explicitly rejected
        with reject_reason="live_execution_unavailable" rather than quietly
        filled against the paper book, which would otherwise mislead callers
        into believing a real trade happened.
        """
        if self._mode == "live":
            if not settings.ENABLE_LIVE_TRADING:
                logger.warning(
                    "LIVE ORDER REJECTED (live_trading_disabled): %s %s",
                    req.side, req.ticker,
                )
                return self._reject(req, "live_trading_disabled", owner_username)
            if not self._initialized or self._engine is None:
                logger.warning(
                    "Live execution not implemented — paper only. "
                    "LIVE ORDER REJECTED (live_execution_unavailable): %s %s",
                    req.side, req.ticker,
                )
                return self._reject(req, "live_execution_unavailable", owner_username)
            return await self._live_order(req, owner_username)
        return await self._paper_order(req, owner_username)

    def _reject(
        self, req: OrderRequest, reason: str, owner_username: Optional[str] = None
    ) -> OrderResponse:
        """Build + record a rejected OrderResponse without raising an exception."""
        record = _OrderRecord(
            order_id=str(uuid.uuid4()),
            ticker=req.ticker.upper(),
            side=req.side.value,
            quantity=req.quantity,
            order_type=req.order_type.value,
            status="rejected",
            fill_price=None,
            timestamp=datetime.now(UTC),
            reject_reason=reason,
            owner_username=owner_username,
        )
        self._orders[record.order_id] = record
        return record.to_response()

    async def _paper_order(
        self, req: OrderRequest, owner_username: Optional[str] = None
    ) -> OrderResponse:
        """Simulate order fill for paper trading.

        Enforces pre-trade risk limits (P0-1/P0-2) before any fill is applied:
          a) BUY cash check       — cost must not exceed available cash.
          b) Position-size limit  — post-fill position value <= MAX_POSITION_SIZE_PCT * equity.
          c) Leverage limit       — post-fill gross exposure / equity <= MAX_LEVERAGE.
          d) Daily-loss limit     — once day_pnl breaches -MAX_DAILY_LOSS_PCT, new
                                     risk-increasing (BUY) orders are blocked; SELL
                                     orders (always closing — paper trading has no
                                     shorting) remain allowed.
        Every rejection is a clean OrderRecord(status="rejected", reject_reason=...),
        never an exception.
        """
        order_id = str(uuid.uuid4())
        timestamp = datetime.now(UTC)
        ticker = req.ticker.upper()

        def _rejected(reason: str) -> OrderResponse:
            record = _OrderRecord(
                order_id=order_id,
                ticker=ticker,
                side=req.side.value,
                quantity=req.quantity,
                order_type=req.order_type.value,
                status="rejected",
                fill_price=None,
                timestamp=timestamp,
                reject_reason=reason,
                owner_username=owner_username,
            )
            self._orders[order_id] = record
            logger.warning("PAPER ORDER REJECTED (%s): %s %s", reason, req.side.value.upper(), ticker)
            return record.to_response()

        # Validation: quantity
        if req.quantity <= 0:
            return _rejected("invalid_quantity")

        # Validation: SELL without position
        if req.side.value == "sell":
            pos = self._positions.get(ticker)
            if pos is None or pos["quantity"] < req.quantity:
                return _rejected("insufficient_position")

        # ------------------------------------------------------------
        # Risk gate (d): daily-loss limit — only blocks risk-increasing
        # (BUY) orders. SELL always closes exposure, so it stays allowed
        # even after the daily-loss circuit breaker has tripped.
        # ------------------------------------------------------------
        if req.side.value == "buy":
            equity_pre, _exposure_pre, day_pnl = await self._equity_snapshot()
            if self._day_start_value > 0:
                loss_limit = -(settings.MAX_DAILY_LOSS_PCT * self._day_start_value)
                if day_pnl <= loss_limit:
                    return _rejected("daily_loss_limit")

        # Fetch fill price — P1: never fabricate a fill price.
        fill_price = _fetch_price(ticker)
        if fill_price is None:
            fill_price = req.limit_price
        if fill_price is None:
            return _rejected("no_market_price")

        # ------------------------------------------------------------
        # Risk gates (a)-(c) for BUY orders — evaluated pre-fill using the
        # fetched fill_price so the projection matches what will actually
        # be executed.
        # ------------------------------------------------------------
        if req.side.value == "buy":
            cost = fill_price * req.quantity

            # (a) Cash check — never allow cash to go negative.
            if cost > self._cash:
                return _rejected("insufficient_cash")

            equity, exposure, _day_pnl = await self._equity_snapshot()

            if equity <= 0:
                # No equity to leverage against — block further risk-increasing
                # exposure defensively rather than divide by zero.
                return _rejected("leverage_exceeded")

            existing_qty = self._positions.get(ticker, {}).get("quantity", 0.0)
            projected_position_value = (existing_qty + req.quantity) * fill_price

            # (b) Position-size limit
            if projected_position_value > settings.MAX_POSITION_SIZE_PCT * equity:
                return _rejected("position_size_exceeded")

            # (c) Leverage limit — gross exposure grows by `cost` (cash converts
            # 1:1 into position value at the fill price; paper trading is
            # long-only so gross exposure == invested market value).
            projected_exposure = exposure + cost
            if projected_exposure > settings.MAX_LEVERAGE * equity:
                return _rejected("leverage_exceeded")

        # Execute fill — update portfolio state
        if req.side.value == "buy":
            cost = fill_price * req.quantity
            self._cash = _money(self._cash - cost)
            pos = self._positions.get(ticker)
            if pos is None:
                self._positions[ticker] = {
                    "quantity": req.quantity,
                    "avg_price": fill_price,
                    "realized_pnl": 0.0,
                }
            else:
                total_qty = pos["quantity"] + req.quantity
                pos["avg_price"] = (
                    (pos["avg_price"] * pos["quantity"] + fill_price * req.quantity) / total_qty
                )
                pos["quantity"] = total_qty
        else:  # sell
            pos = self._positions[ticker]
            realized = (fill_price - pos["avg_price"]) * req.quantity
            pos["realized_pnl"] = _money(pos["realized_pnl"] + realized)
            pos["quantity"] -= req.quantity
            self._cash = _money(self._cash + fill_price * req.quantity)
            if pos["quantity"] <= 0:
                del self._positions[ticker]

        record = _OrderRecord(
            order_id=order_id,
            ticker=ticker,
            side=req.side.value,
            quantity=req.quantity,
            order_type=req.order_type.value,
            status="filled",
            fill_price=fill_price,
            timestamp=timestamp,
            owner_username=owner_username,
        )
        self._orders[order_id] = record
        logger.info(
            "PAPER ORDER FILLED: %s %s x%.4f @ %.2f",
            req.side.value.upper(), ticker, req.quantity, fill_price,
        )
        # Persist to DB asynchronously (non-blocking; silently skips on error)
        await _persist_order_to_db(record)
        return record.to_response()

    async def _equity_snapshot(self) -> tuple[float, float, float]:
        """
        Return (total_equity, gross_exposure, day_pnl) using live prices.

        Paper trading is long-only (no shorting — SELL is always rejected
        without a matching position), so gross exposure == invested market
        value == sum of position market values.
        """
        snap = await self._paper_portfolio()
        return snap.total_value, snap.invested, snap.day_pnl

    async def _live_order(
        self, req: OrderRequest, owner_username: Optional[str] = None
    ) -> OrderResponse:
        """
        Submit order to a live broker via the nautilus TradingNode.

        NOT IMPLEMENTED — this is a deliberate scope boundary. `submit_order`
        only calls this method once `self._initialized` and `self._engine`
        are set by a real nautilus TradingNode/broker-adapter integration,
        which does not exist yet. Follow-up: wire up a nautilus TradingNode
        with a concrete broker adapter (e.g. Alpaca/IB/Binance) and flip
        `initialize()` to actually construct + start it before this method
        can be reached.
        """
        if self._engine is None:
            raise RuntimeError("Nautilus engine not started — call initialize() first")
        raise NotImplementedError("Live order execution pending nautilus engine setup")

    # ------------------------------------------------------------- portfolio

    async def get_portfolio(self) -> PortfolioSnapshot:
        """Fetch current portfolio state from the execution engine."""
        if self._mode == "live" and self._initialized:
            # TODO: query nautilus account state
            return _empty_portfolio()
        return await self._paper_portfolio()

    async def _paper_portfolio(self) -> PortfolioSnapshot:
        """Compute portfolio snapshot from in-memory paper state."""
        positions: list[Position] = []
        invested = 0.0

        for ticker, pos in self._positions.items():
            current_price = _fetch_price(ticker) or pos["avg_price"]
            market_value = current_price * pos["quantity"]
            unrealized_pnl = (current_price - pos["avg_price"]) * pos["quantity"]
            unrealized_pnl_pct = (
                unrealized_pnl / (pos["avg_price"] * pos["quantity"])
                if pos["avg_price"] > 0 and pos["quantity"] > 0
                else 0.0
            )
            invested += market_value
            positions.append(
                Position(
                    ticker=ticker,
                    quantity=pos["quantity"],
                    avg_entry_price=pos["avg_price"],
                    current_price=current_price,
                    market_value=market_value,
                    unrealized_pnl=unrealized_pnl,
                    unrealized_pnl_pct=unrealized_pnl_pct,
                    realized_pnl=pos.get("realized_pnl", 0.0),
                    weight=0.0,   # filled below
                )
            )

        total_value = self._cash + invested
        total_pnl = total_value - self.INITIAL_CAPITAL
        total_pnl_pct = total_pnl / self.INITIAL_CAPITAL if self.INITIAL_CAPITAL > 0 else 0.0
        day_pnl = total_value - self._day_start_value
        day_pnl_pct = day_pnl / self._day_start_value if self._day_start_value > 0 else 0.0

        # Fill weights
        for p in positions:
            p.weight = p.market_value / total_value if total_value > 0 else 0.0

        return PortfolioSnapshot(
            total_value=total_value,
            cash=self._cash,
            invested=invested,
            total_pnl=total_pnl,
            total_pnl_pct=total_pnl_pct,
            day_pnl=day_pnl,
            day_pnl_pct=day_pnl_pct,
            positions=positions,
        )

    # --------------------------------------------------------- portfolio state (dict)

    async def get_portfolio_state(self) -> dict:
        """Return portfolio as plain dict for quick consumption."""
        snap = await self._paper_portfolio()
        return {
            "cash": snap.cash,
            "invested": snap.invested,
            "total_equity": snap.total_value,
            "daily_pnl": snap.day_pnl,
            "total_pnl": snap.total_pnl,
            "total_pnl_pct": snap.total_pnl_pct,
            "positions": [p.model_dump() for p in snap.positions],
        }

    # -------------------------------------------------------- order history

    def get_order_history(self, limit: int = 50, owner_username: Optional[str] = None) -> list[dict]:
        """Return last N orders sorted newest-first (in-memory only).
        For async DB-backed history use get_order_history_async.

        SECURITY (P0-3/P0-4) NOTE: the in-memory `_orders` dict is a
        process-wide singleton with no per-user separation (paper trading
        has one shared book). When `owner_username` is given we filter by
        the record's tracked owner where available, but orders submitted
        before this field existed (or via any path that didn't pass a user)
        have `owner_username=None` and are excluded from a filtered view.
        This in-memory path is only a fallback (see get_order_history_async);
        the primary, reliably-filtered path is the DB query below.
        """
        records = sorted(self._orders.values(), key=lambda r: r.timestamp, reverse=True)
        if owner_username is not None:
            records = [r for r in records if r.owner_username == owner_username]
        return [
            {
                "order_id": r.order_id,
                "ticker": r.ticker,
                "side": r.side,
                "quantity": r.quantity,
                "order_type": r.order_type,
                "status": r.status,
                "fill_price": r.fill_price,
                "timestamp": r.timestamp.isoformat(),
                "reject_reason": r.reject_reason,
            }
            for r in records[:limit]
        ]

    async def get_order_history_async(
        self, limit: int = 50, owner_username: Optional[str] = None
    ) -> list[dict]:
        """Return last N orders from SQLite (fallback: in-memory).

        SECURITY (P0-3/P0-4): when `owner_username` is provided, only that
        user's orders are returned. Rows persisted before the owner_username
        column existed are NULL and will not match any filter — a documented
        residual gap for pre-migration history (see MIGRATION NOTES in the
        audit output), not for new orders going forward.
        """
        try:
            from sqlalchemy import select, desc
            from app.db.database import get_session
            from app.db.models import OrderRecord

            async with get_session() as session:
                q = select(OrderRecord).order_by(desc(OrderRecord.submitted_at)).limit(limit)
                if owner_username is not None:
                    q = q.where(OrderRecord.owner_username == owner_username)
                result = await session.execute(q)
                rows = result.scalars().all()

            if rows:
                return [
                    {
                        "order_id": r.order_id,
                        "ticker": r.ticker,
                        "side": r.side,
                        "quantity": r.quantity,
                        "order_type": r.order_type,
                        "status": r.status,
                        "fill_price": r.fill_price,
                        "timestamp": r.submitted_at.isoformat(),
                        "reject_reason": r.reason,
                    }
                    for r in rows
                ]
            return []
        except Exception as db_err:
            logger.debug("order_db_read_fallback", extra={"reason": str(db_err)})

        # Fallback: in-memory
        return self.get_order_history(limit, owner_username=owner_username)

    # Legacy: some callers use get_positions directly
    async def get_positions(self):
        snap = await self._paper_portfolio()
        return snap.positions


def _empty_portfolio() -> PortfolioSnapshot:
    return PortfolioSnapshot(
        total_value=100_000.0,
        cash=100_000.0,
        invested=0.0,
        total_pnl=0.0,
        total_pnl_pct=0.0,
        day_pnl=0.0,
        day_pnl_pct=0.0,
        positions=[],
    )


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------

_client: Optional[NautilusExecutionClient] = None


def get_execution_client() -> NautilusExecutionClient:
    global _client
    if _client is None:
        _client = NautilusExecutionClient()
    return _client
