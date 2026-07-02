"""
Pydantic schemas — shared data models across all API routes and services.
"""
from pydantic import BaseModel, Field
from typing import Optional, Any
from datetime import datetime, UTC
from enum import Enum

from app.core.disclaimer import mar_disclosure


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class SignalDirection(str, Enum):
    BUY = "BUY"
    SELL = "SELL"
    HOLD = "HOLD"
    STRONG_BUY = "STRONG_BUY"
    STRONG_SELL = "STRONG_SELL"


class OrderSide(str, Enum):
    BUY = "buy"
    SELL = "sell"


class OrderType(str, Enum):
    MARKET = "market"
    LIMIT = "limit"
    STOP = "stop"
    STOP_LIMIT = "stop_limit"


class AssetClass(str, Enum):
    STOCK = "stock"
    CRYPTO = "crypto"
    FOREX = "forex"
    FUTURES = "futures"


class SentimentLabel(str, Enum):
    POSITIVE = "positive"
    NEGATIVE = "negative"
    NEUTRAL = "neutral"


# ---------------------------------------------------------------------------
# Signals
# ---------------------------------------------------------------------------

class TradingSignal(BaseModel):
    id: str
    ticker: str
    direction: SignalDirection
    confidence: float = Field(ge=0.0, le=1.0)
    price_target: Optional[float] = None
    stop_loss: Optional[float] = None
    time_horizon: Optional[str] = None          # "1d", "1w", "1m"
    reasoning: Optional[str] = None
    source: str = "TradingAgents"              # which repo generated this
    generated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    agents_consensus: Optional[dict[str, str]] = None
    # Regulatory disclosure (MAR Art. 20 / Delegierte VO (EU) 2016/958 + AI-Act
    # Art. 50): creator identity, methodology, conflict-of-interest, AI-generated
    # flag, capital-loss warning and non-advice clause. Auto-attached to EVERY
    # signal so the frontend can render it next to the recommendation.
    regulatory_notice: dict = Field(default_factory=mar_disclosure)
    # IDs of the YouTube insights that were actually injected into the prompt that
    # produced this signal. Used by the self-learning feedback loop to attribute the
    # trade outcome to exactly these insights. Not part of the public API contract.
    used_insight_ids: list[int] = Field(default_factory=list, exclude=True)  # agent_name → signal


class SignalRequest(BaseModel):
    ticker: str
    analysis_date: Optional[str] = None        # YYYY-MM-DD, default today
    fast_mode: bool = False                     # use haiku instead of sonnet


# ---------------------------------------------------------------------------
# Portfolio
# ---------------------------------------------------------------------------

class Position(BaseModel):
    ticker: str
    asset_class: AssetClass = AssetClass.STOCK
    quantity: float
    avg_entry_price: float
    current_price: float
    market_value: float
    unrealized_pnl: float
    unrealized_pnl_pct: float
    realized_pnl: float = 0.0
    weight: float                               # % of portfolio


class PortfolioSnapshot(BaseModel):
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))
    total_value: float
    cash: float
    invested: float
    total_pnl: float
    total_pnl_pct: float
    day_pnl: float
    day_pnl_pct: float
    positions: list[Position] = []


# ---------------------------------------------------------------------------
# Execution / Orders
# ---------------------------------------------------------------------------

class OrderRequest(BaseModel):
    ticker: str
    side: OrderSide
    quantity: float
    order_type: OrderType = OrderType.MARKET
    limit_price: Optional[float] = None
    stop_price: Optional[float] = None
    time_in_force: str = "gtc"
    note: Optional[str] = None


class OrderResponse(BaseModel):
    order_id: str
    ticker: str
    side: OrderSide
    quantity: float
    order_type: OrderType
    status: str                                 # "pending", "filled", "rejected", "cancelled"
    filled_price: Optional[float] = None
    reject_reason: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    broker: str = "alpaca"


class OrderHistoryItem(BaseModel):
    """Single entry from GET /execution/orders (SQLite-backed history)."""
    order_id: str
    ticker: str
    side: str
    quantity: float
    order_type: str
    status: str
    fill_price: Optional[float] = None
    timestamp: str
    reject_reason: Optional[str] = None


# ---------------------------------------------------------------------------
# Sentiment
# ---------------------------------------------------------------------------

class NewsItem(BaseModel):
    id: str
    headline: str
    source: str
    url: Optional[str] = None
    published_at: datetime
    tickers: list[str] = []
    sentiment: SentimentLabel
    sentiment_score: float = Field(ge=-1.0, le=1.0)
    summary: Optional[str] = None


