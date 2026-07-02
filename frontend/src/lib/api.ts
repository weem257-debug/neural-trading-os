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
  WatchlistResponse,
  LiveMarketAnalysis,
  MarketsResponse,
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
  StockReport,
} from "@/types";

// ---------------------------------------------------------------------------
// Broker types (inline — avoids circular imports from types/index.ts)
// ---------------------------------------------------------------------------
export interface BrokerPortfolioData {
  broker: string;
  total_value?: number;
  total_value_eur?: number;
  total_invested_eur?: number;
  total_profit_loss?: number;
  total_profit_loss_eur?: number;
  total_profit_loss_pct?: number;
  total_invested?: number;
  free_cash?: number;
  currency?: string;
  num_positions?: number;
  num_depots?: number;
  positions?: BrokerPosition[];
  depots?: BrokerDepot[];
  fetched_at?: string;
  is_demo?: boolean;
  lib_missing?: boolean;
  auth_required?: boolean;
  error?: string;
}

export interface BrokerPosition {
  symbol?: string;
  name?: string;
  type?: string;
  asset_type?: string;
  amount?: number;
  quantity?: number;
  current_price?: number;
  current_price_eur?: number;
  current_value_eur?: number;
  current_value?: number;
  profit_loss_eur?: number;
  profit_loss_abs?: number;   // comdirect alias
  profit_loss_pct?: number;
  purchase_price?: number;
  average_price_eur?: number;
  isin?: string;
  wkn?: string;
  depot_id?: string;
}

export interface BrokerDepot {
  depot_id: string;
  depot_name: string;
  total_value: number;
  total_profit_loss?: number;
  currency: string;
  num_positions?: number;
  positions: BrokerPosition[];
}

export interface BrokerTransaction {
  id?: string;
  type?: string;
  status?: string;
  symbol?: string;
  name?: string;
  amount?: number;
  quantity?: number;
  price_eur?: number;
  price?: number;
  total_eur?: number;
  total?: number;
  fee_eur?: number;
  currency?: string;
  executed_at?: string;
}

/**
 * Returns the JWT from localStorage if still present (legacy / API-client path).
 * With cookie-based auth the token is no longer persisted to localStorage, so
 * this returns null for browser sessions — the httpOnly cookie carries the session.
 */
export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("neural-auth-storage");
    if (!raw) return null;
    return (JSON.parse(raw) as { state?: { token?: string } })?.state?.token ?? null;
  } catch {
    return null;
  }
}

/**
 * Reads the CSRF token from the non-httpOnly csrf_token cookie set by the server.
 * Must only be called in the browser context.
 */
function getCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
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

  // Bearer fallback: only present when a legacy token exists in localStorage.
  // For cookie-based browser sessions this is null and the httpOnly cookie
  // is sent automatically via credentials: "include".
  const token = getAuthToken();
  const authHeader: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  // CSRF Double-Submit: include X-CSRF-Token header for state-changing methods
  // when the session is cookie-based (csrf_token cookie is present).
  const method = (options.method ?? "GET").toUpperCase();
  const isStateMutating = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
  const csrf = isStateMutating ? getCsrfToken() : "";
  const csrfHeader: Record<string, string> = csrf ? { "X-CSRF-Token": csrf } : {};

  const res = await fetch(url, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...authHeader,
      ...csrfHeader,
      ...options.headers,
    },
  });

  if (!res.ok) {
    if (res.status === 401) {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("auth-expired"));
      }
    }
    let detail = `HTTP ${res.status}`;
    try {
      const err = await res.json();
      const raw = err.detail || err.error || detail;
      // FastAPI may return detail as an object (e.g. quota errors with structured metadata)
      detail = typeof raw === "object" && raw !== null
        ? (raw as { message?: string }).message ?? JSON.stringify(raw)
        : String(raw);
    } catch {}
    throw new Error(detail);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------
