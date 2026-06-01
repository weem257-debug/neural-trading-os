"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { api, API_BASE, getAuthToken } from "@/lib/api";
import type { BacktestJob, BacktestStrategyEntry, BacktestCompareEntry, BacktestCompareResponse } from "@/types";
import {
  BarChart2, Loader2, Play, CheckCircle, XCircle, Clock,
  ChevronDown, TrendingUp, TrendingDown, Zap, RefreshCw, Download, Trash2,
} from "lucide-react";
import { GlassCard, SectionLabel, NeonBadge } from "@/components/ui/GlassCard";
import { ExplanationModal, InfoButton } from "@/components/ui/ExplanationModal";
import type { ExplanationContent } from "@/components/ui/ExplanationModal";
import {
  AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip,
} from "recharts";

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function JobStatusBadge({ status }: { status: BacktestJob["status"] }) {
  const config = {
    queued:    { color: "#64748B", bg: "rgba(100,116,139,0.12)",  label: "WARTEND",   icon: Clock },
    running:   { color: "#00D4FF", bg: "rgba(0,212,255,0.12)",    label: "LÄUFT",     icon: Loader2 },
    completed: { color: "#00FF88", bg: "rgba(0,255,136,0.12)",    label: "FERTIG",    icon: CheckCircle },
    failed:    { color: "#FF0080", bg: "rgba(255,0,128,0.12)",    label: "FEHLER",    icon: XCircle },
  };
  const c = config[status];
  const Icon = c.icon;
  return (
    <span
      className="flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full"
      style={{ background: c.bg, border: `1px solid ${c.color}30`, color: c.color }}
    >
      <Icon className={`w-3 h-3 ${status === "running" ? "animate-spin" : ""}`} />
      {c.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Result metric cards
// ---------------------------------------------------------------------------

function ResultMetrics({ result }: { result: NonNullable<BacktestJob["result"]> }) {
  const positive = result.total_return_pct >= 0;
  const metrics = [
    {
      label: "Gesamtrendite",
      value: `${positive ? "+" : ""}${result.total_return_pct.toFixed(2)}%`,
      color: positive ? "#00FF88" : "#FF0080",
    },
    {
      label: "Sharpe Ratio",
      value: result.sharpe_ratio.toFixed(2),
      color: "#00D4FF",
    },
    {
      label: "Max Drawdown",
      value: `-${result.max_drawdown_pct.toFixed(2)}%`,
      color: "#FF0080",
    },
    {
      label: "Trefferquote",
      value: `${(result.win_rate * 100).toFixed(1)}%`,
      color: "#00FF88",
    },
    {
      label: "Trades",
      value: result.total_trades.toString(),
      color: "#FFD700",
    },
    {
      label: "Jährl. Rendite",
      value: `${result.annualized_return_pct.toFixed(2)}%`,
      color: "#7B2FFF",
    },
  ];

  return (
    <div className="space-y-4">
      {/* KPI cards grid */}
      <div className="grid grid-cols-3 gap-3">
        {metrics.map(({ label, value, color }) => (
          <div
            key={label}
            className="rounded-xl p-3"
            style={{
              background: `${color}08`,
              border: `1px solid ${color}20`,
            }}
          >
            <p className="text-xs text-slate-500 mb-1">{label}</p>
            <p className="font-mono font-bold text-lg" style={{ color }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Equity curve */}
      {result.equity_curve && result.equity_curve.length > 1 && (
        <div>
          <p className="text-xs text-slate-500 mb-2">Equity-Kurve</p>
          <div style={{ height: "160px" }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={result.equity_curve}>
                <defs>
                  <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={positive ? "#00FF88" : "#FF0080"} stopOpacity="0.3" />
                    <stop offset="100%" stopColor={positive ? "#00FF88" : "#FF0080"} stopOpacity="0" />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={positive ? "#00FF88" : "#FF0080"}
                  fill="url(#eqGrad)"
                  strokeWidth={2}
                  dot={false}
                />
                <XAxis dataKey="date" hide />
                <YAxis hide />
                <Tooltip
                  contentStyle={{
                    background: "rgba(8,11,20,0.95)",
                    border: "1px solid rgba(0,212,255,0.3)",
                    borderRadius: "8px",
                    fontSize: "11px",
                  }}
                  formatter={(v: number) => [`$${v.toLocaleString()}`, "Wert"]}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Expandable job card
// ---------------------------------------------------------------------------

function JobCard({ job, index, onDelete }: { job: BacktestJob; index: number; onDelete: (id: string) => void }) {
  const [open, setOpen] = useState(index === 0);
  const [deleting, setDeleting] = useState(false);
  const positive = (job.result?.total_return_pct ?? 0) >= 0;

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    setDeleting(true);
    try {
      await api.backtest.deleteJob(job.id);
      onDelete(job.id);
    } catch {
      setDeleting(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
    >
      <div
        className="rounded-xl overflow-hidden cursor-pointer transition-all"
        style={{
          background: "linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))",
          border: `1px solid ${open ? "rgba(0,212,255,0.3)" : "rgba(255,255,255,0.07)"}`,
        }}
        onClick={() => setOpen(!open)}
      >
        {/* Header row */}
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs flex-shrink-0"
              style={{
                background: job.status === "completed" ? "rgba(0,255,136,0.12)" : "rgba(0,212,255,0.12)",
                color: job.status === "completed" ? "#00FF88" : "#00D4FF",
              }}
            >
              {job.request.ticker.slice(0, 3)}
            </div>
            <div>
              <p className="font-bold text-slate-200">{job.request.strategy_name}</p>
              <p className="text-xs text-slate-500">
                {job.request.ticker} · {job.request.engine} · {job.request.start_date} – {job.request.end_date}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {job.result && (
              <span
                className="text-sm font-bold font-mono"
                style={{ color: positive ? "#00FF88" : "#FF0080" }}
              >
                {positive ? "+" : ""}{job.result.total_return_pct.toFixed(2)}%
              </span>
            )}
            <JobStatusBadge status={job.status} />
            <button
              onClick={handleDelete}
              disabled={deleting}
              aria-label="Job löschen"
              className="p-1.5 rounded-lg transition-all opacity-40 hover:opacity-100 disabled:opacity-20"
              style={{ color: "#FF0080" }}
            >
              {deleting
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Trash2 className="w-3.5 h-3.5" />}
            </button>
            <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
              <ChevronDown className="w-4 h-4 text-slate-600" />
            </motion.div>
          </div>
        </div>

        {/* Expanded: result metrics */}
        {open && job.result && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            transition={{ duration: 0.25 }}
          >
            <div className="px-4 pb-4" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="pt-4">
                <ResultMetrics result={job.result} />
              </div>
            </div>
          </motion.div>
        )}

        {/* Expanded: error */}
        {open && job.error && (
          <div className="px-4 pb-4" style={{ borderTop: "1px solid rgba(255,0,128,0.2)" }}>
            <p className="text-sm text-red-400 mt-3 font-mono">{job.error}</p>
          </div>
        )}

        {/* Expanded: still running */}
        {open && job.status === "running" && !job.result && (
          <div className="px-4 pb-4 flex items-center gap-2 text-cyan-400 text-sm"
            style={{ borderTop: "1px solid rgba(0,212,255,0.1)" }}>
            <Loader2 className="w-4 h-4 animate-spin mt-4" />
            <span className="mt-4">Backtest läuft — aktualisiert alle 2 Sek.…</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

const EXPLAIN_BACKTEST: ExplanationContent = {
  title: "Backtesting",
  subtitle: "Historische Strategie-Simulation",
  color: "cyan",
  theory:
    "Backtesting simuliert eine Handelsstrategie auf historischen Daten, um zu messen wie sie in der Vergangenheit performt hätte. " +
    "Das System nutzt drei Engines: Jesse (Krypto, 300+ Indikatoren), Vibe-Trading (452 Alpha-Faktoren) und qlib (ML-basiert, Microsoft). " +
    "Wichtig: Vergangenheitsperformance garantiert keine zukünftigen Ergebnisse.",
  keyPoints: [
    "Total Return: Gesamtrendite der Strategie im Testzeitraum",
    "Sharpe Ratio: Rendite/Risiko — > 1.5 ist gut, > 2 sehr gut",
    "Max Drawdown: Größter Verlust vom Hoch — < 15% anstreben",
    "Win Rate: Prozent der gewinnbringenden Trades",
    "Overfitting-Risiko: Strategie die zu gut auf historische Daten passt, versagt oft live",
    "Walk-Forward Testing: Daten aufteilen in In-Sample + Out-of-Sample zur Validierung",
  ],
  practicalTip:
    "Mindest-Anforderungen an einen guten Backtest: Sharpe > 1.5, Drawdown < 20%, Win Rate > 45%, mindestens 50 Trades. " +
    "Teste immer auf einem Datensatz den die Strategie nicht 'gesehen' hat (Out-of-Sample Periode).",
};

export default function BacktestPage() {
  const [strategies, setStrategies] = useState<BacktestStrategyEntry[]>([]);
  const [jobs, setJobs] = useState<BacktestJob[]>([]);
  const [pollingIds, setPollingIds] = useState<Set<string>>(new Set());
  const pollIntervals = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  const [submitting, setSubmitting] = useState(false);
  const [comparing, setComparing]   = useState(false);
  const [compareResult, setCompareResult] = useState<BacktestCompareResponse | null>(null);
  const [runError, setRunError]      = useState<string | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [explainOpen, setExplainOpen] = useState(false);

  const [form, setForm] = useState({
    strategy_id: "ma_crossover",
    ticker: "BTC-USD",
    start_date: "2023-01-01",
    end_date: "2024-01-01",
    initial_capital: 100_000,
    engine: "jesse" as "jesse" | "vibe_trading" | "qlib",
    // MA Crossover params
    fast_period: 20,
    slow_period: 50,
    // RSI Mean Reversion params
    rsi_period: 14,
    oversold: 30,
    overbought: 70,
  });

  // -- Load strategies from backend --
  useEffect(() => {
    (async () => {
      try {
        const data: BacktestStrategyEntry[] = await api.backtest.strategies();
        setStrategies(data);
        if (data.length > 0) {
          setForm((f) => ({ ...f, strategy_id: data[0].id }));
        }
      } catch {
        // static fallback
        setStrategies([
          { id: "ma_crossover",       name: "MA Crossover",        description: "Golden/Death-Cross-Signal mit schnellem (20) und langsamem (50) gleitenden Durchschnitt.", engines: ["jesse", "vibe_trading", "qlib"], default_params: {}, params_schema: {} },
          { id: "rsi_mean_reversion", name: "RSI Mean Reversion",  description: "Kaufen wenn RSI < 30 (überverkauft), verkaufen wenn RSI > 70 (überkauft). Periode: 14.",      engines: ["jesse", "vibe_trading"],        default_params: {}, params_schema: {} },
          { id: "buy_and_hold",       name: "Buy & Hold",          description: "Baseline: Am ersten Tag kaufen, bis Enddatum halten. Kein Rebalancing.",                     engines: ["jesse", "vibe_trading", "qlib"], default_params: {}, params_schema: {} },
        ]);
      }
    })();
  }, []);

  // -- Load job list --
  const loadJobs = useCallback(async () => {
    try {
      const data: BacktestJob[] = await api.backtest.jobs();
      setJobs(data.slice().reverse()); // newest first
    } catch {}
  }, []);

  useEffect(() => {
    loadJobs();
    const iv = setInterval(loadJobs, 5_000);
    return () => clearInterval(iv);
  }, [loadJobs]);

  // -- Cleanup all poll intervals on unmount --
  useEffect(() => {
    return () => {
      pollIntervals.current.forEach(clearInterval);
      pollIntervals.current.clear();
    };
  }, []);

  // -- Poll a specific job until completed/failed --
  const pollJob = useCallback((job_id: string) => {
    if (pollIntervals.current.has(job_id)) return;
    setPollingIds((s) => new Set(s).add(job_id));
    const iv = setInterval(async () => {
      try {
        const job: BacktestJob = await api.backtest.job(job_id);
        setJobs((prev) =>
          prev.map((j) => (j.id === job_id ? job : j))
        );
        if (job.status === "completed" || job.status === "failed") {
          clearInterval(iv);
          pollIntervals.current.delete(job_id);
          setPollingIds((s) => {
            const next = new Set(s);
            next.delete(job_id);
            return next;
          });
        }
      } catch {
        clearInterval(iv);
        pollIntervals.current.delete(job_id);
      }
    }, 2_000);
    pollIntervals.current.set(job_id, iv);
  }, []);

  // -- Submit a new backtest --
  async function handleRun() {
    setSubmitting(true);
    setRunError(null);
    try {
      const selectedStrategy = strategies.find((s) => s.id === form.strategy_id);
      let customParams: Record<string, number> = selectedStrategy?.default_params ?? {};
      if (form.strategy_id === "ma_crossover") {
        customParams = { ...customParams, fast_period: form.fast_period, slow_period: form.slow_period };
      } else if (form.strategy_id === "rsi_mean_reversion") {
        customParams = { ...customParams, rsi_period: form.rsi_period, oversold: form.oversold, overbought: form.overbought };
      }
      const payload = {
        strategy_name: selectedStrategy?.name ?? form.strategy_id,
        ticker: form.ticker.toUpperCase(),
        start_date: form.start_date,
        end_date: form.end_date,
        initial_capital: form.initial_capital,
        engine: form.engine,
        params: customParams,
      };
      const { job_id } = await api.backtest.run(payload);

      const optimistic: BacktestJob = {
        id: job_id,
        status: "queued",
        request: payload,
        created_at: new Date().toISOString(),
        result: null,
        error: null,
      } as unknown as BacktestJob;
      setJobs((prev) => [optimistic, ...prev]);
      pollJob(job_id);
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "Backtest fehlgeschlagen");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCompare() {
    setComparing(true);
    setCompareResult(null);
    setCompareError(null);
    try {
      const data = await api.backtest.compare({
        ticker:     form.ticker.toUpperCase(),
        period:     "1y",
        strategies: ["ma_crossover", "rsi_mean_reversion", "buy_and_hold"],
      });
      setCompareResult(data);
    } catch (err) {
      setCompareError(err instanceof Error ? err.message : "Vergleich fehlgeschlagen");
    } finally {
      setComparing(false);
    }
  }

  const fieldStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "12px",
    color: "#E2E8F0",
    padding: "10px 16px",
    fontSize: "14px",
    outline: "none",
    width: "100%",
    fontFamily: "JetBrains Mono, monospace",
  };

  const activePollingCount = pollingIds.size;

  return (
    <div className="space-y-5">
      {/* Page header */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: "rgba(0,212,255,0.15)", border: "1px solid rgba(0,212,255,0.3)" }}
            >
              <BarChart2 className="w-4 h-4 text-cyan-400" />
            </div>
            <h1 className="text-2xl font-bold text-slate-100">Backtesting</h1>
            <NeonBadge color="cyan">{jobs.length} jobs</NeonBadge>
            {activePollingCount > 0 && (
              <NeonBadge color="purple">
                <RefreshCw className="w-3 h-3 animate-spin inline mr-1" />
                {activePollingCount} polling
              </NeonBadge>
            )}
          </div>
          {jobs.some((j) => j.status === "completed") && (
            <button
              onClick={async () => {
                const completedJob = jobs.find((j) => j.status === "completed");
                if (!completedJob) return;
                try {
                  const token = getAuthToken();
                  const res = await fetch(`${API_BASE}/api/backtest/export/${completedJob.id}`, {
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                  });
                  if (!res.ok) throw new Error(`HTTP ${res.status}`);
                  const blob = await res.blob();
                  const objectUrl = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = objectUrl;
                  a.download = `backtest_${completedJob.id.slice(0, 8)}.csv`;
                  a.click();
                  URL.revokeObjectURL(objectUrl);
                } catch (e) {
                  console.error("[Backtest] CSV export failed:", e);
                }
              }}
              aria-label="Letzten abgeschlossenen Backtest als CSV exportieren"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
              style={{
                background: "rgba(0,212,255,0.08)",
                border: "1px solid rgba(0,212,255,0.25)",
                color: "#00D4FF",
              }}
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              Export CSV
            </button>
          )}
        </div>
        <p className="text-sm text-slate-500">
          Jesse (crypto · 300+ indicators) · Vibe-Trading (452 alpha factors) · qlib (ML)
        </p>
      </motion.div>

      {/* New backtest form */}
      <GlassCard variant="cyan" delay={0.1}>
        <div className="flex items-center justify-between">
          <SectionLabel>Neuer Backtest</SectionLabel>
          <InfoButton onClick={() => setExplainOpen(true)} color="cyan" className="-mt-2" />
        </div>
        <div className="grid grid-cols-3 gap-3 mt-3">

          {/* Strategy dropdown — loaded from API */}
          <div>
            <label className="text-xs text-slate-500 mb-1.5 block">Strategie</label>
            <select
              value={form.strategy_id}
              onChange={(e) => setForm((f) => ({ ...f, strategy_id: e.target.value }))}
              style={{ ...fieldStyle, cursor: "pointer" }}
            >
              {strategies.map((s) => (
                <option key={s.id} value={s.id} style={{ background: "#0D1117" }}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Ticker */}
          <div>
            <label className="text-xs text-slate-500 mb-1.5 block">Ticker</label>
            <input
              type="text"
              value={form.ticker}
              onChange={(e) => setForm((f) => ({ ...f, ticker: e.target.value }))}
              style={fieldStyle}
              placeholder="e.g. BTC-USD"
            />
          </div>

          {/* Start date */}
          <div>
            <label className="text-xs text-slate-500 mb-1.5 block">Startdatum</label>
            <input
              type="date"
              value={form.start_date}
              onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
              style={fieldStyle}
            />
          </div>

          {/* End date */}
          <div>
            <label className="text-xs text-slate-500 mb-1.5 block">Enddatum</label>
            <input
              type="date"
              value={form.end_date}
              onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
              style={fieldStyle}
            />
          </div>

          {/* Capital */}
          <div>
            <label className="text-xs text-slate-500 mb-1.5 block">Startkapital ($)</label>
            <input
              type="number"
              value={form.initial_capital}
              onChange={(e) => setForm((f) => ({ ...f, initial_capital: +e.target.value }))}
              style={fieldStyle}
            />
          </div>

          {/* Engine */}
          <div>
            <label className="text-xs text-slate-500 mb-1.5 block">Engine</label>
            <select
              value={form.engine}
              onChange={(e) => setForm((f) => ({ ...f, engine: e.target.value as typeof form.engine }))}
              style={{ ...fieldStyle, cursor: "pointer" }}
            >
              <option value="jesse"        style={{ background: "#0D1117" }}>Jesse (Krypto)</option>
              <option value="vibe_trading" style={{ background: "#0D1117" }}>Vibe-Trading (452 Alpha)</option>
              <option value="qlib"         style={{ background: "#0D1117" }}>qlib (ML · Microsoft)</option>
            </select>
          </div>
        </div>

        {/* MA Crossover custom parameter inputs */}
        {form.strategy_id === "ma_crossover" && (
          <div className="grid grid-cols-2 gap-3 mt-3 pt-3" style={{ borderTop: "1px solid rgba(0,212,255,0.08)" }}>
            <div>
              <label className="text-xs text-slate-500 mb-1.5 block">
                Kurze Periode <span className="text-slate-700">(5–100, Standard 20)</span>
              </label>
              <input
                type="number"
                min={5}
                max={100}
                value={form.fast_period}
                onChange={(e) => setForm((f) => ({ ...f, fast_period: Math.max(5, Math.min(100, +e.target.value)) }))}
                style={fieldStyle}
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1.5 block">
                Lange Periode <span className="text-slate-700">(10–200, Standard 50)</span>
              </label>
              <input
                type="number"
                min={10}
                max={200}
                value={form.slow_period}
                onChange={(e) => setForm((f) => ({ ...f, slow_period: Math.max(10, Math.min(200, +e.target.value)) }))}
                style={fieldStyle}
              />
            </div>
            {form.fast_period >= form.slow_period && (
              <p className="col-span-2 text-xs text-red-400">
                Kurze Periode muss kleiner als Lange Periode sein.
              </p>
            )}
          </div>
        )}

        {/* RSI Mean Reversion custom parameter inputs */}
        {form.strategy_id === "rsi_mean_reversion" && (
          <div className="grid grid-cols-3 gap-3 mt-3 pt-3" style={{ borderTop: "1px solid rgba(0,212,255,0.08)" }}>
            <div>
              <label className="text-xs text-slate-500 mb-1.5 block">
                RSI-Periode <span className="text-slate-700">(5–50, Standard 14)</span>
              </label>
              <input
                type="number"
                min={5}
                max={50}
                value={form.rsi_period}
                onChange={(e) => setForm((f) => ({ ...f, rsi_period: Math.max(5, Math.min(50, +e.target.value)) }))}
                style={fieldStyle}
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1.5 block">
                Überverkauft <span className="text-slate-700">(10–45, Standard 30)</span>
              </label>
              <input
                type="number"
                min={10}
                max={45}
                value={form.oversold}
                onChange={(e) => setForm((f) => ({ ...f, oversold: Math.max(10, Math.min(45, +e.target.value)) }))}
                style={fieldStyle}
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1.5 block">
                Überkauft <span className="text-slate-700">(55–90, Standard 70)</span>
              </label>
              <input
                type="number"
                min={55}
                max={90}
                value={form.overbought}
                onChange={(e) => setForm((f) => ({ ...f, overbought: Math.max(55, Math.min(90, +e.target.value)) }))}
                style={fieldStyle}
              />
            </div>
          </div>
        )}

        {/* Strategy description */}
        {strategies.find((s) => s.id === form.strategy_id)?.description && (
          <p className="mt-2 text-xs text-slate-500 italic">
            {strategies.find((s) => s.id === form.strategy_id)!.description}
          </p>
        )}

        <div className="mt-4 flex flex-col gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={handleRun}
              disabled={submitting || comparing || (form.strategy_id === "ma_crossover" && form.fast_period >= form.slow_period)}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold disabled:opacity-50 transition-all"
              style={{
                background: "linear-gradient(135deg, rgba(0,212,255,0.25), rgba(123,47,255,0.15))",
                border: "1px solid rgba(0,212,255,0.4)",
                color: "#00D4FF",
                boxShadow: "0 0 20px rgba(0,212,255,0.2)",
              }}
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {submitting ? "Wird gestartet…" : "Backtest starten"}
            </button>

            <button
              onClick={handleCompare}
              disabled={submitting || comparing}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold disabled:opacity-50 transition-all"
              style={{
                background: comparing ? "rgba(0,255,136,0.06)" : "rgba(0,255,136,0.12)",
                border: "1px solid rgba(0,255,136,0.35)",
                color: "#00FF88",
              }}
            >
              {comparing
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Comparing…</>
                : <><Zap className="w-4 h-4" /> Alle Strategien vergleichen</>
              }
            </button>
          </div>

          {runError && (
            <p className="text-xs text-red-400 flex items-center gap-1.5">
              <XCircle className="w-3.5 h-3.5 flex-shrink-0" />{runError}
            </p>
          )}
          {compareError && (
            <p className="text-xs text-red-400 flex items-center gap-1.5">
              <XCircle className="w-3.5 h-3.5 flex-shrink-0" />{compareError}
            </p>
          )}
        </div>

        {/* Strategy comparison table */}
        {compareResult && (
          <div className="mt-5">
            <p className="text-xs text-slate-500 mb-3">
              Strategie-Vergleich — {compareResult.ticker} · 1 Jahr · sortiert nach Rendite
            </p>
            <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid rgba(255,255,255,0.07)" }}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                    {["Strategie", "Rendite %", "Sharpe", "Drawdown %", "Trades"].map((h) => (
                      <th key={h} className="px-4 py-2 text-left text-xs text-slate-500 font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {compareResult.results.map((row) => (
                    <tr
                      key={row.strategy}
                      style={
                        row.is_best
                          ? { background: "rgba(0,212,255,0.06)", border: "1px solid rgba(0,212,255,0.25)" }
                          : { borderBottom: "1px solid rgba(255,255,255,0.04)" }
                      }
                    >
                      <td className="px-4 py-2.5 font-mono text-xs font-bold" style={{ color: row.is_best ? "#00D4FF" : "#CBD5E1" }}>
                        {row.strategy}
                        {row.is_best && (
                          <span className="ml-2 text-xs px-1.5 py-0.5 rounded" style={{ background: "rgba(0,212,255,0.15)", color: "#00D4FF", fontSize: "9px" }}>
                            BEST
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs font-bold" style={{ color: row.return_pct >= 0 ? "#00FF88" : "#FF0080" }}>
                        {row.return_pct >= 0 ? "+" : ""}{row.return_pct.toFixed(2)}%
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-300">{row.sharpe.toFixed(3)}</td>
                      <td className="px-4 py-2.5 font-mono text-xs" style={{ color: "#FF6098" }}>-{row.drawdown.toFixed(2)}%</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-400">{row.trades}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </GlassCard>

      {/* Engine info cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { name: "Jesse",        sub: "300+ Krypto-Indikatoren",  color: "#00D4FF", icon: TrendingUp,   tag: "Crypto" },
          { name: "Vibe-Trading", sub: "452 Alpha-Faktoren",       color: "#7B2FFF", icon: Zap,          tag: "Quant" },
          { name: "qlib (ML)",    sub: "Microsoft KI-Framework",   color: "#00FF88", icon: TrendingDown, tag: "ML" },
        ].map(({ name, sub, color, icon: Icon, tag }, i) => (
          <motion.div
            key={name}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + i * 0.06 }}
            className="rounded-xl p-3 flex items-center gap-3"
            style={{ background: `${color}08`, border: `1px solid ${color}20` }}
          >
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: `${color}15`, border: `1px solid ${color}30` }}
            >
              <Icon className="w-4 h-4" style={{ color }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-200">{name}</p>
              <p className="text-xs text-slate-500">{sub}</p>
            </div>
            <span
              className="text-xs font-bold px-2 py-0.5 rounded"
              style={{ background: `${color}15`, color, border: `1px solid ${color}30` }}
            >
              {tag}
            </span>
          </motion.div>
        ))}
      </div>

      {/* Job list */}
      <div className="space-y-3">
        <SectionLabel>Backtest Jobs ({jobs.length})</SectionLabel>
        {jobs.length === 0 ? (
          <GlassCard className="text-center py-12">
            <BarChart2 className="w-10 h-10 mx-auto mb-3 text-slate-700" />
            <p className="text-slate-500">Noch keine Backtest-Jobs</p>
            <p className="text-sm text-slate-600 mt-1">Konfiguriere und starte deinen ersten Backtest oben</p>
          </GlassCard>
        ) : (
          jobs.map((j, i) => (
            <JobCard
              key={j.id}
              job={j}
              index={i}
              onDelete={(id) => setJobs((prev) => prev.filter((x) => x.id !== id))}
            />
          ))
        )}
      </div>

      <ExplanationModal
        open={explainOpen}
        onClose={() => setExplainOpen(false)}
        content={EXPLAIN_BACKTEST}
      />
    </div>
  );
}