class SentimentSummary(BaseModel):
    ticker: str
    overall_sentiment: SentimentLabel
    overall_score: float = Field(ge=-1.0, le=1.0)
    news_count: int
    positive_count: int
    negative_count: int
    neutral_count: int
    news_items: list[NewsItem] = []
    generated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


# ---------------------------------------------------------------------------
# Backtesting
# ---------------------------------------------------------------------------

class BacktestRequest(BaseModel):
    strategy_name: str
    ticker: str
    start_date: str                             # YYYY-MM-DD
    end_date: str
    initial_capital: float = 100_000.0
    engine: str = "jesse"                       # "jesse" | "vibe_trading" | "qlib"
    params: dict[str, Any] = {}


class BacktestResult(BaseModel):
    strategy_name: str
    ticker: str
    start_date: str
    end_date: str
    engine: str
    initial_capital: float
    final_capital: float
    total_return_pct: float
    annualized_return_pct: float
    max_drawdown_pct: float
    sharpe_ratio: float
    win_rate: float
    total_trades: int
    equity_curve: list[dict] = []              # [{date, value}]
    trades: list[dict] = []


# ---------------------------------------------------------------------------
# Signal Performance
# ---------------------------------------------------------------------------

class SignalPerformanceEntry(BaseModel):
    """One signal's best/worst performance entry."""
    signal_id: str
    ticker: str
    direction: str
    return_pct: float


class SignalPerformanceResponse(BaseModel):
    """Response for GET /api/signals/performance."""
    avg_return: float
    win_rate: float = Field(ge=0.0, le=1.0)
    best_signal: Optional[SignalPerformanceEntry] = None
    worst_signal: Optional[SignalPerformanceEntry] = None
    total_evaluated: int = Field(ge=0)


# ---------------------------------------------------------------------------
# Risk
# ---------------------------------------------------------------------------

class RiskMetrics(BaseModel):
    ticker: Optional[str] = None
    portfolio_var_95: float                    # Value at Risk 95%
    portfolio_var_99: float
    max_drawdown: float
    current_drawdown: float
    sharpe_ratio: float
    beta: Optional[float] = None
    correlation_sp500: Optional[float] = None
    concentration_risk: float                  # top-5 positions % of portfolio
    # Real gross-exposure / equity ratio (P0: was hardcoded 1.0). Computed by
    # compute_risk_metrics() from live position market values — 0.0 when
    # there are no positions or equity is non-positive.
    leverage: float = 0.0
    alerts: list[str] = []


# ---------------------------------------------------------------------------
# Risk Limits
# ---------------------------------------------------------------------------

class RiskLimits(BaseModel):
    """Response for GET /api/risk/limits."""
    max_position_size_pct: float
    max_daily_loss_pct: float
    max_leverage: float
    enable_live_trading: bool


# ---------------------------------------------------------------------------
# Webhooks
# ---------------------------------------------------------------------------

class WebhookRecord(BaseModel):
    """Matches WebhookRegistration.to_dict()."""
    id: str
    url: str
    events: list[str]
    created_at: str
    last_delivery_at: Optional[str] = None
    last_delivery_status: Optional[int] = None
    delivery_failures: int = 0


class WebhookTestResponse(BaseModel):
    """Response for POST /api/webhooks/{id}/test."""
    webhook_id: str
    status_code: int
    success: bool


class WebhookDeleteResponse(BaseModel):
    """Response for DELETE /api/webhooks/{id}."""
    deleted: bool
    webhook_id: str


# ---------------------------------------------------------------------------
# Price Alerts
# ---------------------------------------------------------------------------

class PriceAlertRecord(BaseModel):
    """Matches the shape returned by PriceAlert.to_dict()."""
    alert_id: str
    ticker: str
    condition: str                               # "above" | "below" | "change_pct"
    threshold: float
    status: str                                  # "active" | "fired"
    created_at: str
    fired_at: Optional[str] = None
    fired_price: Optional[float] = None


# ---------------------------------------------------------------------------
# Portfolio Analytics & Performance
# ---------------------------------------------------------------------------

class TickerPerformer(BaseModel):
    ticker: str
    return_pct: float


class PortfolioAnalytics(BaseModel):
    sharpe_ratio: float
    beta: float
    volatility_30d: float
    best_performer: TickerPerformer
    worst_performer: TickerPerformer
    correlation_matrix: dict[str, dict[str, float]]
    tickers: list[str]
    computed_at: str


