"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Key, TrendingUp, Bell, Info, Save, Eye, EyeOff,
  CheckCircle, AlertTriangle, Plus, Trash2, Webhook,
  Play, Loader2, Activity, Landmark, Building, Send, Building2,
  RefreshCw, ExternalLink, Lock, Mail,
} from "lucide-react";
import { GlassCard, SectionLabel } from "@/components/ui/GlassCard";
import { api, API_BASE } from "@/lib/api";
import { getPasswordStrength } from "@/lib/passwordStrength";
import type { PriceAlertRecord, WebhookRecord, RepoPathEntry, ApiMetricsResponse } from "@/types";

const WEBHOOK_EVENT_OPTIONS = [
  { value: "signal.generated", label: "Signal generiert" },
  { value: "alert.fired",      label: "Alarm ausgelöst" },
  { value: "order.filled",     label: "Order ausgeführt" },
  { value: "risk.alert",       label: "Risikoalarm" },
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
    if (isNaN(parsed)) { setError("Schwellenwert muss eine Zahl sein"); return; }
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
      setError(err instanceof Error ? err.message : "Alarm konnte nicht erstellt werden");
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
    above: "Preis über",
    below: "Preis unter",
    change_pct: "Änderung % >=",
  };

  return (
    <GlassCard variant="cyan" delay={0.18}>
      <div
        className="-m-4 mb-4 px-4 py-3 rounded-t-xl"
        style={{ background: "rgba(255,170,0,0.06)", borderBottom: "1px solid rgba(255,170,0,0.1)" }}
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400" aria-hidden="true" />
          <SectionLabel>Preis-Alerts</SectionLabel>
        </div>
      </div>

      {/* Create form */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <input
          type="text"
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
          placeholder="Ticker (z.B. AAPL)"
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
          <option value="above">über</option>
          <option value="below">unter</option>
          <option value="change_pct">Änderung %</option>
        </select>
        <input
          type="number"
          value={threshold}
          onChange={(e) => setThreshold(e.target.value)}
          placeholder="Schwellenwert"
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
          Hinzufügen
        </button>
      </div>

      {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

      {/* Alerts list */}
      {alerts.length === 0 ? (
        <p className="text-xs text-slate-600 text-center py-4">Keine Alerts konfiguriert.</p>
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
                    Ausgelöst @ {a.fired_price?.toFixed(2)}
                  </span>
                )}
              </div>
              <button
                onClick={() => handleDelete(a.alert_id)}
                aria-label={`Alert für ${a.ticker} löschen`}
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
// Telegram Notifications Section Component
// ---------------------------------------------------------------------------

function TelegramSection() {
  const [status, setStatus] = useState<{connected: boolean; username: string | null; configured: boolean; webhook_url?: string} | null>(null);
  const [connectLink, setConnectLink] = useState<string | null>(null);
  const [connectCode, setConnectCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [testSent, setTestSent] = useState(false);
  const [webhookSetting, setWebhookSetting] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null);
  const [backendUrl, setBackendUrl] = useState("");

  useEffect(() => {
    api.telegram.status()
      .then(data => {
        setStatus(data);
        if (data.webhook_url) setWebhookUrl(data.webhook_url);
        if (data.webhook_url) setWebhookSetting("ok");
      })
      .catch(() => {});
  }, []);

  async function handleConnect() {
    setLoading(true);
    try {
      const data = await api.telegram.connect();
      setConnectLink(data.bot_link);
      setConnectCode(data.code);
    } finally { setLoading(false); }
  }

  async function handleTest() {
    await api.telegram.test();
    setTestSent(true);
    setTimeout(() => setTestSent(false), 3000);
  }

  const [botToken, setBotToken] = useState("");
  const [tokenSaving, setTokenSaving] = useState(false);
  const [tokenSaved, setTokenSaved] = useState(false);

  async function handleSaveToken() {
    if (!botToken.trim()) return;
    setTokenSaving(true);
    try {
      await api.settings.saveCredential("TELEGRAM_BOT_TOKEN", botToken.trim());
      setBotToken("");
      setTokenSaved(true);
      setStatus(s => s ? { ...s, configured: true } : s);
      setTimeout(() => setTokenSaved(false), 3000);
      // Auto-setup webhook if not on localhost
      // API_BASE is "" in the browser (same-origin proxy) — check the page host.
      const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);
      if (!isLocal) {
        setWebhookSetting("loading");
        try {
          const result = await api.telegram.setupWebhook();
          setWebhookUrl(result.webhook_url);
          setWebhookSetting("ok");
          setStatus(s => s ? { ...s, webhook_url: result.webhook_url } : s);
        } catch {
          setWebhookSetting("error");
          setTimeout(() => setWebhookSetting("idle"), 5000);
        }
      }
    } finally { setTokenSaving(false); }
  }

  async function handleSetupWebhook() {
    setWebhookSetting("loading");
    try {
      const result = await api.telegram.setupWebhook(backendUrl || undefined);
      setWebhookUrl(result.webhook_url);
      setWebhookSetting("ok");
    } catch {
      setWebhookSetting("error");
      setTimeout(() => setWebhookSetting("idle"), 4000);
    }
  }

  async function handleDisconnect() {
    await api.telegram.disconnect();
    setStatus(s => s ? {...s, connected: false, username: null} : s);
    setConnectLink(null);
  }

  return (
    <GlassCard padding="p-5">
      <div className="flex items-center gap-2 mb-4">
        <Send className="w-4 h-4 text-cyan-400" />
        <SectionLabel>Telegram-Benachrichtigungen</SectionLabel>
        {status?.configured === false && (
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(255,215,0,0.1)", color: "#FFD700" }}>
            Bot-Token nicht gesetzt
          </span>
        )}
      </div>

      {/* Bot-Token input (shown when not configured) */}
      {status?.configured === false && (
        <div className="mb-4 p-3 rounded-xl space-y-2" style={{ background: "rgba(255,215,0,0.05)", border: "1px solid rgba(255,215,0,0.15)" }}>
          <p className="text-xs text-yellow-300 font-medium">Telegram Bot-Token hinterlegen</p>
          <p className="text-xs text-slate-500">
            Erstelle einen Bot via <span className="text-cyan-400">@BotFather</span> → /newbot → Token kopieren.
          </p>
          <div className="flex gap-2">
            <input
              type="password"
              value={botToken}
              onChange={e => setBotToken(e.target.value)}
              placeholder="1234567890:ABCdef..."
              autoComplete="off"
              className="flex-1 rounded-xl px-3 py-2 text-sm font-mono text-slate-200 placeholder-slate-600 outline-none"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,215,0,0.2)" }}
              onKeyDown={e => { if (e.key === "Enter") handleSaveToken(); }}
            />
            <button
              onClick={handleSaveToken}
              disabled={tokenSaving || !botToken.trim()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all disabled:opacity-40"
              style={{
                background: tokenSaved ? "rgba(0,255,136,0.12)" : "rgba(255,215,0,0.12)",
                border: `1px solid ${tokenSaved ? "rgba(0,255,136,0.3)" : "rgba(255,215,0,0.3)"}`,
                color: tokenSaved ? "#00FF88" : "#FFD700",
              }}
            >
              {tokenSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : tokenSaved ? <CheckCircle className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
              {tokenSaved ? "Gespeichert" : "Speichern"}
            </button>
          </div>
        </div>
      )}

      {/* Webhook setup (shown when configured) */}
      {status?.configured && (
        <div className="mb-4 p-3 rounded-xl space-y-2" style={{ background: "rgba(0,212,255,0.04)", border: "1px solid rgba(0,212,255,0.12)" }}>
          <div className="flex items-center justify-between">
            <p className="text-xs text-cyan-300 font-medium">Webhook (Schritt 2)</p>
            {(webhookUrl || status.webhook_url) && (
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(0,255,136,0.1)", color: "#00FF88" }}>
                ✓ Aktiv
              </span>
            )}
          </div>
          {(webhookUrl || status.webhook_url) ? (
            <p className="text-xs font-mono text-slate-500 break-all">{webhookUrl || status.webhook_url}</p>
          ) : (
            <p className="text-xs text-slate-500">
              Nur einmalig nötig — verbindet Telegram mit deinem Backend.
              Bei Railway-Deployment die Backend-URL eintragen.
            </p>
          )}
          <div className="flex gap-2">
            <input
              type="url"
              value={backendUrl}
              onChange={e => setBackendUrl(e.target.value)}
              placeholder={`${API_BASE} (auto-detect)`}
              className="flex-1 rounded-xl px-3 py-2 text-xs font-mono text-slate-200 placeholder-slate-600 outline-none"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(0,212,255,0.15)" }}
            />
            <button
              onClick={handleSetupWebhook}
              disabled={webhookSetting === "loading"}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all disabled:opacity-50 whitespace-nowrap"
              style={{
                background: webhookSetting === "ok" ? "rgba(0,255,136,0.12)" : webhookSetting === "error" ? "rgba(255,0,80,0.12)" : "rgba(0,212,255,0.1)",
                border: `1px solid ${webhookSetting === "ok" ? "rgba(0,255,136,0.3)" : webhookSetting === "error" ? "rgba(255,0,80,0.3)" : "rgba(0,212,255,0.25)"}`,
                color: webhookSetting === "ok" ? "#00FF88" : webhookSetting === "error" ? "#FF0050" : "#00D4FF",
              }}
            >
              {webhookSetting === "loading" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {webhookSetting === "ok" && <CheckCircle className="w-3.5 h-3.5" />}
              {webhookSetting === "error" && <AlertTriangle className="w-3.5 h-3.5" />}
              {webhookSetting === "idle" && <Activity className="w-3.5 h-3.5" />}
              {webhookSetting === "loading" ? "Registriere…" : webhookSetting === "ok" ? "Registriert!" : webhookSetting === "error" ? "Fehler" : "Webhook setzen"}
            </button>
          </div>
          {webhookSetting === "ok" && webhookUrl && (
            <p className="text-xs text-green-400 font-mono break-all">✓ {webhookUrl}</p>
          )}
          {webhookSetting === "error" && (
            <p className="text-xs text-red-400">Telegram hat den Webhook abgelehnt. Token korrekt? Backend erreichbar?</p>
          )}
        </div>
      )}

      {status?.connected ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm" style={{ color: "#00FF88" }}>
            <CheckCircle className="w-4 h-4" />
            Verbunden{status.username ? ` als @${status.username}` : ""}
          </div>
          <p className="text-xs text-slate-500">
            Du erhältst Kursalarme und KI-Signale direkt in Telegram.
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleTest}
              className="text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors"
              style={{ background: "rgba(0,212,255,0.1)", color: "#00D4FF", border: "1px solid rgba(0,212,255,0.2)" }}
            >
              {testSent ? "Gesendet!" : "Test senden"}
            </button>
            <button
              onClick={handleDisconnect}
              className="text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors"
              style={{ background: "rgba(255,0,128,0.08)", color: "#FF0080", border: "1px solid rgba(255,0,128,0.2)" }}
            >
              Trennen
            </button>
          </div>
        </div>
      ) : connectLink ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-300">
            Öffne diesen Link und sende <code className="text-cyan-400 bg-white/5 px-1 rounded">/start</code> an den Bot:
          </p>
          <a
            href={connectLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all"
            style={{ background: "linear-gradient(135deg, #00D4FF22, #7B2FFF22)", border: "1px solid rgba(0,212,255,0.3)", color: "#00D4FF" }}
          >
            <Send className="w-3.5 h-3.5" />
            Telegram Bot öffnen
          </a>
          <p className="text-xs text-slate-600">Code: <span className="font-mono text-slate-400">{connectCode}</span> — gültig für 10 Minuten</p>
          <button onClick={() => window.location.reload()} className="text-xs text-cyan-400 underline">
            Verbunden — Status aktualisieren
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-400">
            Erhalte Kursalarme und KI-Signale direkt in Telegram.
          </p>
          <button
            onClick={handleConnect}
            disabled={loading || status?.configured === false}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
            style={{ background: "rgba(0,212,255,0.1)", color: "#00D4FF", border: "1px solid rgba(0,212,255,0.25)" }}
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Telegram verbinden
          </button>
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
            <SectionLabel>KI-Engine-Status</SectionLabel>
          </div>
          {!loading && repos && (
            <span className="text-xs font-mono" style={{ color: installedCount === entries.length ? "#00FF88" : "#FFD700" }}>
              {installedCount}/{entries.length} installiert
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
                {entry.exists ? "BEREIT" : "FEHLT"}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-500 text-center py-4">Engine-Status konnte nicht geladen werden — Backend offline?</p>
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
        { label: "Anfragen Gesamt",       value: metrics.requests_total.toLocaleString() },
        { label: "Ø Antwort",            value: `${metrics.avg_response_ms.toFixed(1)} ms` },
        { label: "WS Verbindungen",      value: String(metrics.ws_connections_active), highlight: metrics.ws_connections_active > 0 },
        { label: "Signale heute",        value: String(metrics.signals_generated_today), highlight: metrics.signals_generated_today > 0 },
        { label: "DB Größe",             value: `${metrics.db_size_kb.toFixed(0)} KB` },
        { label: "Laufzeit",             value: fmtUptime(metrics.uptime_seconds), highlight: true },
      ]
    : [];

  return (
    <GlassCard delay={0.18}>
      <div className="-m-4 mb-4 px-4 py-3 rounded-t-xl" style={{ background: "rgba(0,212,255,0.04)", borderBottom: "1px solid rgba(0,212,255,0.08)" }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-400" aria-hidden="true" />
            <SectionLabel>System-Kennzahlen</SectionLabel>
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
          Kennzahlen nicht verfügbar — Backend offline?
        </p>
      )}
    </GlassCard>
  );
}

// ---------------------------------------------------------------------------
// Change Password Section
// ---------------------------------------------------------------------------

function ChangePasswordSection() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next !== confirm) { setError("Passwörter stimmen nicht überein"); return; }
    setLoading(true);
    try {
      await api.auth.changePassword(current, next);
      setSuccess(true);
      setCurrent(""); setNext(""); setConfirm("");
      setTimeout(() => setSuccess(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verbindungsfehler");
    } finally {
      setLoading(false);
    }
  }

  const pwStrength = useMemo(() => getPasswordStrength(next), [next]);
  const inputCls = "w-full pl-10 pr-10 py-2.5 rounded-lg text-sm text-slate-200 placeholder-slate-600 outline-none transition-all duration-200";
  const inputStyle = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(0,212,255,0.15)" };

  return (
    <GlassCard variant="cyan" delay={0.3}>
      <div className="-m-4 mb-4 px-4 py-3 rounded-t-xl" style={{ background: "rgba(0,212,255,0.06)", borderBottom: "1px solid rgba(0,212,255,0.1)" }}>
        <div className="flex items-center gap-2">
          <Lock className="w-4 h-4 text-cyan-400" aria-hidden="true" />
          <SectionLabel>Passwort ändern</SectionLabel>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg mb-4" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)" }}>
          <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <span className="text-xs text-red-400">{error}</span>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg mb-4" style={{ background: "rgba(0,255,136,0.08)", border: "1px solid rgba(0,255,136,0.3)" }}>
          <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
          <span className="text-xs text-green-400">Passwort erfolgreich geändert.</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        {[
          { id: "cp-cur", label: "AKTUELLES PASSWORT", val: current, set: setCurrent, auto: "current-password" },
          { id: "cp-new", label: "NEUES PASSWORT", val: next, set: setNext, auto: "new-password" },
          { id: "cp-con", label: "NEUES PASSWORT BESTÄTIGEN", val: confirm, set: setConfirm, auto: "new-password" },
        ].map(({ id, label, val, set, auto }) => (
          <div key={id}>
            <label htmlFor={id} className="block text-xs font-semibold tracking-wider mb-1" style={{ color: "rgba(100,116,139,0.8)" }}>{label}</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "rgba(0,212,255,0.4)" }} />
              <input
                id={id}
                type={showPw ? "text" : "password"}
                autoComplete={auto}
                required
                minLength={id === "cp-cur" ? 1 : 8}
                value={val}
                onChange={(e) => set(e.target.value)}
                className={inputCls}
                style={inputStyle}
              />
              {id === "cp-new" && (
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  aria-label={showPw ? "Passwörter ausblenden" : "Passwörter anzeigen"}
                  style={{ color: "rgba(100,116,139,0.5)" }}
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              )}
            </div>
            {id === "cp-new" && next.length > 0 && (
              <div className="mt-1.5">
                <div className="flex gap-1 mb-0.5">
                  {[1, 2, 3, 4].map((seg) => (
                    <div
                      key={seg}
                      className="h-1 flex-1 rounded-full transition-all duration-300"
                      style={{ background: seg <= pwStrength.score ? pwStrength.color : "rgba(255,255,255,0.08)" }}
                    />
                  ))}
                </div>
                <p className="text-xs" style={{ color: pwStrength.color }}>{pwStrength.label}</p>
              </div>
            )}
          </div>
        ))}

        <button
          type="submit"
          disabled={loading || !current || !next || !confirm}
          className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold transition-all"
          style={{
            background: "linear-gradient(135deg, rgba(0,212,255,0.15), rgba(123,47,255,0.1))",
            border: "1px solid rgba(0,212,255,0.35)",
            color: "#00D4FF",
            opacity: (!current || !next || !confirm) ? 0.5 : 1,
          }}
        >
          <Save className="w-4 h-4" />
          {loading ? "Wird gespeichert…" : "Passwort speichern"}
        </button>
      </form>
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
      setError(err instanceof Error ? err.message : "Webhook konnte nicht erstellt werden");
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
          <SectionLabel>Ausgehende Webhooks</SectionLabel>
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
          Registrieren
        </button>
      </div>

      {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

      {/* Webhook list */}
      {webhooks.length === 0 ? (
        <p className="text-xs text-slate-600 text-center py-4">Keine Webhooks registriert.</p>
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
                    <p className="text-xs text-red-400 mt-1">{wh.delivery_failures} Zustellungsfehler</p>
                  )}
                  {result && (
                    <p className={`text-xs mt-1 ${result.success ? "text-green-400" : "text-red-400"}`}>
                      {result.success ? "Test erfolgreich zugestellt" : "Test-Zustellung fehlgeschlagen"}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                  <button
                    onClick={() => handleTest(wh.id)}
                    disabled={isTestingThis}
                    aria-label="Webhook testen"
                    className="text-slate-500 hover:text-purple-400 transition-colors disabled:opacity-40"
                  >
                    {isTestingThis
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Play className="w-4 h-4" />
                    }
                  </button>
                  <button
                    onClick={() => handleDelete(wh.id)}
                    aria-label="Webhook löschen"
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
// P2P Credentials Section
// ---------------------------------------------------------------------------

const P2P_FIELDS: Array<{ key: string; label: string; placeholder: string; type?: "password" }> = [
  { key: "MINTOS_API_KEY",      label: "Mintos API Key",       placeholder: "Bearer-Token aus developers.mintos.com" },
  { key: "BONDORA_API_KEY",     label: "Bondora API Key",      placeholder: "Token aus api.bondora.com" },
  { key: "PEERBERRY_EMAIL",     label: "PeerBerry E-Mail",     placeholder: "me@example.com" },
  { key: "PEERBERRY_PASSWORD",  label: "PeerBerry Passwort",   placeholder: "••••••••", type: "password" },
];

function P2PCredentialsSection() {
  const [statuses, setStatuses] = useState<Record<string, "configured" | "not_set">>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [visible, setVisible] = useState<Record<string, boolean>>({});

  useEffect(() => {
    api.settings.credentials()
      .then(s => setStatuses(s))
      .catch(() => {});
  }, []);

  async function handleSave(key: string) {
    const val = values[key]?.trim();
    if (!val) { setErrors(e => ({ ...e, [key]: "Darf nicht leer sein" })); return; }
    setSaving(s => ({ ...s, [key]: true }));
    setErrors(e => ({ ...e, [key]: "" }));
    try {
      await api.settings.saveCredential(key, val);
      setStatuses(s => ({ ...s, [key]: "configured" }));
      setValues(v => ({ ...v, [key]: "" }));
      setSaved(s => ({ ...s, [key]: true }));
      setTimeout(() => setSaved(s => ({ ...s, [key]: false })), 2500);
    } catch (err) {
      setErrors(e => ({ ...e, [key]: err instanceof Error ? err.message : "Fehler" }));
    } finally {
      setSaving(s => ({ ...s, [key]: false }));
    }
  }

  async function handleDelete(key: string) {
    try {
      await api.settings.deleteCredential(key);
      setStatuses(s => ({ ...s, [key]: "not_set" }));
    } catch { /* ignore */ }
  }

  return (
    <GlassCard variant="purple" delay={0.16}>
      <div
        className="-m-4 mb-4 px-4 py-3 rounded-t-xl"
        style={{ background: "rgba(123,47,255,0.06)", borderBottom: "1px solid rgba(123,47,255,0.1)" }}
      >
        <div className="flex items-center gap-2">
          <Landmark className="w-4 h-4 text-neon-purple" aria-hidden="true" />
          <SectionLabel>P2P Plattform API-Keys</SectionLabel>
        </div>
      </div>

      <div className="space-y-5">
        <p className="text-xs text-slate-500">
          Hier gespeicherte Keys überschreiben Server-Umgebungsvariablen.
          Werte werden ausschließlich serverseitig gespeichert — nie im Browser.
        </p>

        {P2P_FIELDS.map(({ key, label, placeholder, type }) => {
          const isConfigured = statuses[key] === "configured";
          const isVisible = visible[key];
          return (
            <div key={key} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs text-slate-400 font-medium">{label}</label>
                <div className="flex items-center gap-2">
                  {isConfigured && (
                    <>
                      <span
                        className="text-xs px-2 py-0.5 rounded-full font-semibold"
                        style={{ background: "rgba(0,255,136,0.1)", color: "#00FF88", border: "1px solid rgba(0,255,136,0.25)" }}
                      >
                        konfiguriert ✓
                      </span>
                      <button
                        onClick={() => handleDelete(key)}
                        aria-label={`${key} löschen`}
                        className="text-slate-600 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                  {!isConfigured && (
                    <span
                      className="text-xs px-2 py-0.5 rounded-full"
                      style={{ background: "rgba(100,116,139,0.1)", color: "#64748B" }}
                    >
                      nicht gesetzt
                    </span>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={type === "password" && !isVisible ? "password" : "text"}
                    value={values[key] ?? ""}
                    onChange={(e) => setValues(v => ({ ...v, [key]: e.target.value }))}
                    placeholder={isConfigured ? "Neuen Wert eingeben zum Überschreiben…" : placeholder}
                    autoComplete="off"
                    className="w-full rounded-xl px-3 py-2 pr-10 text-sm font-mono text-slate-200 placeholder-slate-600 outline-none"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(123,47,255,0.2)" }}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSave(key); }}
                  />
                  {type === "password" && (
                    <button
                      type="button"
                      onClick={() => setVisible(v => ({ ...v, [key]: !v[key] }))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      {isVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  )}
                </div>
                <button
                  onClick={() => handleSave(key)}
                  disabled={saving[key] || !values[key]?.trim()}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all disabled:opacity-40"
                  style={{
                    background: saved[key] ? "rgba(0,255,136,0.12)" : "rgba(123,47,255,0.15)",
                    border: `1px solid ${saved[key] ? "rgba(0,255,136,0.3)" : "rgba(123,47,255,0.35)"}`,
                    color: saved[key] ? "#00FF88" : "#A78BFA",
                  }}
                >
                  {saving[key]
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : saved[key]
                    ? <CheckCircle className="w-3.5 h-3.5" />
                    : <Save className="w-3.5 h-3.5" />
                  }
                  {saved[key] ? "Gespeichert" : "Speichern"}
                </button>
              </div>
              {errors[key] && <p className="text-xs text-red-400">{errors[key]}</p>}
            </div>
          );
        })}

        <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 px-3 py-2 text-xs text-yellow-400">
          Demo-Daten werden automatisch genutzt, solange keine echten API-Keys gesetzt sind.
        </div>
      </div>
    </GlassCard>
  );
}

// ---------------------------------------------------------------------------
// Broker Credentials Section
// ---------------------------------------------------------------------------

type BrokerFieldDef = {
  key: string;
  label: string;
  placeholder: string;
  type?: "password";
  group: string;
};

const BROKER_FIELDS: BrokerFieldDef[] = [
  // Bitpanda
  { key: "BITPANDA_API_KEY",          label: "Bitpanda API Key",            placeholder: "Bearer token aus bitpanda.com/de/account/api",                    type: "password", group: "Bitpanda" },
  // Comdirect
  { key: "COMDIRECT_CLIENT_ID",       label: "Comdirect Client ID",         placeholder: "Aus developer.comdirect.de — App registrieren",                    group: "Comdirect (OAuth2)" },
  { key: "COMDIRECT_CLIENT_SECRET",   label: "Comdirect Client Secret",     placeholder: "Aus developer.comdirect.de",                                       type: "password", group: "Comdirect (OAuth2)" },
  { key: "COMDIRECT_ACCESS_TOKEN",    label: "Comdirect Access Token",      placeholder: "Nach OAuth-Flow automatisch gesetzt — oder manuell eintragen",     type: "password", group: "Comdirect (OAuth2)" },
  // DEGIRO
  { key: "DEGIRO_USERNAME",           label: "DEGIRO Benutzername",         placeholder: "Login-E-Mail oder Username",                                        group: "DEGIRO" },
  { key: "DEGIRO_PASSWORD",           label: "DEGIRO Passwort",             placeholder: "••••••••",                                                          type: "password", group: "DEGIRO" },
  { key: "DEGIRO_TOTP_TOKEN",         label: "DEGIRO 2FA-Secret (TOTP)",    placeholder: "TOTP-Secret (optional, wenn 2FA aktiviert)",                       type: "password", group: "DEGIRO" },
  // Flatex
  { key: "FLATEX_FINTS_USER",         label: "Flatex FinTS-Login",          placeholder: "Dein Online-Banking-Login (z.B. 1234567890)",                       group: "Flatex (FinTS)" },
  { key: "FLATEX_FINTS_ACCOUNT",      label: "Flatex IBAN (optional)",      placeholder: "DE89 370 400 440 532 013 000 (für Kontoabfrage)",                   group: "Flatex (FinTS)" },
  // Trade Republic
  { key: "TR_PHONE_NUMBER",           label: "Trade Republic Telefon",      placeholder: "+49151...",                                                          group: "Trade Republic" },
  { key: "TR_PIN",                    label: "Trade Republic PIN",          placeholder: "4-stellige PIN aus der App",                                        type: "password", group: "Trade Republic" },
  // WH SelfInvest
  { key: "WH_CTRADER_CLIENT_ID",      label: "cTrader Client ID",           placeholder: "Aus dem cTrader Open API Portal",                                   group: "WH SelfInvest (cTrader)" },
  { key: "WH_CTRADER_CLIENT_SECRET",  label: "cTrader Client Secret",       placeholder: "••••••••",                                                          type: "password", group: "WH SelfInvest (cTrader)" },
  { key: "WH_CTRADER_ACCESS_TOKEN",   label: "cTrader Access Token",        placeholder: "Nach OAuth-Flow gesetzt",                                           type: "password", group: "WH SelfInvest (cTrader)" },
  { key: "WH_CTRADER_ACCOUNT_ID",     label: "cTrader Account ID",          placeholder: "Konto-ID aus der cTrader-Anwendung",                                group: "WH SelfInvest (cTrader)" },
  // Crowdestor
  { key: "CROWDESTOR_EMAIL",          label: "Crowdestor E-Mail",           placeholder: "me@example.com",                                                    group: "Crowdestor" },
  { key: "CROWDESTOR_PASSWORD",       label: "Crowdestor Passwort",         placeholder: "••••••••",                                                          type: "password", group: "Crowdestor" },
];

// Broker-Felder nach Gruppe zusammenfassen
const BROKER_GROUPS = Array.from(new Set(BROKER_FIELDS.map((f) => f.group)));

// ---------------------------------------------------------------------------
// Flatex Session-PIN Block
// ---------------------------------------------------------------------------

function FlatexSyncBlock() {
  const [pin, setPin] = useState("");
  const [iban, setIban] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<{ balance?: number; currency?: string; is_demo?: boolean; error?: string; lib_missing?: boolean } | null>(null);
  const [showPin, setShowPin] = useState(false);

  async function handleSync() {
    if (!pin.trim()) return;
    setSyncing(true);
    setResult(null);
    try {
      const data = await api.brokers.flatexSync(pin.trim(), iban.trim() || undefined);
      setResult(data as { balance?: number; currency?: string; is_demo?: boolean; error?: string; lib_missing?: boolean });
      setPin(""); // PIN sofort löschen nach Nutzung
    } catch (err) {
      setResult({ error: err instanceof Error ? err.message : "Fehler" });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-2 rounded-xl p-3"
      style={{ background: "rgba(123,47,255,0.06)", border: "1px solid rgba(123,47,255,0.2)" }}>
      <p className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
        <Lock className="w-3.5 h-3.5 text-purple-400" />
        Flatex Kontostand synchronisieren
      </p>
      <p className="text-xs text-slate-500">
        PIN wird <strong className="text-slate-400">nicht gespeichert</strong> — gilt nur für diese Abfrage.
      </p>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type={showPin ? "text" : "password"}
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="FinTS-PIN eingeben…"
            autoComplete="one-time-code"
            className="w-full rounded-xl px-3 py-2 pr-10 text-sm font-mono text-slate-200 placeholder-slate-600 outline-none"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(123,47,255,0.3)" }}
            onKeyDown={(e) => { if (e.key === "Enter") handleSync(); }}
          />
          <button type="button" onClick={() => setShowPin((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
            {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing || !pin.trim()}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all disabled:opacity-40"
          style={{ background: "rgba(123,47,255,0.12)", border: "1px solid rgba(123,47,255,0.3)", color: "#9B5DFF" }}
        >
          {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
          Sync
        </button>
      </div>
      {result && (
        <div className="rounded-lg px-3 py-2 text-xs"
          style={{
            background: result.error ? "rgba(255,0,128,0.06)" : "rgba(0,255,136,0.06)",
            border: `1px solid ${result.error ? "rgba(255,0,128,0.2)" : "rgba(0,255,136,0.2)"}`,
          }}>
          {result.error
            ? <p className="text-red-400">{result.error}</p>
            : result.lib_missing
            ? <p className="text-amber-400">python-fints nicht installiert — <code className="bg-white/5 px-1 rounded">pip install python-fints</code></p>
            : <p className="text-green-300">
                Kontostand: <strong>{result.balance?.toLocaleString("de-DE", { minimumFractionDigits: 2 })} {result.currency ?? "EUR"}</strong>
                {result.is_demo && " (Demo)"}
              </p>
          }
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Comdirect OAuth2 Flow Block
// ---------------------------------------------------------------------------

function ComdirectOAuthBlock({
  hasClientId,
  hasClientSecret,
  hasAccessToken,
  onTokenSaved,
}: {
  hasClientId: boolean;
  hasClientSecret: boolean;
  hasAccessToken: boolean;
  onTokenSaved: () => void;
}) {
  const [initiating, setInitiating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [oauthResult, setOauthResult] = useState<{ success: boolean; onetime_token?: string; next_step?: string; error?: string } | null>(null);
  const [refreshResult, setRefreshResult] = useState<{ success: boolean; message?: string; error?: string; action?: string } | null>(null);

  const credentialsReady = hasClientId && hasClientSecret;

  async function handleInitiate() {
    setInitiating(true);
    setOauthResult(null);
    try {
      const data = await api.brokers.comdirectOauthInitiate();
      setOauthResult(data);
    } catch {
      setOauthResult({ success: false, error: "Verbindungsfehler" });
    } finally {
      setInitiating(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    setRefreshResult(null);
    try {
      const data = await api.brokers.comdirectOauthRefresh();
      setRefreshResult(data);
      if (data.success) onTokenSaved();
    } catch {
      setRefreshResult({ success: false, error: "Verbindungsfehler" });
    } finally {
      setRefreshing(false);
    }
  }

  if (!credentialsReady) {
    return (
      <div className="flex items-start gap-2 px-3 py-2 rounded-lg text-xs"
        style={{ background: "rgba(100,116,139,0.08)", border: "1px solid rgba(100,116,139,0.15)" }}>
        <Lock className="w-3.5 h-3.5 text-slate-500 flex-shrink-0 mt-0.5" />
        <span className="text-slate-500">
          Client-ID und Client-Secret eintragen, dann OAuth-Flow starten.{" "}
          <a href="https://developer.comdirect.de" target="_blank" rel="noopener noreferrer"
            className="text-cyan-500 underline underline-offset-2 inline-flex items-center gap-0.5">
            developer.comdirect.de <ExternalLink className="w-3 h-3" />
          </a>
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {/* Initiate */}
        {!hasAccessToken && (
          <button
            onClick={handleInitiate}
            disabled={initiating}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all disabled:opacity-50"
            style={{ background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.3)", color: "#00D4FF" }}
          >
            {initiating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            OAuth starten (PHOTO-TAN)
          </button>
        )}
        {/* Refresh */}
        {hasAccessToken && (
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all disabled:opacity-50"
            style={{ background: "rgba(0,255,136,0.08)", border: "1px solid rgba(0,255,136,0.25)", color: "#00FF88" }}
          >
            {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Token erneuern
          </button>
        )}
      </div>

      {/* OAuth-Initiate-Ergebnis */}
      {oauthResult && (
        <div className="rounded-lg px-3 py-2.5 text-xs space-y-1"
          style={{
            background: oauthResult.success ? "rgba(0,212,255,0.06)" : "rgba(255,0,128,0.06)",
            border: `1px solid ${oauthResult.success ? "rgba(0,212,255,0.2)" : "rgba(255,0,128,0.2)"}`,
          }}>
          {oauthResult.success ? (
            <>
              <p className="font-semibold text-cyan-300">One-Time Token erhalten</p>
              <code className="block text-slate-300 bg-white/5 px-2 py-1 rounded font-mono break-all">
                {oauthResult.onetime_token}
              </code>
              <p className="text-slate-400">{oauthResult.next_step}</p>
            </>
          ) : (
            <p className="text-red-400">{oauthResult.error}</p>
          )}
        </div>
      )}

      {/* Refresh-Ergebnis */}
      {refreshResult && (
        <div className="rounded-lg px-3 py-2 text-xs"
          style={{
            background: refreshResult.success ? "rgba(0,255,136,0.06)" : "rgba(255,170,0,0.06)",
            border: `1px solid ${refreshResult.success ? "rgba(0,255,136,0.2)" : "rgba(255,170,0,0.2)"}`,
          }}>
          {refreshResult.success
            ? <p className="text-green-300">{refreshResult.message}</p>
            : <p className="text-amber-300">
                {refreshResult.error}
                {refreshResult.action === "initiate_oauth" && " → OAuth neu starten."}
              </p>
          }
        </div>
      )}
    </div>
  );
}

function BrokerCredentialsSection() {
  const [statuses, setStatuses] = useState<Record<string, "configured" | "not_set">>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [visible, setVisible] = useState<Record<string, boolean>>({});

  useEffect(() => {
    api.settings.credentials()
      .then((s) => setStatuses(s))
      .catch(() => {});
  }, []);

  async function handleSave(key: string) {
    const val = values[key]?.trim();
    if (!val) { setErrors((e) => ({ ...e, [key]: "Darf nicht leer sein" })); return; }
    setSaving((s) => ({ ...s, [key]: true }));
    setErrors((e) => ({ ...e, [key]: "" }));
    try {
      await api.settings.saveCredential(key, val);
      setStatuses((s) => ({ ...s, [key]: "configured" }));
      setValues((v) => ({ ...v, [key]: "" }));
      setSaved((s) => ({ ...s, [key]: true }));
      setTimeout(() => setSaved((s) => ({ ...s, [key]: false })), 2500);
    } catch (err) {
      setErrors((e) => ({ ...e, [key]: err instanceof Error ? err.message : "Fehler" }));
    } finally {
      setSaving((s) => ({ ...s, [key]: false }));
    }
  }

  async function handleDelete(key: string) {
    try {
      await api.settings.deleteCredential(key);
      setStatuses((s) => ({ ...s, [key]: "not_set" }));
    } catch { /* ignore */ }
  }

  return (
    <GlassCard variant="cyan" delay={0.165}>
      <div
        className="-m-4 mb-4 px-4 py-3 rounded-t-xl"
        style={{ background: "rgba(0,212,255,0.06)", borderBottom: "1px solid rgba(0,212,255,0.1)" }}
      >
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-cyan-400" aria-hidden="true" />
          <SectionLabel>Broker & Depots — API-Keys</SectionLabel>
        </div>
      </div>

      <div className="space-y-6">
        <p className="text-xs text-slate-500">
          Credentials für alle 7 Broker-Integrationen. Werte werden ausschließlich serverseitig gespeichert.
          Demo-Daten werden genutzt, solange keine echten Keys gesetzt sind.
        </p>

        {BROKER_GROUPS.map((group) => {
          const fields = BROKER_FIELDS.filter((f) => f.group === group);
          const configuredCount = fields.filter((f) => statuses[f.key] === "configured").length;
          return (
            <div key={group} className="space-y-3">
              {/* Gruppen-Überschrift */}
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold text-slate-300">{group}</p>
                {configuredCount > 0 && (
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-semibold"
                    style={{ background: "rgba(0,255,136,0.1)", color: "#00FF88", border: "1px solid rgba(0,255,136,0.25)" }}
                  >
                    {configuredCount}/{fields.length} konfiguriert
                  </span>
                )}
              </div>

              {/* Flatex Session-PIN-Block */}
              {group === "Flatex (FinTS)" && statuses["FLATEX_FINTS_USER"] === "configured" && (
                <FlatexSyncBlock />
              )}

              {/* Comdirect OAuth-Flow-Block */}
              {group === "Comdirect (OAuth2)" && (
                <ComdirectOAuthBlock
                  hasClientId={statuses["COMDIRECT_CLIENT_ID"] === "configured"}
                  hasClientSecret={statuses["COMDIRECT_CLIENT_SECRET"] === "configured"}
                  hasAccessToken={statuses["COMDIRECT_ACCESS_TOKEN"] === "configured"}
                  onTokenSaved={() => setStatuses((s) => ({ ...s, COMDIRECT_ACCESS_TOKEN: "configured" }))}
                />
              )}

              {fields.map(({ key, label, placeholder, type }) => {
                const isConfigured = statuses[key] === "configured";
                const isVisible = visible[key];
                return (
                  <div key={key} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-slate-400 font-medium">{label}</label>
                      <div className="flex items-center gap-2">
                        {isConfigured && (
                          <>
                            <span
                              className="text-xs px-2 py-0.5 rounded-full font-semibold"
                              style={{ background: "rgba(0,255,136,0.1)", color: "#00FF88", border: "1px solid rgba(0,255,136,0.25)" }}
                            >
                              konfiguriert ✓
                            </span>
                            <button
                              onClick={() => handleDelete(key)}
                              aria-label={`${key} löschen`}
                              className="text-slate-600 hover:text-red-400 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                        {!isConfigured && (
                          <span
                            className="text-xs px-2 py-0.5 rounded-full"
                            style={{ background: "rgba(100,116,139,0.1)", color: "#64748B" }}
                          >
                            nicht gesetzt
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input
                          type={type === "password" && !isVisible ? "password" : "text"}
                          value={values[key] ?? ""}
                          onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                          placeholder={isConfigured ? "Neuen Wert eingeben zum Überschreiben…" : placeholder}
                          autoComplete="off"
                          className="w-full rounded-xl px-3 py-2 pr-10 text-sm font-mono text-slate-200 placeholder-slate-600 outline-none"
                          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(0,212,255,0.2)" }}
                          onKeyDown={(e) => { if (e.key === "Enter") handleSave(key); }}
                        />
                        {type === "password" && (
                          <button
                            type="button"
                            onClick={() => setVisible((v) => ({ ...v, [key]: !v[key] }))}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                          >
                            {isVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        )}
                      </div>
                      <button
                        onClick={() => handleSave(key)}
                        disabled={saving[key] || !values[key]?.trim()}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all disabled:opacity-40"
                        style={{
                          background: saved[key] ? "rgba(0,255,136,0.12)" : "rgba(0,212,255,0.1)",
                          border: `1px solid ${saved[key] ? "rgba(0,255,136,0.3)" : "rgba(0,212,255,0.25)"}`,
                          color: saved[key] ? "#00FF88" : "#00D4FF",
                        }}
                      >
                        {saving[key]
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : saved[key]
                          ? <CheckCircle className="w-3.5 h-3.5" />
                          : <Save className="w-3.5 h-3.5" />
                        }
                        {saved[key] ? "Gespeichert" : "Speichern"}
                      </button>
                    </div>
                    {errors[key] && <p className="text-xs text-red-400">{errors[key]}</p>}
                  </div>
                );
              })}

              {/* Trennlinie zwischen Gruppen */}
              <div className="border-t border-white/5" />
            </div>
          );
        })}

        <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-2 text-xs text-cyan-400">
          Flatex: Die FinTS-PIN wird <strong>niemals gespeichert</strong> und muss direkt als
          Umgebungsvariable <code className="bg-white/5 px-1 rounded">FLATEX_FINTS_PIN</code> gesetzt werden.
        </div>

        <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 px-3 py-2 text-xs text-yellow-400">
          Demo-Daten werden automatisch genutzt, solange keine echten Credentials gesetzt sind.
          Klicke auf &quot;Broker &amp; Depots&quot; in der Navigation um die aktuelle Verbindungsübersicht zu sehen.
        </div>
      </div>
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
        <span className="ml-2 text-slate-600 font-normal">(im Browser gespeichert — nicht an Server gesendet)</span>
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? "Key eingeben..."}
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
          aria-label={visible ? "Key ausblenden" : "Key anzeigen"}
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
  const [marketingEmails, setMarketingEmails] = useState(true);
  const [emailPrefSaving, setEmailPrefSaving] = useState(false);

  useEffect(() => {
    setSettings(loadSettings());
    api.health.check()
      .then((h) => {
        const status = h.services?.["ANTHROPIC_API_KEY"] ?? "";
        setBackendKeyStatus(status === "configured" ? "configured" : "missing");
      })
      .catch(() => setBackendKeyStatus("missing"));
    api.auth.me()
      .then((u) => { setMarketingEmails(!u.email_unsubscribed); })
      .catch(() => {});
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

  async function handleEmailPref(subscribed: boolean) {
    setMarketingEmails(subscribed);
    setEmailPrefSaving(true);
    try {
      await api.auth.emailPreferences(subscribed);
    } catch {
      setMarketingEmails(!subscribed);
    } finally {
      setEmailPrefSaving(false);
    }
  }

  const sectionHeaderStyle = {
    background: "rgba(0,212,255,0.06)",
    borderBottom: "1px solid rgba(0,212,255,0.1)",
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <h1 className="text-2xl font-bold text-slate-100 mb-1">Einstellungen</h1>
        <p className="text-sm text-slate-500">
          API-Keys, Trading-Präferenzen und Benachrichtigungen konfigurieren.
          Alle Werte werden im Browser-localStorage gespeichert.
        </p>
      </motion.div>

      {/* ── Telegram Notifications ── */}
      <TelegramSection />

      {/* ── Section 1: API Configuration ── */}
      <GlassCard variant="cyan" delay={0.05}>
        <div className="-m-4 mb-4 px-4 py-3 rounded-t-xl" style={sectionHeaderStyle}>
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-cyan-400" aria-hidden="true" />
            <SectionLabel>API-Konfiguration</SectionLabel>
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
            <SectionLabel>Trading-Einstellungen</SectionLabel>
          </div>
        </div>

        <div className="space-y-5">
          {/* Watchlist */}
          <div>
            <label htmlFor="watchlist" className="text-xs text-slate-400 mb-1.5 block font-medium">
              Standard-Watchlist
              <span className="ml-2 text-slate-600 font-normal">kommagetrennte Ticker</span>
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
            <p className="text-xs text-slate-400 mb-2 font-medium">Aktualisierungsintervall</p>
            <div className="flex gap-2" role="group" aria-label="Aktualisierungsintervall">
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
            <p className="text-xs text-slate-400 mb-2 font-medium">Handelsmodus</p>
            <div className="flex gap-2" role="group" aria-label="Handelsmodus">
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
                  {mode === "paper" ? "Paper (Sim)" : "Live-Handel"}
                </button>
              ))}
            </div>
            {settings.tradingMode === "live" && (
              <p className="text-xs text-amber-500 mt-2">
                Live-Modus erfordert einen gültigen Alpaca API Key und ENABLE_LIVE_TRADING=true in der Server-.env.
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
            <SectionLabel>Benachrichtigungen</SectionLabel>
          </div>
        </div>

        <div className="divide-y divide-white/5">
          <Toggle
            id="risk-alerts"
            label="Risikoalarme"
            description="Benachrichtigung wenn Portfolio-VaR oder Drawdown Schwellenwerte überschreitet"
            checked={settings.riskAlerts}
            onChange={(v) => update("riskAlerts", v)}
          />
          <Toggle
            id="signal-notifications"
            label="Signal-Benachrichtigungen"
            description="Benachrichtigung bei neuen Kauf- / Starkem-Kauf-Signalen"
            checked={settings.signalNotifications}
            onChange={(v) => update("signalNotifications", v)}
          />
          <Toggle
            id="price-alerts"
            label="Kurs-Alerts"
            description="Benachrichtigung bei signifikanten Kursbewegungen in der Watchlist"
            checked={settings.priceAlerts}
            onChange={(v) => update("priceAlerts", v)}
          />
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              <Mail className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" aria-hidden="true" />
              <div>
                <label htmlFor="marketing-emails" className="text-sm text-slate-300 font-medium cursor-pointer">Marketing-E-Mails</label>
                <p className="text-xs text-slate-600 mt-0.5">
                  {emailPrefSaving
                    ? "Wird gespeichert…"
                    : "Produkt-Updates, neue Features und Trading-Insights per E-Mail (DSGVO Art. 21)"}
                </p>
              </div>
            </div>
            <button
              id="marketing-emails"
              role="switch"
              aria-checked={marketingEmails}
              aria-label="Marketing-E-Mails"
              disabled={emailPrefSaving}
              onClick={() => handleEmailPref(!marketingEmails)}
              className="relative flex-shrink-0 w-11 h-6 rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 disabled:opacity-50"
              style={{
                background: marketingEmails ? "rgba(0,212,255,0.4)" : "rgba(255,255,255,0.08)",
                border: marketingEmails ? "1px solid rgba(0,212,255,0.6)" : "1px solid rgba(255,255,255,0.12)",
              }}
            >
              <span
                className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform duration-200"
                style={{ transform: marketingEmails ? "translateX(20px)" : "translateX(0)" }}
              />
            </button>
          </div>
        </div>
      </GlassCard>

      {/* ── Section 4: P2P API Keys ── */}
      <P2PCredentialsSection />

      {/* ── Section 4b: Broker & Depots Credentials ── */}
      <BrokerCredentialsSection />

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
            <a href="/depot" className="text-cyan-400 underline">Nettovermögen</a>.
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
            <SectionLabel>Über</SectionLabel>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs text-slate-600 mb-0.5">Version</p>
            <p className="font-mono text-slate-300">v0.7.0</p>
          </div>
          <div>
            <p className="text-xs text-slate-600 mb-0.5">KI-Modell</p>
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
            <p className="text-xs text-slate-600 mb-0.5">Trading-Engines</p>
            <p className="text-slate-400 text-xs leading-relaxed">
              9 KI-Engines orchestriert — Installationspfade im Abschnitt Engine-Status
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
            Systemstatus
          </a>
        </div>
      </GlassCard>

      {/* ── Change Password ── */}
      <ChangePasswordSection />

      {/* Save button */}
      <div className="flex justify-end pb-6">
        <button
          onClick={handleSave}
          aria-label="Einstellungen speichern"
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all"
          style={{
            background: saved ? "rgba(0,255,136,0.15)" : "linear-gradient(135deg, rgba(0,212,255,0.2), rgba(123,47,255,0.15))",
            border: saved ? "1px solid rgba(0,255,136,0.4)" : "1px solid rgba(0,212,255,0.35)",
            color: saved ? "#00FF88" : "#00D4FF",
            boxShadow: saved ? "0 0 20px rgba(0,255,136,0.2)" : "0 0 20px rgba(0,212,255,0.15)",
          }}
        >
          {saved ? (
            <><CheckCircle className="w-4 h-4" aria-hidden="true" /> Gespeichert</>
          ) : (
            <><Save className="w-4 h-4" aria-hidden="true" /> Einstellungen speichern</>
          )}
        </button>
      </div>
    </div>
  );
}
