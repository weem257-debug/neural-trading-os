"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Key, TrendingUp, Bell, Info, Save, Eye, EyeOff,
  CheckCircle, AlertTriangle, Plus, Trash2, Webhook,
  Play, Loader2, Activity, Landmark, Building,
} from "lucide-react";
import { GlassCard, SectionLabel } from "@/components/ui/GlassCard";
import { api, API_BASE } from "@/lib/api";
import type { PriceAlertRecord, WebhookRecord, RepoPathEntry, ApiMetricsResponse } from "@/types";

const WEBHOOK_EVENT_OPTIONS = [
  { value: "signal.generated", label: "Signal Generated" },
  { value: "alert.fired",      label: "Alert Fired" },
  { value: "order.filled",     label: "Order Filled" },
  { value: "risk.alert",       label: "Risk Alert" },
];

type AlertCondition = PriceAlertRecord["condition"];

// ---------------------------------------------------------------------------
// Price Alerts Section Component
// ---------------------------------------------------------------------------

function PriceAlertsSection() {
  const [alerts, setAlerts] = useState<PriceAlertRecord[]>([]);
  const [ticker, setTicker] = useState("");
  const [condition, setCondition] = useState<AlertCondition>("above");
  const [threshold, setThreshold] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAlerts = useCallback(async () => {
    try {
      const data = await api.priceAlerts.list();
      setAlerts(data);
    } catch {
      // silently ignore
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  async function handleCreate() {
    if (!ticker.trim() || !threshold) return;
    const parsed = parseFloat(threshold);
    if (isNaN(parsed)) { setError("Threshold must be a number"); return; }
    setError(null);
    setLoading(true);
    try {
      await api.priceAlerts.create({
        ticker: ticker.trim().toUpperCase(),
        condition,
        threshold: parsed,
      });
      setTicker("");
      setThreshold("");
      await fetchAlerts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create alert");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(alert_id: string) {
    try {
      await api.priceAlerts.delete(alert_id);
      await fetchAlerts();
    } catch {
      // silently ignore
    }
  }

  const conditionLabel: Record<AlertCondition, string> = {
    above: "Price above",
    below: "Price below",
    change_pct: "Change % >=",
  };

  return (
    <GlassCard variant="cyan" delay={0.18}>
      <div
        className="-m-4 mb-4 px-4 py-3 rounded-t-xl"
        style={{ background: "rgba(255,170,0,0.06)", borderBottom: "1px solid rgba(255,170,0,0.1)" }}
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400" aria-hidden="true" />
          <SectionLabel>Price Alerts</SectionLabel>
        </div>
      </div>

      {/* Create form */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <input
          type="text"
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
          placeholder="Ticker (e.g. AAPL)"
          maxLength={10}
          className="flex-1 rounded-xl px-3 py-2 text-sm font-mono text-slate-200 placeholder-slate-600 outline-none"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,170,0,0.2)" }}
        />
        <select
          value={condition}
          onChange={(e) => setCondition(e.target.value as AlertCondition)}
          className="rounded-xl px-3 py-2 text-sm text-slate-200 outline-none"
          style={{ background: "rgba(30,30,40,0.95)", border: "1px solid rgba(255,170,0,0.2)" }}
        >
          <option value="above">above</option>
          <option value="below">below</option>
          <option value="change_pct">change %</option>
        </select>
        <input
          type="number"
          value={threshold}
          onChange={(e) => setThreshold(e.target.value)}
          placeholder="Threshold"
          className="w-32 rounded-xl px-3 py-2 text-sm font-mono text-slate-200 placeholder-slate-600 outline-none"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,170,0,0.2)" }}
        />
        <button
          onClick={handleCreate}
          disabled={loading || !ticker.trim() || !threshold}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-40"
          style={{
            background: "rgba(255,170,0,0.15)",
            border: "1px solid rgba(255,170,0,0.35)",
            color: "#FFAA00",
          }}
        >
          <Plus className="w-4 h-4" />
          Add
        </button>
      </div>

      {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

      {/* Alerts list */}
      {alerts.length === 0 ? (
        <p className="text-xs text-slate-600 text-center py-4">No alerts configured.</p>
      ) : (
        <div className="space-y-2">
          {alerts.map((a) => (
            <div
              key={a.alert_id}
              className="flex items-center justify-between px-3 py-2 rounded-xl text-sm"
              style={{
                background: a.status === "fired" ? "rgba(255,170,0,0.08)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${a.status === "fired" ? "rgba(255,170,0,0.3)" : "rgba(255,255,255,0.06)"}`,
              }}
            >
              <div className="flex items-center gap-3">
                <span className="font-mono font-bold text-slate-200">{a.ticker}</span>
                <span className="text-slate-500">{conditionLabel[a.condition]}</span>
                <span className="font-mono text-amber-400">{a.threshold}</span>
                {a.status === "fired" && (
                  <span className="text-xs text-amber-300 bg-amber-900/30 px-2 py-0.5 rounded-full">
                    Fired @ {a.fired_price?.toFixed(2)}
                  </span>
                )}
              </div>
              <button
                onClick={() => handleDelete(a.alert_id)}
                aria-label={`Delete alert for ${a.ticker}`}
                className="text-slate-600 hover:text-red-400 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  );
}

// ---------------------------------------------------------------------------
// Engine Status Section Component
// ---------------------------------------------------------------------------

const REPO_LABELS: Record<string, string> = {
  tradingagents:     "TradingAgents",
  ai_trader:         "AI-Trader",
  daily_analysis:    "daily_stock_analysis",
  vibe_trading:      "Vibe-Trading",
  qlib:              "qlib",
  nautilus:          "nautilus_trader",
  fingpt:            "FinGPT",
  finrobot:          "FinRobot",
  jesse:             "Jesse",
};

function EngineStatusSection() {
  const [repos, setRepos] = useState<Record<string, RepoPathEntry> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.health.repoPaths()
      .then(setRepos)
      .catch(() => setRepos(null))
      .finally(() => setLoading(false));
  }, []);

  const entries = repos ? Object.entries(repos) : [];
  const installedCount = entries.filter(([, e]) => e.exists).length;

  return (
    <GlassCard delay={0.15}>
      <div className="-m-4 mb-4 px-4 py-3 rounded-t-xl" style={{ background: "rgba(0,212,255,0.04)", borderBottom: "1px solid rgba(0,212,255,0.08)" }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-cyan-400" aria-hidden="true" />
            <SectionLabel>AI Engine Status</SectionLabel>
          </div>
          {!loading && repos && (
            <span className="text-xs font-mono" style={{ color: installedCount === entries.length ? "#00FF88" : "#FFD700" }}>
              {installedCount}/{entries.length} installed
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
        </div>
      ) : repos ? (
        <div className="grid grid-cols-1 gap-2">
          {entries.map(([key, entry]) => (
            <div
              key={key}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
              style={{
                background: entry.exists ? "rgba(0,255,136,0.04)" : "rgba(255,255,255,0.02)",
                border: `1px solid ${entry.exists ? "rgba(0,255,136,0.15)" : "rgba(255,255,255,0.06)"}`,
              }}
            >
              {entry.exists ? (
                <CheckCircle className="w-4 h-4 flex-shrink-0" style={{ color: "#00FF88" }} />
              ) : (
                <AlertTriangle className="w-4 h-4 flex-shrink-0 text-slate-600" />
              )}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold ${entry.exists ? "text-slate-200" : "text-slate-500"}`}>
                  {REPO_LABELS[key] ?? key}
                </p>
                <p className="text-xs font-mono truncate" style={{ color: entry.exists ? "rgba(0,255,136,0.5)" : "rgba(100,116,139,0.5)" }}>
                  {entry.path}
                </p>
              </div>
              <span
                className="flex-shrink-0 text-xs font-bold px-2 py-0.5 rounded-full"
                style={{
                  background: entry.exists ? "rgba(0,255,136,0.12)" : "rgba(100,116,139,0.1)",
                  color: entry.exists ? "#00FF88" : "#475569",
                  border: `1px solid ${entry.exists ? "rgba(0,255,136,0.25)" : "rgba(100,116,139,0.15)"}`,
                }}
              >
                {entry.exists ? "READY" : "MISSING"}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-500 text-center py-4">Could not load engine status — backend offline?</p>
      )}
    </GlassCard>
  );
}

// ---------------------------------------------------------------------------
// System Metrics Section Component
// ---------------------------------------------------------------------------

function SystemMetricsSection() {
  const [metrics, setMetrics] = useState<ApiMetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMetrics = useCallback(async () => {
    try {
      const data = await api.health.metrics();
      setMetrics(data);
    } catch {
      // silently ignore — backend may be offline
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMetrics();
    const id = setInterval(fetchMetrics, 30_000);
    return () => clearInterval(id);
  }, [fetchMetrics]);

  function fmtUptime(seconds: number) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  const metricItems: { label: string; value: string; highlight?: boolean }[] = metrics
    ? [
        { label: "Requests Total",       value: metrics.requests_total.toLocaleString() },
        { label: "Avg Response",         value: `${metrics.avg_response_ms.toFixed(1)} ms` },
        { label: "WS Connections",       value: String(metrics.ws_connections_active), highlight: metrics.ws_connections_active > 0 },
        { label: "Signals Today",        value: String(metrics.signals_generated_today), highlight: metrics.signals_generated_today > 0 },
        { label: "DB Size",              value: `${metrics.db_size_kb.toFixed(0)} KB` },
        { label: "Uptime",               value: fmtUptime(metrics.uptime_seconds), highlight: true },
      ]
    : [];

  return (
    <GlassCard delay={0.18}>
      <div className="-m-4 mb-4 px-4 py-3 rounded-t-xl" style={{ background: "rgba(0,212,255,0.04)", borderBottom: "1px solid rgba(0,212,255,0.08)" }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-400" aria-hidden="true" />
            <SectionLabel>System Metrics</SectionLabel>
          </div>
          {metrics && (
            <span className="text-xs font-mono text-slate-600">
              {new Date(metrics.measured_at).toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
        </div>
      ) : metrics ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {metricItems.map(({ label, value, highlight }) => (
            <div
              key={label}
              className="px-3 py-2.5 rounded-xl"
              style={{
                background: highlight ? "rgba(0,255,136,0.04)" : "rgba(255,255,255,0.02)",
                border: `1px solid ${highlight ? "rgba(0,255,136,0.12)" : "rgba(255,255,255,0.06)"}`,
              }}
            >
              <p className="text-xs text-slate-600 mb-0.5">{label}</p>
              <p
                className="text-sm font-mono font-semibold"
                style={{ color: highlight ? "#00FF88" : "#CBD5E1" }}
              >
                {value}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-500 text-center py-4">
          Metrics unavailable — backend offline?
        </p>
      )}
    </GlassCard>
  );
}

// ---------------------------------------------------------------------------
// Webhooks Section Component
// ---------------------------------------------------------------------------

function WebhooksSection() {
  const [webhooks, setWebhooks] = useState<WebhookRecord[]>([]);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>(["signal.generated"]);
  const [loading, setLoading] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; success: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchWebhooks = useCallback(async () => {
    try {
      const data = await api.webhooks.list();
      setWebhooks(data);
    } catch {
      // silently ignore
    }
  }, []);

  useEffect(() => { fetchWebhooks(); }, [fetchWebhooks]);

  async function handleCreate() {
    if (!url.trim() || events.length === 0) return;
    setError(null);
    setLoading(true);
    try {
      await api.webhooks.create({ url: url.trim(), events });
      setUrl("");
      await fetchWebhooks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create webhook");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.webhooks.delete(id);
      await fetchWebhooks();
    } catch { /* ignore */ }
  }

  async function handleTest(id: string) {
    setTestingId(id);
    setTestResult(null);
    try {
      const result = await api.webhooks.test(id);
      setTestResult({ id, success: result.success });
      setTimeout(() => setTestResult(null), 3000);
    } catch {
      setTestResult({ id, success: false });
      setTimeout(() => setTestResult(null), 3000);
    } finally {
      setTestingId(null);
    }
  }

  function toggleEvent(ev: string) {
    setEvents((prev) => prev.includes(ev) ? prev.filter((e) => e !== ev) : [...prev, ev]);
  }

  return (
    <GlassCard delay={0.22}>
      <div
        className="-m-4 mb-4 px-4 py-3 rounded-t-xl"
        style={{ background: "rgba(123,47,255,0.06)", borderBottom: "1px solid rgba(123,47,255,0.1)" }}
      >
        <div className="flex items-center gap-2">
          <Webhook className="w-4 h-4 text-neon-purple" aria-hidden="true" />
          <SectionLabel>Outbound Webhooks</SectionLabel>
        </div>
      </div>

      {/* Create form */}
      <div className="space-y-3 mb-4">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://your-endpoint.com/hook"
          className="w-full rounded-xl px-3 py-2 text-sm font-mono text-slate-200 placeholder-slate-600 outline-none"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(123,47,255,0.2)" }}
        />
        <div className="flex flex-wrap gap-2">
          {WEBHOOK_EVENT_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => toggleEvent(value)}
              className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
              style={{
                background: events.includes(value) ? "rgba(123,47,255,0.2)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${events.includes(value) ? "rgba(123,47,255,0.5)" : "rgba(255,255,255,0.08)"}`,
                color: events.includes(value) ? "#A78BFA" : "#64748B",
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          onClick={handleCreate}
          disabled={loading || !url.trim() || events.length === 0}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-40"
          style={{
            background: "rgba(123,47,255,0.15)",
            border: "1px solid rgba(123,47,255,0.35)",
            color: "#A78BFA",
          }}
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Register
        </button>
      </div>

      {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

      {/* Webhook list */}
      {webhooks.length === 0 ? (
        <p className="text-xs text-slate-600 text-center py-4">No webhooks registered.</p>
      ) : (
        <div className="space-y-2">
          {webhooks.map((wh) => {
            const isTestingThis = testingId === wh.id;
            const result = testResult?.id === wh.id ? testResult : null;
            return (
              <div
                key={wh.id}
                className="flex items-start justify-between p-3 rounded-xl text-sm"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(123,47,255,0.12)" }}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-slate-300 text-xs truncate">{wh.url}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {wh.events.map((ev) => (
                      <span key={ev} className="text-xs px-1.5 py-0.5 rounded text-purple-300"
                        style={{ background: "rgba(123,47,255,0.15)", fontSize: "10px" }}>
                        {ev}
                      </span>
                    ))}
                  </div>
                  {wh.delivery_failures > 0 && (
                    <p className="text-xs text-red-400 mt-1">{wh.delivery_failures} delivery failure(s)</p>
                  )}
                  {result && (
                    <p className={`text-xs mt-1 ${result.success ? "text-green-400" : "text-red-400"}`}>
                      {result.success ? "Test delivered successfully" : "Test delivery failed"}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                  <button
                    onClick={() => handleTest(wh.id)}
                    disabled={isTestingThis}
                    aria-label="Test webhook"
                    className="text-slate-500 hover:text-purple-400 transition-colors disabled:opacity-40"
                  >
                    {isTestingThis
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Play className="w-4 h-4" />
                    }
                  </button>
                  <button
                    onClick={() => handleDelete(wh.id)}
                    aria-label="Delete webhook"
                    className="text-slate-600 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </GlassCard>
  );
}

// ---------------------------------------------------------------------------
// SettingsState
// ---------------------------------------------------------------------------

interface SettingsState {
  anthropicApiKey: string;
  alpacaKey: string;
  alpacaSecret: string;
  watchlist: string;
  refreshInterval: "10" | "30" | "60";
  tradingMode: "paper" | "live";
  riskAlerts: boolean;
  signalNotifications: boolean;
  priceAlerts: boolean;
}

const STORAGE_KEY = "neural_trading_settings";

const DEFAULT_SETTINGS: SettingsState = {
  anthropicApiKey: "",
  alpacaKey: "",
  alpacaSecret: "",
  watchlist: "AAPL,MSFT,NVDA,TSLA,BTC-USD",
  refreshInterval: "10",
  tradingMode: "paper",
  riskAlerts: true,
  signalNotifications: true,
  priceAlerts: false,
};

function loadSettings(): SettingsState {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MaskedInput({
  label,
  value,
  onChange,
  placeholder,
  id,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  id: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <label htmlFor={id} className="text-xs text-slate-400 mb-1.5 block font-medium">
        {label}
        <span className="ml-2 text-slate-600 font-normal">(stored in localStorage — not sent to server)</span>
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? "Enter key..."}
          autoComplete="off"
          className="w-full rounded-xl px-4 py-2.5 pr-12 text-sm font-mono text-slate-200 placeholder-slate-600 outline-none transition-all"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(0,212,255,0.15)",
          }}
          onFocus={(e) => { e.target.style.borderColor = "rgba(0,212,255,0.4)"; e.target.style.boxShadow = "0 0 12px rgba(0,212,255,0.1)"; }}
          onBlur={(e) => { e.target.style.borderColor = "rgba(0,212,255,0.15)"; e.target.style.boxShadow = "none"; }}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide key" : "Show key"}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
        >
          {visible
            ? <EyeOff className="w-4 h-4" aria-hidden="true" />
            : <Eye className="w-4 h-4" aria-hidden="true" />
          }
        </button>
      </div>
    </div>
  );
}

function Toggle({
  id,
  label,
  description,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div>
        <label htmlFor={id} className="text-sm text-slate-300 font-medium cursor-pointer">{label}</label>
        {description && <p className="text-xs text-slate-600 mt-0.5">{description}</p>}
      </div>
      <button
        id={id}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onChange(!checked); } }}
        tabIndex={0}
        className="relative flex-shrink-0 w-11 h-6 rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
        style={{
          background: checked ? "rgba(0,212,255,0.4)" : "rgba(255,255,255,0.08)",
          border: checked ? "1px solid rgba(0,212,255,0.6)" : "1px solid rgba(255,255,255,0.12)",
        }}
      >
        <span
          className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform duration-200"
          style={{ transform: checked ? "translateX(20px)" : "translateX(0)" }}
        />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsState>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);
  const [backendKeyStatus, setBackendKeyStatus] = useState<"loading" | "configured" | "missing">("loading");

  useEffect(() => {
    setSettings(loadSettings());
    api.health.check()
      .then((h) => {
        const status = h.services?.["ANTHROPIC_API_KEY"] ?? "";
        setBackendKeyStatus(status === "configured" ? "configured" : "missing");
      })
      .catch(() => setBackendKeyStatus("missing"));
  }, []);

  function update<K extends keyof SettingsState>(key: K, value: SettingsState[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  async function handleTradingModeChange(mode: "paper" | "live") {
    update("tradingMode", mode);
    try {
      await api.execution.setMode(mode);
    } catch {
      // Best-effort — localStorage state preserved even if backend call fails
    }
  }

  function handleSave() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  const sectionHeaderStyle = {
    background: "rgba(0,212,255,0.06)",
    borderBottom: "1px solid rgba(0,212,255,0.1)",
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <h1 className="text-2xl font-bold text-slate-100 mb-1">Settings</h1>
        <p className="text-sm text-slate-500">
          Configure API keys, trading preferences and notifications.
          All values persist in your browser&apos;s localStorage.
        </p>
      </motion.div>

      {/* ── Section 1: API Configuration ── */}
      <GlassCard variant="cyan" delay={0.05}>
        <div className="-m-4 mb-4 px-4 py-3 rounded-t-xl" style={sectionHeaderStyle}>
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-cyan-400" aria-hidden="true" />
            <SectionLabel>API Configuration</SectionLabel>
          </div>
        </div>

        <div className="space-y-4">
          {/* Backend API-Key status banner */}
          <div
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
            style={{
              background: backendKeyStatus === "configured" ? "rgba(0,255,136,0.06)" : "rgba(255,165,0,0.06)",
              border: `1px solid ${backendKeyStatus === "configured" ? "rgba(0,255,136,0.2)" : "rgba(255,165,0,0.25)"}`,
            }}
          >
            {backendKeyStatus === "loading" ? (
              <Loader2 className="w-4 h-4 animate-spin text-slate-500 flex-shrink-0" />
            ) : backendKeyStatus === "configured" ? (
              <CheckCircle className="w-4 h-4 flex-shrink-0" style={{ color: "#00FF88" }} />
            ) : (
              <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-400" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold" style={{ color: backendKeyStatus === "configured" ? "#00FF88" : "#fbbf24" }}>
                Backend ANTHROPIC_API_KEY:{" "}
                {backendKeyStatus === "loading" ? "prüfe..." : backendKeyStatus === "configured" ? "konfiguriert ✓" : "nicht gesetzt"}
              </p>
              {backendKeyStatus === "missing" && (
                <p className="text-xs text-slate-500 mt-0.5">
                  Setze <code className="text-amber-300 bg-amber-900/20 px-1 rounded">ANTHROPIC_API_KEY=sk-ant-...</code> in{" "}
                  <code className="text-slate-400 bg-white/5 px-1 rounded">dashboard/backend/.env</code> und starte das Backend neu.
                </p>
              )}
            </div>
          </div>

          <MaskedInput
            id="anthropic-key"
            label="Anthropic API Key (Referenz)"
            value={settings.anthropicApiKey}
            onChange={(v) => update("anthropicApiKey", v)}
            placeholder="sk-ant-..."
          />
          <MaskedInput
            id="alpaca-key"
            label="Alpaca API Key"
            value={settings.alpacaKey}
            onChange={(v) => update("alpacaKey", v)}
            placeholder="PK..."
          />
          <MaskedInput
            id="alpaca-secret"
            label="Alpaca Secret Key"
            value={settings.alpacaSecret}
            onChange={(v) => update("alpacaSecret", v)}
            placeholder="Secret..."
          />
          <p className="text-xs text-slate-600 pt-1">
            Keys hier sind nur Referenz in localStorage. API-Calls nutzen die Server-seitigen .env-Variablen.
          </p>
        </div>
      </GlassCard>

      {/* ── Section 2: Trading Preferences ── */}
      <GlassCard variant="green" delay={0.1}>
        <div className="-m-4 mb-4 px-4 py-3 rounded-t-xl" style={{ ...sectionHeaderStyle, background: "rgba(0,255,136,0.06)", borderBottomColor: "rgba(0,255,136,0.1)" }}>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-neon-green" aria-hidden="true" />
            <SectionLabel>Trading Preferences</SectionLabel>
          </div>
        </div>

        <div className="space-y-5">
          {/* Watchlist */}
          <div>
            <label htmlFor="watchlist" className="text-xs text-slate-400 mb-1.5 block font-medium">
              Default Watchlist
              <span className="ml-2 text-slate-600 font-normal">comma-separated tickers</span>
            </label>
            <input
              id="watchlist"
              type="text"
              value={settings.watchlist}
              onChange={(e) => update("watchlist", e.target.value)}
              placeholder="AAPL,MSFT,NVDA,TSLA,BTC-USD"
              className="w-full rounded-xl px-4 py-2.5 text-sm font-mono text-slate-200 placeholder-slate-600 outline-none transition-all"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(0,255,136,0.15)" }}
              onFocus={(e) => { e.target.style.borderColor = "rgba(0,255,136,0.4)"; }}
              onBlur={(e) => { e.target.style.borderColor = "rgba(0,255,136,0.15)"; }}
            />
          </div>

          {/* Refresh interval */}
          <div>
            <p className="text-xs text-slate-400 mb-2 font-medium">Refresh Interval</p>
            <div className="flex gap-2" role="group" aria-label="Refresh interval">
              {(["10", "30", "60"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => update("refreshInterval", v)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") update("refreshInterval", v); }}
                  aria-pressed={settings.refreshInterval === v}
                  className="flex-1 py-2 rounded-xl text-sm font-semibold transition-all"
                  style={{
                    background: settings.refreshInterval === v ? "rgba(0,255,136,0.15)" : "rgba(255,255,255,0.04)",
                    border: `1px solid ${settings.refreshInterval === v ? "rgba(0,255,136,0.4)" : "rgba(255,255,255,0.08)"}`,
                    color: settings.refreshInterval === v ? "#00FF88" : "#64748B",
                  }}
                >
                  {v}s
                </button>
              ))}
            </div>
          </div>

          {/* Paper / Live toggle */}
          <div>
            <p className="text-xs text-slate-400 mb-2 font-medium">Trading Mode</p>
            <div className="flex gap-2" role="group" aria-label="Trading mode">
              {(["paper", "live"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => handleTradingModeChange(mode)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleTradingModeChange(mode); }}
                  aria-pressed={settings.tradingMode === mode}
                  className="flex-1 py-2 rounded-xl text-sm font-semibold capitalize transition-all"
                  style={{
                    background: settings.tradingMode === mode
                      ? mode === "paper" ? "rgba(0,212,255,0.15)" : "rgba(255,0,128,0.15)"
                      : "rgba(255,255,255,0.04)",
                    border: `1px solid ${settings.tradingMode === mode
                      ? mode === "paper" ? "rgba(0,212,255,0.4)" : "rgba(255,0,128,0.4)"
                      : "rgba(255,255,255,0.08)"}`,
                    color: settings.tradingMode === mode
                      ? mode === "paper" ? "#00D4FF" : "#FF0080"
                      : "#64748B",
                  }}
                >
                  {mode === "paper" ? "Paper (Sim)" : "Live Trading"}
                </button>
              ))}
            </div>
            {settings.tradingMode === "live" && (
              <p className="text-xs text-amber-500 mt-2">
                Live mode requires a valid Alpaca API key and ENABLE_LIVE_TRADING=true in server .env.
              </p>
            )}
          </div>
        </div>
      </GlassCard>

      {/* ── Section 3: Notifications ── */}
      <GlassCard variant="purple" delay={0.15}>
        <div className="-m-4 mb-4 px-4 py-3 rounded-t-xl" style={{ ...sectionHeaderStyle, background: "rgba(123,47,255,0.06)", borderBottomColor: "rgba(123,47,255,0.1)" }}>
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-neon-purple" aria-hidden="true" />
            <SectionLabel>Notifications</SectionLabel>
          </div>
        </div>

        <div className="divide-y divide-white/5">
          <Toggle
            id="risk-alerts"
            label="Risk Alerts"
            description="Notify when portfolio VaR or drawdown exceeds thresholds"
            checked={settings.riskAlerts}
            onChange={(v) => update("riskAlerts", v)}
          />
          <Toggle
            id="signal-notifications"
            label="Signal Notifications"
            description="Notify on new Buy / Strong Buy signals"
            checked={settings.signalNotifications}
            onChange={(v) => update("signalNotifications", v)}
          />
          <Toggle
            id="price-alerts"
            label="Price Alerts"
            description="Notify on significant price moves in watchlist"
            checked={settings.priceAlerts}
            onChange={(v) => update("priceAlerts", v)}
          />
        </div>
      </GlassCard>

      {/* ── Section 4: P2P API Keys ── */}
      <GlassCard variant="purple" delay={0.16}>
        <div className="-m-4 mb-4 px-4 py-3 rounded-t-xl" style={{ ...sectionHeaderStyle, background: "rgba(123,47,255,0.06)", borderBottomColor: "rgba(123,47,255,0.1)" }}>
          <div className="flex items-center gap-2">
            <Landmark className="w-4 h-4 text-neon-purple" aria-hidden="true" />
            <SectionLabel>P2P Plattform API-Keys</SectionLabel>
          </div>
        </div>
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            API-Keys werden nur in localStorage gespeichert. Echte Plattform-Daten setzt du über Umgebungsvariablen im Backend (<code className="text-slate-400 bg-white/5 px-1 rounded">.env</code>).
          </p>
          <div>
            <label className="text-xs text-slate-400 mb-1.5 block font-medium">Mintos API Key</label>
            <p className="text-xs text-slate-600 mb-1">Backend-Env: <code className="text-slate-400">MINTOS_API_KEY</code> · Docs: developers.mintos.com</p>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1.5 block font-medium">Bondora API Key</label>
            <p className="text-xs text-slate-600 mb-1">Backend-Env: <code className="text-slate-400">BONDORA_API_KEY</code> · Docs: api.bondora.com</p>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1.5 block font-medium">PeerBerry E-Mail / Passwort</label>
            <p className="text-xs text-slate-600 mb-1">Backend-Env: <code className="text-slate-400">PEERBERRY_EMAIL</code> + <code className="text-slate-400">PEERBERRY_PASSWORD</code></p>
          </div>
          <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 px-3 py-2 text-xs text-yellow-400">
            Demo-Daten werden automatisch verwendet, solange keine echten API-Keys konfiguriert sind.
          </div>
        </div>
      </GlassCard>

      {/* ── Section 5: Bank Connections (FinTS) ── */}
      <GlassCard variant="green" delay={0.17}>
        <div className="-m-4 mb-4 px-4 py-3 rounded-t-xl" style={{ ...sectionHeaderStyle, background: "rgba(0,255,136,0.06)", borderBottomColor: "rgba(0,255,136,0.1)" }}>
          <div className="flex items-center gap-2">
            <Building className="w-4 h-4 text-neon-green" aria-hidden="true" />
            <SectionLabel>Bankverbindung (FinTS / HBCI)</SectionLabel>
          </div>
        </div>
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            Verbinde deutsche Bankkonten über das FinTS-Protokoll. Kompatibel mit comdirect, DKB, ING-DiBa, Sparkasse, Volksbank und anderen.
          </p>
          <div className="rounded-xl border border-slate-800/60 bg-slate-900/30 p-4 space-y-3">
            <p className="text-xs font-semibold text-slate-300">Unterstützte Banken (automatisch erkannt):</p>
            <div className="grid grid-cols-2 gap-2 text-xs text-slate-500">
              <span>• comdirect (BLZ 20041155)</span>
              <span>• DKB (BLZ 12030000)</span>
              <span>• ING-DiBa (BLZ 50010517)</span>
              <span>• Volksbank via Fiducia</span>
              <span>• Sparkasse (URL manuell)</span>
              <span>• Postbank (URL manuell)</span>
            </div>
          </div>
          <p className="text-xs text-slate-600">
            Verbindungen verwaltest du unter{" "}
            <a href="/networth" className="text-cyan-400 underline">Nettovermögen</a>.
            Die PIN wird niemals gespeichert — sie wird nur für den Sync-Vorgang übermittelt.
          </p>
        </div>
      </GlassCard>

      {/* ── Section 6: Price Alerts ── */}
      <PriceAlertsSection />

      {/* ── Section 7: Outbound Webhooks ── */}
      <WebhooksSection />

      {/* ── Section 8: Engine Status ── */}
      <EngineStatusSection />

      {/* ── Section 9: System Metrics ── */}
      <SystemMetricsSection />

      {/* ── Section 10: About ── */}
      <GlassCard delay={0.2}>
        <div className="-m-4 mb-4 px-4 py-3 rounded-t-xl" style={sectionHeaderStyle}>
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-cyan-400" aria-hidden="true" />
            <SectionLabel>About</SectionLabel>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs text-slate-600 mb-0.5">Version</p>
            <p className="font-mono text-slate-300">v0.7.0</p>
          </div>
          <div>
            <p className="text-xs text-slate-600 mb-0.5">AI Model</p>
            <p className="font-mono text-slate-300">claude-sonnet-4-6</p>
          </div>
          <div>
            <p className="text-xs text-slate-600 mb-0.5">Backend</p>
            <p className="font-mono text-slate-300">FastAPI 0.115 · Python 3.12</p>
          </div>
          <div>
            <p className="text-xs text-slate-600 mb-0.5">Frontend</p>
            <p className="font-mono text-slate-300">Next.js 15 · TypeScript</p>
          </div>
          <div className="col-span-2">
            <p className="text-xs text-slate-600 mb-0.5">Trading Engines</p>
            <p className="text-slate-400 text-xs leading-relaxed">
              9 AI engines orchestrated — see Engine Status section for install paths
            </p>
          </div>
        </div>

        <div className="mt-4 flex gap-3">
          <a
            href={`${API_BASE}/docs`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-cyan-400 hover:text-cyan-300 underline underline-offset-2"
          >
            API Docs
          </a>
          <span className="text-slate-700">·</span>
          <a
            href={`${API_BASE}/redoc`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-cyan-400 hover:text-cyan-300 underline underline-offset-2"
          >
            ReDoc
          </a>
          <span className="text-slate-700">·</span>
          <a
            href={`${API_BASE}/api/health/health`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-cyan-400 hover:text-cyan-300 underline underline-offset-2"
          >
            Health Check
          </a>
        </div>
      </GlassCard>

      {/* Save button */}
      <div className="flex justify-end pb-6">
        <button
          onClick={handleSave}
          aria-label="Save settings"
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all"
          style={{
            background: saved ? "rgba(0,255,136,0.15)" : "linear-gradient(135deg, rgba(0,212,255,0.2), rgba(123,47,255,0.15))",
            border: saved ? "1px solid rgba(0,255,136,0.4)" : "1px solid rgba(0,212,255,0.35)",
            color: saved ? "#00FF88" : "#00D4FF",
            boxShadow: saved ? "0 0 20px rgba(0,255,136,0.2)" : "0 0 20px rgba(0,212,255,0.15)",
          }}
        >
          {saved ? (
            <><CheckCircle className="w-4 h-4" aria-hidden="true" /> Saved</>
          ) : (
            <><Save className="w-4 h-4" aria-hidden="true" /> Save Settings</>
          )}
        </button>
      </div>
    </div>
  );
}