class TickerPriceEntry(BaseModel):
    price: Optional[float] = None
    change_pct: Optional[float] = None
    history: list[float] = []
    error: bool = False


class PortfolioPerformance(BaseModel):
    total_value: float
    total_pnl: float
    total_pnl_pct: float
    day_pnl: float
    day_pnl_pct: float
    position_count: int
    cash_pct: float


# ---------------------------------------------------------------------------
# Health / Metrics
# ---------------------------------------------------------------------------

class ApiMetricsResponse(BaseModel):
    requests_total: int
    avg_response_ms: float
    ws_connections_active: int
    signals_generated_today: int
    db_size_kb: float
    uptime_seconds: float
    measured_at: str


class RepoPathEntry(BaseModel):
    path: str
    exists: bool


# ---------------------------------------------------------------------------
# Signals misc
# ---------------------------------------------------------------------------

class ClearCacheResponse(BaseModel):
    cleared: int
    message: str


# ---------------------------------------------------------------------------
# Backtest misc
# ---------------------------------------------------------------------------

class BacktestJobDeleteResponse(BaseModel):
    deleted: str


class BacktestJobStartResponse(BaseModel):
    job_id: str
    status: str


class BacktestJobStatus(BaseModel):
    id: str
    status: str
    created_at: str
    request: dict[str, Any]
    result: Optional[dict[str, Any]] = None
    error: Optional[str] = None
    started_at: Optional[str] = None
    finished_at: Optional[str] = None


class BacktestCompareEntry(BaseModel):
    strategy: str
    return_pct: float
    sharpe: float
    drawdown: float
    trades: int
    is_best: bool
    error: Optional[str] = None


class BacktestCompareResponse(BaseModel):
    ticker: str
    period: str
    start_date: str
    end_date: str
    best_strategy: str
    results: list[BacktestCompareEntry]
    computed_at: str


class BacktestStrategyEntry(BaseModel):
    id: str
    name: str
    description: str
    engines: list[str]
    default_params: dict[str, Any]
    params_schema: dict[str, Any]


# ---------------------------------------------------------------------------
# Execution mode
# ---------------------------------------------------------------------------

class ExecutionModeResponse(BaseModel):
    """Response for GET /api/execution/mode."""
    mode: str
    live_trading_config: bool
    paper_trading_config: bool
    max_position_size_pct: float
    max_daily_loss_pct: float
    max_leverage: float


class ExecutionModeSetResponse(BaseModel):
    """Response for POST /api/execution/mode."""
    previous_mode: str
    current_mode: str
    message: str


# ---------------------------------------------------------------------------
# Generic responses
# ---------------------------------------------------------------------------

class HealthResponse(BaseModel):
    status: str = "ok"
    version: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))
    services: dict[str, str] = {}
    uptime_seconds: Optional[float] = None
    repos: Optional[dict[str, bool]] = None
    environment: Optional[str] = None


class ErrorResponse(BaseModel):
    error: str


# ---------------------------------------------------------------------------
# Elliott Wave Analysis
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Stock Report (Technical, Risk, Verdict)
# ---------------------------------------------------------------------------

class TechnicalIndicators(BaseModel):
    """Computed technical indicators for a single asset."""
    rsi: Optional[float] = None
    macd_hist: Optional[float] = None
    bollinger_pct_b: Optional[float] = None
    sma_trend: str = "neutral"           # "bullish" | "bearish" | "neutral"
    volume_trend: str = "neutral"        # "rising"  | "falling" | "neutral"
    atr: Optional[float] = None
    regime: str = "ranging"             # "trending" | "ranging" | "high_volatility"
    tech_score: float = 0.0             # composite in [-1, +1]
    notes: list[str] = []


class SingleAssetRisk(BaseModel):
    """Single-asset risk metrics and position sizing."""
    var_95_pct: float                   # Historical VaR 95 % (in %)
    var_99_pct: float                   # Historical VaR 99 % (in %)
    cvar_95_pct: float                  # CVaR / Expected Shortfall 95 % (in %)
    ann_vol_pct: float                  # Annualized volatility (in %)
    kelly_fraction: float               # Raw Kelly fraction (before halving)
    recommended_position_pct: float     # Position size as fraction of equity
    recommended_position_value: float   # Position size in base currency
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None
    circuit_breaker: bool = False
    circuit_breaker_reasons: list[str] = []


