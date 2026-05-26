/**
 * API client — thin wrapper around fetch for all backend calls.
 * All functions throw on HTTP errors with descriptive messages.
 */

import type {
  TradingSignal,
  SignalRequest,
  SignalPerformanceResponse,
  ClearCacheResponse,
  Position,
  PortfolioSnapshot,
  PortfolioAnalytics,
  PortfolioPerformance,
  TickerPriceEntry,
  OrderRequest,
  OrderResponse,
  OrderHistoryItem,
  ExecutionModeResponse,
  ExecutionModeSetResponse,
  SentimentSummary,
  BacktestRequest,
  BacktestJob,
  BacktestJobStartResponse,
  BacktestJobDeleteResponse,
  BacktestStrategyEntry,
  BacktestCompareResponse,
  RiskMetrics,
  RiskLimits,
  HealthResponse,
  ApiMetricsResponse,
  RepoPathEntry,
  PriceAlertRecord,
  WebhookRecord,
  WebhookTestResponse,
  WebhookDeleteResponse,
  PriceAlertDeleteResponse,
  BacktestResult,
  ElliottWaveAnalysis,
} from "@/types";

function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("neural-auth-storage");
    if (!raw) return null;
    return (JSON.parse(raw) as { state?: { token?: string } })?.state?.token ?? null;
  } catch {
    return null;
  }
}

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const BASE_URL = API_BASE;