export const api = {
  auth: {
    me: () => apiFetch<{ username: string; role: string; tier: string; email: string | null; email_unsubscribed: boolean; created_at: string | null }>("/api/auth/me"),
    checkUsername: (username: string) =>
      apiFetch<{ available: boolean }>(`/api/auth/check-username?username=${encodeURIComponent(username)}`),
    exportData: async (): Promise<void> => {
      const token = getAuthToken();
      const res = await fetch(`${API_BASE}/api/auth/export-data`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        if (res.status === 401 && typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("auth-expired"));
        }
        throw new Error(`HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") ?? "";
      const match = cd.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? "export.json";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    },
    referralStats: () => apiFetch<{ referral_count: number; referral_url: string }>("/api/auth/referral-stats"),
    emailPreferences: (subscribed: boolean) =>
      apiFetch<{ subscribed: boolean }>("/api/auth/email-preferences", { method: "POST", body: JSON.stringify({ subscribed }) }),
    updateProfile: (email: string) =>
      apiFetch<{ email: string; message: string }>("/api/auth/profile", { method: "PUT", body: JSON.stringify({ email }) }),
    changePassword: (currentPassword: string, newPassword: string) =>
      apiFetch<{ message: string }>("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      }),
    deleteAccount: () =>
      apiFetch<{ message: string }>("/api/auth/account", { method: "DELETE" }),
  },
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
    performanceByTicker: () => apiFetch<{ tickers: Array<{ ticker: string; total: number; wins: number; win_rate: number; avg_return: number }> }>("/api/signals/performance/by-ticker"),
    performanceMine: () => apiFetch<{ avg_return: number; win_rate: number; best_signal: { signal_id: string; ticker: string; direction: string; return_pct: number } | null; worst_signal: { signal_id: string; ticker: string; direction: string; return_pct: number } | null; total_evaluated: number }>("/api/signals/performance/mine"),
    trending: (limit = 10) =>
      apiFetch<Array<{ ticker: string; count: number; avg_confidence: number; trending: boolean }>>(
        `/api/signals/trending?limit=${limit}`
      ),
    stats: () =>
      apiFetch<{ total_today: number; buy: number; sell: number; hold: number; by_direction: Record<string, number>; date: string }>(
        "/api/signals/stats"
      ),
    total: () => apiFetch<{ total: number }>("/api/signals/total"),
    history: (limit = 10) =>
      apiFetch<Array<{ id: string; ticker: string; direction: string; confidence: number; source: string; generated_at: string; reasoning: string | null; price_target: number | null; stop_loss: number | null; time_horizon: string | null }>>(
        `/api/signals/history?limit=${limit}`
      ),
    byId: (id: string) =>
      apiFetch<TradingSignal | null>(`/api/signals/by-id/${encodeURIComponent(id)}`),
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
  // P2P Lending
  // -------------------------------------------------------------------------
  p2p: {
    summary: () => apiFetch<{
      total_invested: number; outstanding_principal: number; total_interest: number;
      total_defaulted: number; cash_balance: number; net_annual_return_weighted: number | null;
      platforms: Array<{ platform: string; total_invested: number; outstanding_principal: number;
        interest_month: number; total_interest: number; defaulted_amount: number;
        cash_balance: number; net_annual_return: number | null; num_active_loans: number;
        currency: string; fetched_at: string; is_demo: boolean }>;
      is_demo: boolean; fetched_at: string;
    }>("/api/p2p/summary"),
    snapshot: (portfolioId?: number) =>
      apiFetch<{ saved: string[]; portfolio_id: number | null }>(
        `/api/p2p/snapshot${portfolioId != null ? `?portfolio_id=${portfolioId}` : ""}`,
        { method: "POST" }
      ),
    history: (limit = 30, platform?: string) =>
      apiFetch<Array<{
        id: number; platform: string; portfolio_id: number | null;
        total_invested: number; outstanding_principal: number; interest_month: number;
        total_interest: number; defaulted_amount: number; cash_balance: number;
        net_annual_return: number | null; num_active_loans: number;
        currency: string; fetched_at: string;
      }>>(`/api/p2p/history?limit=${limit}${platform ? `&platform=${encodeURIComponent(platform)}` : ""}`),
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
    /** Live-Markt-Analyse: Watchlist laden/speichern + Live-Indikatoren pro Symbol. */
    watchlistGet: () =>
      apiFetch<WatchlistResponse>("/api/analysis/watchlist"),
    watchlistSet: (symbols: string[]) =>
      apiFetch<WatchlistResponse>("/api/analysis/watchlist", {
        method: "PUT",
        body: JSON.stringify({ symbols }),
      }),
    live: (symbol: string) =>
      apiFetch<LiveMarketAnalysis>(`/api/analysis/live/${encodeURIComponent(symbol)}`),
    /** Kuratierte Markt-Kategorien (US-Aktien, DAX, Indizes, Krypto, Forex, Rohstoffe). */
    markets: () =>
      apiFetch<MarketsResponse>("/api/analysis/markets"),
  },

  // -------------------------------------------------------------------------
  // Stock Report (unified KI-Analyse mit Verdikt)
  // -------------------------------------------------------------------------
  report: {
    /** Full report for the given ticker. Pass an optional share key when the
     *  backend gate REPORT_SHARE_TOKEN is active. */
    get: (ticker: string, key?: string): Promise<StockReport> => {
      const qs = key ? `?key=${encodeURIComponent(key)}` : "";
      return apiFetch<StockReport>(`/api/report/${encodeURIComponent(ticker)}${qs}`);
    },
  },

  // -------------------------------------------------------------------------
  // Settings / Credentials
  // -------------------------------------------------------------------------
  settings: {
    credentials: () =>
      apiFetch<Record<string, "configured" | "not_set">>("/api/settings/credentials"),
    saveCredential: (key: string, value: string) =>
      apiFetch<{ ok: boolean; key: string }>("/api/settings/credentials", {
        method: "POST",
        body: JSON.stringify({ key, value }),
      }),
    deleteCredential: (key: string) =>
      apiFetch<{ ok: boolean; key: string; found: boolean }>(
        `/api/settings/credentials/${key}`,
        { method: "DELETE" }
      ),
  },

  // -------------------------------------------------------------------------
  // Telegram Notifications
  // -------------------------------------------------------------------------
  telegram: {
    status: () => apiFetch<{connected: boolean; username: string | null; configured: boolean; webhook_url?: string}>("/api/telegram/status"),
    connect: () => apiFetch<{bot_link: string; code: string; configured: boolean}>("/api/telegram/connect", { method: "POST" }),
    test: () => apiFetch<{sent: boolean}>("/api/telegram/test", { method: "POST" }),
    disconnect: () => apiFetch<{disconnected: boolean}>("/api/telegram/disconnect", { method: "DELETE" }),
    setupWebhook: (backendUrl?: string) =>
      apiFetch<{ok: boolean; webhook_url: string; description: string}>("/api/telegram/setup-webhook", {
        method: "POST",
        headers: backendUrl ? { "X-Backend-Url": backendUrl } : {},
      }),
  },

  // -------------------------------------------------------------------------
  // Brokers
  // -------------------------------------------------------------------------
  brokers: {
    /** Status aller Broker (configured / not_set / oauth_pending) */
    status: () =>
      apiFetch<Record<string, {
        status: string;
        api_type: string;
        phase: number;
        note?: string;
        requires?: string;
        route?: string;
      }>>("/api/brokers/status"),

    /** Aggregiertes Portfolio über alle Broker */
    summary: () =>
      apiFetch<{
        total_portfolio_value: number;
        total_broker_value: number;
        total_p2p_invested: number;
        currency: string;
        brokers: BrokerPortfolioData[];
        p2p: BrokerPortfolioData[];
        fetched_at: string;
      }>("/api/brokers/summary"),

    bitpanda: () =>
      apiFetch<BrokerPortfolioData>("/api/brokers/bitpanda"),
    bitpandaTransactions: (limit = 50) =>
      apiFetch<BrokerTransaction[]>(`/api/brokers/bitpanda/transactions?limit=${limit}`),

    comdirect: () =>
      apiFetch<BrokerPortfolioData>("/api/brokers/comdirect"),
    comdirectTransactions: (limit = 50, depotId?: string) =>
      apiFetch<BrokerTransaction[]>(
        `/api/brokers/comdirect/transactions?limit=${limit}${depotId ? `&depot_id=${depotId}` : ""}`
      ),
    comdirectOauthInitiate: () =>
      apiFetch<{ success: boolean; onetime_token?: string; next_step?: string; error?: string; setup_url?: string }>(
        "/api/brokers/comdirect/oauth/initiate",
        { method: "POST" }
      ),
    comdirectOauthRefresh: () =>
      apiFetch<{ success: boolean; message?: string; expires_in?: number; token_rotated?: boolean; error?: string; action?: string }>(
        "/api/brokers/comdirect/oauth/refresh",
        { method: "POST" }
      ),

    degiro: () =>
      apiFetch<BrokerPortfolioData>("/api/brokers/degiro"),

    flatexAccount: () =>
      apiFetch<BrokerPortfolioData>("/api/brokers/flatex/account"),
    flatexSync: (pin: string, iban?: string) =>
      apiFetch<BrokerPortfolioData>("/api/brokers/flatex/sync", {
        method: "POST",
        body: JSON.stringify({ pin, ...(iban ? { iban } : {}) }),
      }),
    flatexImportCsv: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      const token = getAuthToken();
      const csrf = getCsrfToken();
      return fetch(`${API_BASE}/api/brokers/flatex/import-csv`, {
        method: "POST",
        credentials: "include",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(csrf ? { "X-CSRF-Token": csrf } : {}),
        },
        body: form,
      }).then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<BrokerPortfolioData>;
      });
    },

    crowdestor: () =>
      apiFetch<BrokerPortfolioData>("/api/brokers/crowdestor"),

    tradeRepublic: () =>
      apiFetch<BrokerPortfolioData>("/api/brokers/trade-republic"),

    whSelfinvest: () =>
      apiFetch<BrokerPortfolioData>("/api/brokers/wh-selfinvest"),
  },

  // -------------------------------------------------------------------------
  // Portfolio Management (named portfolios CRUD)
  // -------------------------------------------------------------------------
  portfolios: {
    list: () => apiFetch<Array<{
      id: number; name: string; portfolio_type: string; category: string;
      currency: string; color: string; is_default: boolean;
      description: string | null; created_at: string;
    }>>("/api/portfolios/"),
    create: (body: { name: string; portfolio_type?: string; category?: string; currency?: string; color?: string; description?: string }) =>
      apiFetch<{ id: number; name: string; portfolio_type: string; category: string; currency: string; color: string; is_default: boolean; description: string | null; created_at: string }>(
        "/api/portfolios/", { method: "POST", body: JSON.stringify(body) }
      ),
    update: (id: number, body: { name?: string; portfolio_type?: string; category?: string; currency?: string; color?: string; description?: string }) =>
      apiFetch<{ id: number; name: string; portfolio_type: string; category: string; currency: string; color: string; is_default: boolean; description: string | null; created_at: string }>(
        `/api/portfolios/${id}`, { method: "PATCH", body: JSON.stringify(body) }
      ),
    delete: (id: number) => apiFetch<void>(`/api/portfolios/${id}`, { method: "DELETE" }),
    setDefault: (id: number) =>
      apiFetch<{ id: number; name: string; is_default: boolean }>(`/api/portfolios/${id}/default`, { method: "POST" }),
  },

  // -------------------------------------------------------------------------
  // Learning (YouTube insights, trade learnings, jobs)
  // -------------------------------------------------------------------------
  learning: {
    stats: () => apiFetch<{
      youtube_insights_total: number; trade_learnings_total: number;
      learning_jobs_total: number;
      top_performing_patterns: Array<{ ticker: string; direction: string; win_rate: number; sample_count: number; avg_return_pct: number }>;
    }>("/api/learning/stats"),
    youtubeInsights: (limit = 20, strategy?: string, assetClass?: string) => {
      const qs = new URLSearchParams({ limit: String(limit) });
      if (strategy) qs.set("strategy", strategy);
      if (assetClass) qs.set("asset_class", assetClass);
      return apiFetch<Array<{
        id: number; video_id: string; video_title: string; channel: string;
        insight_text: string; strategy: string; timeframe: string; market_condition: string;
        asset_class: string; confidence_score: number; times_validated: number;
        times_invalidated: number; youtube_url: string; created_at: string;
      }>>(`/api/learning/youtube/insights?${qs}`);
    },
    tradeLearnings: (limit = 30) =>
      apiFetch<Array<{
        id: number; ticker: string; direction: string; learning_text: string;
        win_rate: number | null; sample_count: number; avg_return_pct: number | null;
        created_at: string; last_updated: string;
      }>>(`/api/learning/trade-learnings?limit=${limit}`),
    jobs: (limit = 15) =>
      apiFetch<Array<{
        id: number; job_type: string; status: string; started_at: string | null;
        finished_at: string | null; items_processed: number; error: string | null; created_at: string;
      }>>(`/api/learning/jobs?limit=${limit}`),
    processYoutube: (videoUrl: string) =>
      apiFetch<{ job_id: number; video_id: string; status: string }>(
        "/api/learning/youtube/process", { method: "POST", body: JSON.stringify({ video_url: videoUrl }) }
      ),
    triggerJob: (jobType: string, videoIds?: string[]) =>
      apiFetch<{ triggered: boolean; job_type: string }>(
        "/api/learning/jobs/trigger",
        { method: "POST", body: JSON.stringify({ job_type: jobType, ...(videoIds ? { video_ids: videoIds } : {}) }) }
      ),
    job: (id: number) =>
      apiFetch<{
        id: number; job_type: string; status: string; started_at: string | null;
        finished_at: string | null; items_processed: number; error: string | null; created_at: string;
      }>(`/api/learning/jobs/${id}`),
    context: (ticker: string, query?: string, topN?: number) => {
      const qs = new URLSearchParams({ ticker });
      if (query) qs.set("query", query);
      if (topN != null) qs.set("top_n", String(topN));
      return apiFetch<{
        ticker: string; query: string; context: string; has_context: boolean; context_length: number;
      }>(`/api/learning/context?${qs}`);
    },
    insightsStats: (sortBy: "confidence" | "win_rate" | "usage" = "confidence", limit = 10) =>
      apiFetch<Array<{
        id: number;
        insight_text: string;
        confidence_score: number;
        times_validated: number;
        times_invalidated: number;
        usage_count: number;
        win_rate: number | null;
        avg_return_pct: number | null;
        strategy: string | null;
        created_at: string;
      }>>(`/api/learning/insights/stats?sort_by=${sortBy}&limit=${limit}`),
  },

  // -------------------------------------------------------------------------
  // Bank / FinTS connections
  // -------------------------------------------------------------------------
  bank: {
    connections: () => apiFetch<Array<{
      id: number; owner_username: string | null; bank_name: string;
      blz: string; username: string; account_iban: string | null;
      portfolio_id: number | null; last_synced: string | null;
      last_balance: number | null; currency: string; created_at: string;
    }>>("/api/bank/connections"),
    addConnection: (body: { bank_name: string; blz: string; username: string; account_iban?: string; portfolio_id?: number; currency?: string }) =>
      apiFetch<{
        id: number; owner_username: string | null; bank_name: string;
        blz: string; username: string; account_iban: string | null;
        portfolio_id: number | null; last_synced: string | null;
        last_balance: number | null; currency: string; created_at: string;
      }>("/api/bank/connections", { method: "POST", body: JSON.stringify(body) }),
    sync: (body: { blz: string; username: string; pin: string; fints_url?: string; iban?: string }) =>
      apiFetch<{
        bank_name: string; blz: string; account_iban: string | null;
        balance: number; currency: string;
        holdings: Array<{ isin: string | null; name: string; quantity: number; price: number; currency: string; value_eur: number }>;
        holdings_total_eur: number; fetched_at: string; is_demo: boolean; error: string | null;
      }>("/api/bank/sync", { method: "POST", body: JSON.stringify(body) }),
    deleteConnection: (id: number) =>
      apiFetch<void>(`/api/bank/connections/${id}`, { method: "DELETE" }),
    knownBanks: () =>
      apiFetch<Array<{ blz: string; name: string; fints_url: string }>>("/api/bank/known-banks"),
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
    invoices: () =>
      apiFetch<{
        invoices: Array<{
          id: string; number: string | null; date: string;
          amount_eur: number; status: string;
          pdf_url: string | null; hosted_url: string | null;
        }>;
      }>("/api/billing/invoices"),
  },

  // -------------------------------------------------------------------------
  // Admin (requires role=admin)
  // -------------------------------------------------------------------------
  admin: {
    users: () => apiFetch<Array<{
      username: string; email: string; tier: string; role: string;
      is_active: boolean; created_at: string; signals_today: number;
      last_signal_at: string | null; referred_by: string | null;
      referral_count: number; email_unsubscribed: boolean;
    }>>("/api/admin/users"),

    updateUser: (username: string, body: { tier?: string; is_active?: boolean }) =>
      apiFetch<{ username: string; tier: string; is_active: boolean; message: string }>(
        `/api/admin/users/${encodeURIComponent(username)}`,
        { method: "PATCH", body: JSON.stringify(body) },
      ),

    growthStats: () => apiFetch<{
      days: Array<{ date: string; signups: number; signals: number }>;
      total_signups_7d: number;
      total_signals_7d: number;
    }>("/api/admin/stats/growth"),

    sendUpgradeEmail: (username: string) =>
      apiFetch<{ sent: boolean; message: string }>(
        `/api/admin/users/${encodeURIComponent(username)}/send-upgrade-email`,
        { method: "POST" },
      ),

    sendReengagementEmail: (username: string) =>
      apiFetch<{ sent: boolean; message: string }>(
        `/api/admin/users/${encodeURIComponent(username)}/send-reengagement-email`,
        { method: "POST" },
      ),

    bulkUpgradeEmail: () =>
      apiFetch<{ sent: number; skipped: number; failed: number; message: string }>(
        "/api/admin/bulk-upgrade-email", { method: "POST" },
      ),

    bulkReengagementEmail: () =>
      apiFetch<{ sent: number; skipped: number; failed: number; message: string }>(
        "/api/admin/bulk-reengagement-email", { method: "POST" },
      ),

    sendWeeklyDigest: () =>
      apiFetch<{ sent: number; skipped: number; failed: number; message: string }>(
        "/api/admin/send-weekly-digest", { method: "POST" },
      ),

    triggerActivationFollowup: () =>
      apiFetch<{ sent: number; skipped: number; failed: number; message: string }>(
        "/api/admin/trigger-activation-followup", { method: "POST" },
      ),

    triggerDailySignalEmail: () =>
      apiFetch<{ sent: number; skipped: number; failed: number; message: string }>(
        "/api/admin/trigger-daily-signal-email", { method: "POST" },
      ),

    testSmtp: (to: string) =>
      apiFetch<{ sent: boolean; message: string; smtp_host: string; smtp_configured: boolean }>(
        `/api/admin/test-smtp?to=${encodeURIComponent(to)}`, { method: "POST" },
      ),

    inviteWaitlist: () =>
      apiFetch<{ invited: number; skipped: number; failed: number; message: string }>(
        "/api/admin/invite-waitlist", { method: "POST" },
      ),
  },
};
