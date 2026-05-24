/**
 * Shared TypeScript types — mirror of backend Pydantic schemas.
 */

export type SignalDirection =
  | "BUY"
  | "SELL"
  | "HOLD"
  | "STRONG_BUY"
  | "STRONG_SELL";

export type OrderSide = "buy" | "sell";
export type OrderType = "market" | "limit" | "stop" | "stop_limit";
export type AssetClass = "stock" | "crypto" | "forex" | "futures";
export type SentimentLabel = "positive" | "negative" | "neutral";

// ---------------------------------------------------------------------------
// Signals
// ---------------------------------------------------------------------------
export interface TradingSignal {
  id: string;
  ticker: string;
  direction: SignalDirection;
  confidence: number;        // 0.0 – 1.0
  price_target?: number;
  stop_loss?: number;
  time_horizon?: string;
  reasoning?: string;
  source: string;
  generated_at: string;      // ISO datetime string
  agents_consensus?: Record<string, string>;
}

export interface SignalRequest {
  ticker: string;
  analysis_date?: string;
  fast_mode?: boolean;
}

// ---------------------------------------------------------------------------
// Portfolio
// ---------------------------------------------------------------------------
export interface Position {
  ticker: string;
  asset_class: AssetClass;
  quantity: number;
  avg_entry_price: number;
  current_price: number;
  market_value: number;
  unrealized_pnl: number;
  unrealized_pnl_pct: number;
  realized_pnl: number;
  weight: number;
}

