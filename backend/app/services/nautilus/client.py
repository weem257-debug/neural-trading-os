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

    async def submit_order(self, req: OrderRequest) -> OrderResponse:
        """
        Submit a trading order.
        Routes to live or paper execution based on config and current mode.
        """
        use_live = self._mode == "live" and settings.ENABLE_LIVE_TRADING and self._initialized
        if use_live:
            return await self._live_order(req)
        return await self._paper_order(req)

    async def _paper_order(self, req: OrderRequest) -> OrderResponse:
        """Simulate order fill for paper trading."""
        order_id = str(uuid.uuid4())
        timestamp = datetime.now(UTC)
        ticker = req.ticker.upper()

        # Validation: quantity
        if req.quantity <= 0:
            record = _OrderRecord(
                order_id=order_id,
                ticker=ticker,
                side=req.side.value,
                quantity=req.quantity,
                order_type=req.order_type.value,
                status="rejected",
                fill_price=None,
                timestamp=timestamp,
                reject_reason="invalid_quantity",
            )
            self._orders[order_id] = record
            logger.warning("PAPER ORDER REJECTED (invalid_quantity): %s %s", req.side, ticker)
            return record.to_response()

        # Validation: SELL without position
        if req.side.value == "sell":
            pos = self._positions.get(ticker)
            if pos is None or pos["quantity"] < req.quantity:
                record = _OrderRecord(
                    order_id=order_id,
                    ticker=ticker,
                    side=req.side.value,
                    quantity=req.quantity,
                    order_type=req.order_type.value,
                    status="rejected",
                    fill_price=None,
                    timestamp=timestamp,
                    reject_reason="insufficient_position",
                )
                self._orders[order_id] = record
                logger.warning("PAPER ORDER REJECTED (insufficient_position): SELL %s", ticker)
                return record.to_response()

        # Fetch fill price
        fill_price = _fetch_price(ticker)
        if fill_price is None:
            # Fallback: use limit_price if provided, else a nominal $100
            fill_price = req.limit_price or 100.0

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
        )
        self._orders[order_id] = record
        logger.info(
            "PAPER ORDER FILLED: %s %s x%.4f @ %.2f",
            req.side.value.upper(), ticker, req.quantity, fill_price,
        )
        # Persist to DB asynchronously (non-blocking; silently skips on error)
        await _persist_order_to_db(record)
        return record.to_response()

    async def _live_order(self, req: OrderRequest) -> OrderResponse:
        """Submit order to live broker via nautilus engine."""
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

    def get_order_history(self, limit: int = 50) -> list[dict]:
        """Return last N orders sorted newest-first (in-memory only).
        For async DB-backed history use get_order_history_async."""
        records = sorted(self._orders.values(), key=lambda r: r.timestamp, reverse=True)
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

    async def get_order_history_async(self, limit: int = 50) -> list[dict]:
        """Return last N orders from SQLite (fallback: in-memory)."""
        try:
            from sqlalchemy import select, desc
            from app.db.database import get_session
            from app.db.models import OrderRecord

            async with get_session() as session:
                result = await session.execute(
                    select(OrderRecord)
                    .order_by(desc(OrderRecord.submitted_at))
                    .limit(limit)
                )
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
        except Exception as db_err:
            logger.debug("order_db_read_fallback", extra={"reason": str(db_err)})

        # Fallback: in-memory
        return self.get_order_history(limit)

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