class StockReportVerdict(str, Enum):
    BUY              = "BUY"
    STRONG_BUY       = "STRONG_BUY"
    HOLD             = "HOLD"
    SELL             = "SELL"
    STRONG_SELL      = "STRONG_SELL"
    NO_RECOMMENDATION = "NO_RECOMMENDATION"


class StockReport(BaseModel):
    """Unified stock report with AI verdict and risk assessment."""
    ticker: str
    generated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    verdict: StockReportVerdict
    verdict_label_de: str               # "KAUFEN" | "HALTEN" | "VERKAUFEN" | "KEINE EMPFEHLUNG"
    confidence: float = Field(ge=0.0, le=1.0)
    composite_score: float = Field(ge=-1.0, le=1.0)
    position_size_pct: float            # Recommended position as fraction of equity
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None
    summary: str                        # German-language 3-6 sentence justification
    components: dict[str, Any]          # Sub-module results + sub-scores
    agreement: float = Field(ge=0.0, le=1.0)
    data_quality: str                   # "good" | "limited" | "insufficient"
    # Regulatory disclosure (MAR Art. 20 + AI-Act Art. 50) — auto-attached to the
    # full stock-analysis report so the frontend renders it with every verdict.
    regulatory_notice: dict = Field(default_factory=mar_disclosure)


# ---------------------------------------------------------------------------
# Elliott Wave Analysis
# ---------------------------------------------------------------------------

class ElliottWavePoint(BaseModel):
    label: str
    price: float
    date: str
    wave_type: str
    is_current: bool = False


class FibonacciLevel(BaseModel):
    ratio: float
    label: str
    price: float
    type: str


class OhlcvCandle(BaseModel):
    date: str
    open: float
    high: float
    low: float
    close: float
    volume: int


class ElliottWaveAnalysis(BaseModel):
    ticker: str
    period: str
    wave_degree: str
    sequence_type: str
    current_wave: str
    wave_direction: str
    confidence: float
    waves: list[ElliottWavePoint]
    fibonacci_levels: list[FibonacciLevel]
    price_targets: list[float]
    stop_loss: float
    interpretation: str
    candles: list[OhlcvCandle]
    analyzed_at: str
    detail: Optional[str] = None
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))


# ---------------------------------------------------------------------------
# Live Market Analysis (GET /api/analysis/live/{symbol})
# ---------------------------------------------------------------------------

class LiveAnalysisPrice(BaseModel):
    last: float
    change: float
    change_pct: float
    day_high: float
    day_low: float
    volume: float


class LiveAnalysisMACD(BaseModel):
    macd: float
    signal: float
    hist: float


class LiveAnalysisBollinger(BaseModel):
    upper: float
    middle: float
    lower: float
    pct_b: float


class LiveAnalysisIndicators(BaseModel):
    rsi_14: Optional[float] = None
    macd: LiveAnalysisMACD
    bollinger: LiveAnalysisBollinger
    sma_20: Optional[float] = None
    sma_50: Optional[float] = None
    sma_200: Optional[float] = None
    atr_14: Optional[float] = None
    volume_avg_20: Optional[float] = None


class LiveAnalysisSignal(BaseModel):
    bias: str        # "bullish" | "bearish" | "neutral"
    score: int        # -100..100
    reasons: list[str] = []


class LiveMarketAnalysis(BaseModel):
    symbol: str
    as_of: str
    price: LiveAnalysisPrice
    indicators: LiveAnalysisIndicators
    regime: str       # "trending_up" | "trending_down" | "ranging" | "volatile"
    signal: LiveAnalysisSignal
    regulatory_notice: dict


# ---------------------------------------------------------------------------
# Analysis Watchlist (GET/PUT /api/analysis/watchlist)
# ---------------------------------------------------------------------------

class WatchlistResponse(BaseModel):
    symbols: list[str]


class WatchlistUpdateRequest(BaseModel):
    symbols: list[str]


# ---------------------------------------------------------------------------
# Market presets (GET /api/analysis/markets)
# ---------------------------------------------------------------------------

class MarketSymbol(BaseModel):
    symbol: str
    name: str


class MarketCategory(BaseModel):
    id: str           # "us_stocks" | "dax" | "indices" | "crypto" | "forex" | "commodities"
    label: str        # German display label
    symbols: list[MarketSymbol]


class MarketsResponse(BaseModel):
    markets: list[MarketCategory]