export interface PortfolioSnapshot {
  timestamp: string;
  total_value: number;
  cash: number;
  invested: number;
  total_pnl: number;
  total_pnl_pct: number;
  day_pnl: number;
  day_pnl_pct: number;
  positions: Position[];
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------
export interface OrderRequest {
  ticker: string;
  side: OrderSide;
  quantity: number;
  order_type?: OrderType;
  limit_price?: number;
  stop_price?: number;
  time_in_force?: string;
  note?: string;
}

export interface OrderResponse {
  order_id: string;
  ticker: string;
  side: OrderSide;
  quantity: number;
  order_type: OrderType;
  status: string;
  filled_price?: number;
  reject_reason?: string;
  created_at: string;
  broker: string;
}

/** Order from GET /api/execution/orders — SQLite-backed history. */
export interface OrderHistoryItem {
  order_id: string;
  ticker: string;
  side: string;
  quantity: number;
  order_type: string;
  status: string;
  fill_price?: number;
  timestamp: string;
  reject_reason?: string;
}

export type AnyOrder = OrderResponse | OrderHistoryItem;

export interface ExecutionModeResponse {
  mode: "paper" | "live";
  live_trading_config: boolean;
  paper_trading_config: boolean;
  max_position_size_pct: number;
  max_daily_loss_pct: number;
  max_leverage: number;
}

export interface ExecutionModeSetResponse {
  previous_mode: string;
  current_mode: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Sentiment
// ---------------------------------------------------------------------------
export interface NewsItem {
  id: string;
  headline: string;
  source: string;
  url?: string;
  published_at: string;
  tickers: string[];
  sentiment: SentimentLabel;
  sentiment_score: number;   // -1.0 to 1.0
  summary?: string;
}

export interface SentimentSummary {
  ticker: string;
  overall_sentiment: SentimentLabel;
  overall_score: number;
  news_count: number;
  positive_count: number;
  negative_count: number;
  neutral_count: number;
  news_items: NewsItem[];
  generated_at: string;
}

// ---------------------------------------------------------------------------
// Backtesting
// ---------------------------------------------------------------------------
export interface BacktestRequest {
  strategy_name: string;
  ticker: string;
  start_date: string;
  end_date: string;
  initial_capital?: number;
  engine?: "jesse" | "vibe_trading" | "qlib";
  params?: Record<string, unknown>;
}

export interface BacktestResult {
  strategy_name: string;
  ticker: string;
  start_date: string;
  end_date: string;
  engine: string;
  initial_capital: number;
  final_capital: number;
  total_return_pct: number;
  annualized_return_pct: number;
  max_drawdown_pct: number;
  sharpe_ratio: number;
  win_rate: number;
  total_trades: number;
  equity_curve: Array<{ date: string; value: number }>;
  trades: Array<Record<string, unknown>>;
}

export interface BacktestJob {
  id: string;
  status: "queued" | "running" | "completed" | "failed";
  request: BacktestRequest;
  created_at: string;
  started_at?: string;
  finished_at?: string;
  result?: BacktestResult;
  error?: string;
}

// ---------------------------------------------------------------------------
// Signals performance
// ---------------------------------------------------------------------------
export interface SignalPerformanceEntry {
  signal_id: string;
  ticker: string;
  direction: string;
  return_pct: number;
}

export interface SignalPerformanceResponse {
  avg_return: number;
  win_rate: number;
  best_signal: SignalPerformanceEntry | null;
  worst_signal: SignalPerformanceEntry | null;
  total_evaluated: number;
}

export interface ClearCacheResponse {
  cleared: number;
  message: string;
}

// ---------------------------------------------------------------------------
// Portfolio analytics & performance
// ---------------------------------------------------------------------------
export interface TickerPerformer {
  ticker: string;
  return_pct: number;
}

export interface PortfolioAnalytics {
  sharpe_ratio: number;
  beta: number;
  volatility_30d: number;
  best_performer: TickerPerformer;
  worst_performer: TickerPerformer;
  correlation_matrix: Record<string, Record<string, number>>;
  tickers: string[];
  computed_at: string;
}

export interface TickerPriceEntry {
  price: number | null;
  change_pct: number | null;
  history: number[];
  error?: boolean;
}

export interface PortfolioPerformance {
  total_value: number;
  total_pnl: number;
  total_pnl_pct: number;
  day_pnl: number;
  day_pnl_pct: number;
  position_count: number;
  cash_pct: number;
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------
export interface WebhookRecord {
  id: string;
  url: string;
  events: string[];
  created_at: string;
  last_delivery_at?: string | null;
  last_delivery_status?: number | null;
  delivery_failures: number;
}

export interface WebhookTestResponse {
  webhook_id: string;
  status_code: number;
  success: boolean;
}

export interface WebhookDeleteResponse {
  deleted: boolean;
  webhook_id: string;
}

export interface PriceAlertDeleteResponse {
  deleted: boolean;
  alert_id: string;
}

// ---------------------------------------------------------------------------
// Health metrics
// ---------------------------------------------------------------------------
export interface ApiMetricsResponse {
  requests_total: number;
  avg_response_ms: number;
  ws_connections_active: number;
  signals_generated_today: number;
  db_size_kb: number;
  uptime_seconds: number;
  measured_at: string;
}

export interface RepoPathEntry {
  path: string;
  exists: boolean;
}

// ---------------------------------------------------------------------------
// Elliott Wave Analysis
// ---------------------------------------------------------------------------

export interface ElliottWavePoint {
  label: string;
  price: number;
  date: string;
  wave_type: "peak" | "trough" | "start";
  is_current: boolean;
}

export interface FibonacciLevel {
  ratio: number;
  label: string;
  price: number;
  type: "support" | "resistance";
}

export interface OhlcvCandle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ElliottWaveAnalysis {
  ticker: string;
  period: string;
  wave_degree: string;
  sequence_type: "impulse" | "corrective";
  current_wave: string;
  wave_direction: "bullish" | "bearish" | "neutral";
  confidence: number;
  waves: ElliottWavePoint[];
  fibonacci_levels: FibonacciLevel[];
  price_targets: number[];
  stop_loss: number;
  interpretation: string;
  candles: OhlcvCandle[];
  analyzed_at: string;
}

// ---------------------------------------------------------------------------
// Backtest extras
// ---------------------------------------------------------------------------
export interface BacktestStrategyEntry {
  id: string;
  name: string;
  description: string;
  engines: string[];
  default_params: Record<string, number>;
  params_schema: Record<string, unknown>;
}

export interface BacktestCompareEntry {
  strategy: string;
  return_pct: number;
  sharpe: number;
  drawdown: number;
  trades: number;
  is_best: boolean;
  error?: string;
}

export interface BacktestCompareResponse {
  ticker: string;
  period: string;
  start_date: string;
  end_date: string;
  best_strategy: string;
  results: BacktestCompareEntry[];
  computed_at: string;
}

export interface BacktestJobStartResponse {
  job_id: string;
  status: string;
}

export interface BacktestJobDeleteResponse {
  deleted: string;
}

// ---------------------------------------------------------------------------
// Risk
// ---------------------------------------------------------------------------
export interface RiskMetrics {
  ticker?: string;
  portfolio_var_95: number;
  portfolio_var_99: number;
  max_drawdown: number;
  current_drawdown: number;
  sharpe_ratio: number;
  beta?: number;
  correlation_sp500?: number;
  concentration_risk: number;
  leverage: number;
  alerts: string[];
}

// ---------------------------------------------------------------------------
// Risk Limits
// ---------------------------------------------------------------------------
export interface RiskLimits {
  max_position_size_pct: number;
  max_daily_loss_pct: number;
  max_leverage: number;
  enable_live_trading: boolean;
}

// ---------------------------------------------------------------------------
// Price Alerts
// ---------------------------------------------------------------------------
export interface PriceAlertRecord {
  alert_id: string;
  ticker: string;
  condition: "above" | "below" | "change_pct";
  threshold: number;
  status: "active" | "fired";
  created_at: string;
  fired_at?: string;
  fired_price?: number;
}

// ---------------------------------------------------------------------------
// WebSocket events
// ---------------------------------------------------------------------------
export interface WSEvent {
  type: string;
  timestamp: string;
  channel?: string;
  data?: unknown;
  message?: string;
  level?: string;
  ticker?: string;
  price?: number;
  change_pct?: number;
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------
export interface HealthResponse {
  status: string;
  version: string;
  timestamp: string;
  services: Record<string, string>;
  uptime_seconds?: number | null;
  repos?: Record<string, boolean> | null;
  environment?: string | null;
}