// ---------------------------------------------------------------------------
// Core fetch helper
// ---------------------------------------------------------------------------
async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const token = getAuthToken();
  const authHeader: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...authHeader,
      ...options.headers,
    },
    ...options,
  });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const err = await res.json();
      detail = err.detail || err.error || detail;
    } catch {}
    throw new Error(`API error: ${detail}`);
  }

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------
export const api = {
  health: {
    check: () => apiFetch<HealthResponse>("/api/health"),
    metrics: () => apiFetch<ApiMetricsResponse>("/api/health/metrics"),
    repoPaths: () => apiFetch<Record<string, RepoPathEntry>>("/api/health/repos"),
  },

  // -------------------------------------------------------------------------
  // Signals
  // -------------------------------------------------------------------------
  signals: {
    generate: (req: SignalRequest) =>
      apiFetch<TradingSignal>("/api/signals/generate", {
        method: "POST",
        body: JSON.stringify(req),
      }),
    /** No API key required — always returns a realistic mock signal. */
    demo: (ticker?: string) =>
      apiFetch<TradingSignal>(
        `/api/signals/demo${ticker ? `?ticker=${encodeURIComponent(ticker)}` : ""}`,
        { method: "POST" }
      ),
    get: (ticker: string) =>
      apiFetch<TradingSignal | null>(`/api/signals/${ticker}`),
    list: (params?: { ticker?: string; direction?: string; limit?: number; offset?: number }) => {
      const qs = new URLSearchParams();
      if (params?.ticker)    qs.set("ticker",    params.ticker);
      if (params?.direction) qs.set("direction", params.direction);
      if (params?.limit   != null) qs.set("limit",  String(params.limit));
      if (params?.offset  != null) qs.set("offset", String(params.offset));
      const query = qs.toString();
      return apiFetch<TradingSignal[]>(`/api/signals/${query ? `?${query}` : ""}`);
    },
    performance: () => apiFetch<SignalPerformanceResponse>("/api/signals/performance"),
    trending: (limit = 10) =>
      apiFetch<Array<{ ticker: string; count: number; avg_confidence: number; trending: boolean }>>(
        `/api/signals/trending?limit=${limit}`
      ),
    stats: () =>
      apiFetch<{ total_today: number; buy: number; sell: number; hold: number; by_direction: Record<string, number>; date: string }>(
        "/api/signals/stats"
      ),
    clearCache: () => apiFetch<ClearCacheResponse>("/api/signals/cache", { method: "DELETE" }),
    /** Batch-scan up to 10 tickers in parallel (demo mode). */
    batch: (tickers: string[]) =>
      apiFetch<TradingSignal[]>("/api/signals/batch", {
        method: "POST",
        body: JSON.stringify({ tickers, fast_mode: true }),
      }),
  },

  // -------------------------------------------------------------------------
  // Portfolio
  // -------------------------------------------------------------------------
  portfolio: {
    /** Live-priced demo portfolio (yfinance, AAPL/MSFT/NVDA/TSLA/BTC-USD) */
    snapshot: () => apiFetch<PortfolioSnapshot>("/api/portfolio/snapshot"),
    /** Nautilus execution engine portfolio (falls back to empty) */
    nautilus: () => apiFetch<PortfolioSnapshot>("/api/portfolio/"),
    positions: () => apiFetch<Position[]>("/api/portfolio/positions"),
    performance: () => apiFetch<PortfolioPerformance>("/api/portfolio/performance"),
    analytics: () => apiFetch<PortfolioAnalytics>("/api/portfolio/analytics"),
    prices: (tickers: string[]) =>
      apiFetch<Record<string, TickerPriceEntry>>(
        `/api/portfolio/prices?tickers=${encodeURIComponent(tickers.join(","))}`
      ),
    candles: (ticker: string, period = "1mo", interval = "1d", indicators: string[] = []) =>
      apiFetch<Array<{ time: number; open: number; high: number; low: number; close: number; volume: number; sma20?: number | null; sma50?: number | null; rsi14?: number | null; macd?: number | null; macd_signal?: number | null; bb_upper?: number | null; bb_lower?: number | null; bb_mid?: number | null }>>(
        `/api/portfolio/candles?ticker=${encodeURIComponent(ticker)}&period=${period}&interval=${interval}${indicators.length ? `&indicators=${indicators.join(",")}` : ""}`
      ),
    equityCurve: (days = 30) =>
      apiFetch<Array<{ date: string; value: number }>>(`/api/portfolio/equity-curve?days=${days}`),
  },

  // -------------------------------------------------------------------------
  // Execution
  // -------------------------------------------------------------------------
  execution: {
    submitOrder: (req: OrderRequest) =>
      apiFetch<OrderResponse>("/api/execution/order", {
        method: "POST",
        body: JSON.stringify(req),
      }),
    mode: () => apiFetch<ExecutionModeResponse>("/api/execution/mode"),
    setMode: (mode: "paper" | "live") =>
      apiFetch<ExecutionModeSetResponse>(`/api/execution/mode?mode=${mode}`, {
        method: "POST",
      }),
    orders: () => apiFetch<OrderHistoryItem[]>("/api/execution/orders"),
  },

  // -------------------------------------------------------------------------
  // Sentiment
  // -------------------------------------------------------------------------
  sentiment: {
    get: (ticker: string) =>
      apiFetch<SentimentSummary>(`/api/sentiment/${ticker}`),
    getMulti: (tickers: string[]) =>
      apiFetch<SentimentSummary[]>(
        `/api/sentiment/?tickers=${tickers.join(",")}`
      ),
  },

  // -------------------------------------------------------------------------
  // Backtesting
  // -------------------------------------------------------------------------
  backtest: {
    run: (req: BacktestRequest) =>
      apiFetch<BacktestJobStartResponse>("/api/backtest/run", {
        method: "POST",
        body: JSON.stringify(req),
      }),
    jobs: () => apiFetch<BacktestJob[]>("/api/backtest/jobs"),
    job: (id: string) => apiFetch<BacktestJob>(`/api/backtest/jobs/${id}`),
    result: (id: string) => apiFetch<BacktestResult>(`/api/backtest/results/${id}`),
    strategies: () => apiFetch<BacktestStrategyEntry[]>("/api/backtest/strategies"),
    compare: (body: { ticker: string; period: string; strategies: string[] }) =>
      apiFetch<BacktestCompareResponse>("/api/backtest/compare", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    deleteJob: (id: string) =>
      apiFetch<BacktestJobDeleteResponse>(`/api/backtest/jobs/${id}`, {
        method: "DELETE",
      }),
  },

  // -------------------------------------------------------------------------
  // Risk
  // -------------------------------------------------------------------------
  risk: {
    metrics: () => apiFetch<RiskMetrics>("/api/risk/metrics"),
    limits: () => apiFetch<RiskLimits>("/api/risk/limits"),
    alerts: () => apiFetch<string[]>("/api/risk/alerts"),
  },

  // -------------------------------------------------------------------------
  // Webhooks
  // -------------------------------------------------------------------------
  webhooks: {
    list: () => apiFetch<WebhookRecord[]>("/api/webhooks/"),
    create: (body: { url: string; events: string[]; secret?: string }) =>
      apiFetch<WebhookRecord>("/api/webhooks/", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    delete: (id: string) =>
      apiFetch<WebhookDeleteResponse>(`/api/webhooks/${id}`, { method: "DELETE" }),
    test: (id: string) =>
      apiFetch<WebhookTestResponse>(`/api/webhooks/${id}/test`, { method: "POST" }),
  },

  // -------------------------------------------------------------------------
  // Price Alerts (CRUD)
  // -------------------------------------------------------------------------
  priceAlerts: {
    list: () => apiFetch<PriceAlertRecord[]>("/api/alerts/"),
    create: (body: { ticker: string; condition: "above" | "below" | "change_pct"; threshold: number }) =>
      apiFetch<PriceAlertRecord>("/api/alerts/", { method: "POST", body: JSON.stringify(body) }),
    delete: (alertId: string) =>
      apiFetch<PriceAlertDeleteResponse>(`/api/alerts/${alertId}`, { method: "DELETE" }),
  },

  // -------------------------------------------------------------------------
  // Technical Analysis (Elliott Waves)
  // -------------------------------------------------------------------------
  analysis: {
    elliott: (ticker: string, period = "6mo") =>
      apiFetch<ElliottWaveAnalysis>(`/api/analysis/elliott/${ticker}?period=${period}`),
    elliottDemo: () =>
      apiFetch<ElliottWaveAnalysis>("/api/analysis/elliott/demo"),
  },

  // -------------------------------------------------------------------------
  // Billing (Stripe — returns 503 when not configured)
  // -------------------------------------------------------------------------
  billing: {
    status: () => apiFetch<{
      user_id: string; plan: string; plan_name: string; price_eur: number;
      signals_per_day: number; status: string; current_period_end: string | null;
      cancel_at_period_end: boolean; stripe_configured: boolean;
    }>("/api/billing/status"),
    plans: () => apiFetch<{
      plans: Array<{ id: string; name: string; price_eur: number; signals_day: number; available: boolean }>;
      stripe_configured: boolean;
    }>("/api/billing/plans"),
    checkout: (plan: string, annual = false) =>
      apiFetch<{ checkout_url: string; session_id: string }>("/api/billing/checkout", {
        method: "POST",
        body: JSON.stringify({ plan, annual }),
      }),
    portal: () =>
      apiFetch<{ portal_url: string }>("/api/billing/portal", { method: "POST" }),
    usage: () =>
      apiFetch<{
        plan: string; signals_used_today: number; signals_limit: number;
        signals_remaining: number; reset_at: string;
      }>("/api/billing/usage"),
  },
};
