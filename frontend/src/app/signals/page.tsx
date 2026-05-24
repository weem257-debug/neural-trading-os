"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api, API_BASE } from "@/lib/api";
import { useTradingStore } from "@/store/tradingStore";
import type { TradingSignal, SignalPerformanceResponse } from "@/types";
import {
  TrendingUp, TrendingDown, Minus, Loader2, Brain,
  ChevronDown, Clock, Target, AlertTriangle, Zap, Download, ScanSearch, X, CheckSquare, Square,
} from "lucide-react";
import { GlassCard, SectionLabel, NeonBadge } from "@/components/ui/GlassCard";
import { ExplanationModal, InfoButton } from "@/components/ui/ExplanationModal";
import type { ExplanationContent } from "@/components/ui/ExplanationModal";
import CandlestickChart from "@/components/charts/CandlestickChart";
import { notify } from "@/store/notificationStore";

/* ---- Direction config ---- */
const dirConfig = {
  STRONG_BUY:  { label: "Strong Buy",  short: "S.BUY", color: "#00FF88", bg: "rgba(0,255,136,0.15)", border: "rgba(0,255,136,0.4)", glow: "rgba(0,255,136,0.3)" },
  BUY:         { label: "Buy",         short: "BUY",   color: "#00DD77", bg: "rgba(0,255,136,0.08)", border: "rgba(0,255,136,0.2)", glow: "rgba(0,255,136,0.15)" },
  HOLD:        { label: "Hold",        short: "HOLD",  color: "#FFD700", bg: "rgba(255,215,0,0.08)", border: "rgba(255,215,0,0.25)", glow: "rgba(255,215,0,0.15)" },
  SELL:        { label: "Sell",        short: "SELL",  color: "#FF6098", bg: "rgba(255,0,128,0.08)", border: "rgba(255,0,128,0.2)", glow: "rgba(255,0,128,0.15)" },
  STRONG_SELL: { label: "Strong Sell", short: "S.SELL",color: "#FF0080", bg: "rgba(255,0,128,0.15)", border: "rgba(255,0,128,0.4)", glow: "rgba(255,0,128,0.3)" },
};

/* ---- Agent consensus gauge ---- */
const DIRECTION_SCORES: Record<string, number> = {
  STRONG_BUY: 0.95, BUY: 0.75, HOLD: 0.50, SELL: 0.25, STRONG_SELL: 0.05,
};

function AgentGauge({ name, view, color }: { name: string; view: string; color: string }) {
  const upper = view.toUpperCase().replace(/\s+/g, "_");
  const score = DIRECTION_SCORES[upper] ?? (view ? 0.5 : 0.5);
  const pct = score * 100;

  return (
    <div
      className="flex flex-col items-center p-3 rounded-xl"
      style={{ background: `${color}08`, border: `1px solid ${color}25` }}
    >
      <div className="relative w-16 h-16 mb-2">
        <svg viewBox="0 0 64 64" className="w-full h-full -rotate-90">
          <circle cx="32" cy="32" r="26" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
          <circle
            cx="32" cy="32" r="26" fill="none"
            stroke={color} strokeWidth="6" strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 26 * score} ${2 * Math.PI * 26 * (1 - score)}`}
            style={{ filter: `drop-shadow(0 0 4px ${color})`, transition: "stroke-dasharray 1s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs font-bold font-mono" style={{ color }}>{pct.toFixed(0)}%</span>
        </div>
      </div>
      <p className="text-xs font-semibold text-slate-300 text-center leading-tight">{name}</p>
      {view && (
        <p className="text-xs text-slate-500 text-center mt-1 leading-tight line-clamp-2">{view}</p>
      )}
    </div>
  );
}

/* ---- Confidence bar ---- */
function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 75 ? "#00FF88" : pct >= 50 ? "#FFD700" : "#FF0080";
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-500">Signal Strength</span>
        <span className="font-mono font-bold" style={{ color }}>{pct}%</span>
      </div>
      <div className="relative h-2 bg-white/5 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="h-full rounded-full"
          style={{ background: `linear-gradient(90deg, ${color}80, ${color})`, boxShadow: `0 0 8px ${color}` }}
        />
        {/* Shimmer */}
        <div
          className="absolute inset-y-0 w-8 rounded-full pointer-events-none"
          style={{
            left: `${Math.max(0, pct - 5)}%`,
            background: `linear-gradient(90deg, transparent, ${color}50, transparent)`,
            animation: "data-stream 2s linear infinite",
          }}
        />
      </div>
    </div>
  );
}

/* ---- Signal Card ---- */
function SignalCard({ signal, index }: { signal: TradingSignal; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const [executing, setExecuting] = useState(false);
  const cfg = dirConfig[signal.direction] ?? dirConfig.HOLD;
  const agentNames = ["Fundamentals", "Sentiment", "Technical", "News", "Risk Mgr"];
  const agentColors = ["#00D4FF", "#00FF88", "#7B2FFF", "#FFD700", "#FF0080"];

  async function executeOrder(side: "buy" | "sell", e: React.MouseEvent) {
    e.stopPropagation(); // prevent card expand toggle
    if (executing) return;
    setExecuting(true);
    try {
      const result = await api.execution.submitOrder({
        ticker: signal.ticker,
        side,
        quantity: 1,
        order_type: "market",
        note: `Signal ${signal.id} — ${signal.direction} @ confidence ${(signal.confidence * 100).toFixed(0)}%`,
      });
      notify.success(
        `Order submitted — ${signal.ticker}`,
        `${side.toUpperCase()} 1 share · Status: ${result.status} · ID: ${result.order_id.slice(0, 8)}`,
        6000,
      );
    } catch (err) {
      notify.error(
        "Order failed",
        err instanceof Error ? err.message : "Could not submit order — check execution mode",
        5000,
      );
    } finally {
      setExecuting(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.4 }}
    >
      <div
        className="relative overflow-hidden rounded-xl transition-all duration-200 cursor-pointer"
        style={{
          background: "linear-gradient(135deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))",
          border: `1px solid ${cfg.border}`,
          boxShadow: expanded ? `0 0 30px ${cfg.glow}, 0 8px 32px rgba(0,0,0,0.4)` : `0 8px 32px rgba(0,0,0,0.3)`,
        }}
        onClick={() => setExpanded(!expanded)}
      >
        {/* Corner accent */}
        <div
          className="absolute top-0 right-0 w-32 h-32 pointer-events-none"
          style={{ background: `radial-gradient(circle, ${cfg.glow} 0%, transparent 70%)`, transform: "translate(30%, -30%)" }}
        />

        <div className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* Ticker badge */}
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-sm"
                style={{ background: `${cfg.bg}`, border: `1px solid ${cfg.border}`, color: cfg.color, textShadow: `0 0 8px ${cfg.color}` }}
              >
                {signal.ticker.slice(0, 4)}
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-lg font-bold text-slate-100">{signal.ticker}</h3>
                  <span
                    className="text-xs px-2.5 py-1 rounded-full font-bold"
                    style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color, textShadow: `0 0 6px ${cfg.color}` }}
                  >
                    {cfg.label.toUpperCase()}
                  </span>
                </div>
                <p className="text-xs text-slate-500">{signal.source} · {new Date(signal.generated_at).toLocaleTimeString()}</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="text-right">
                {signal.price_target && (
                  <p className="text-xs text-slate-500">Target: <span className="font-mono font-bold text-neon-green">${signal.price_target}</span></p>
                )}
                {signal.stop_loss && (
                  <p className="text-xs text-slate-500">Stop: <span className="font-mono font-bold text-neon-pink">${signal.stop_loss}</span></p>
                )}
              </div>
              <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
                <ChevronDown className="w-4 h-4 text-slate-600" />
              </motion.div>
            </div>
          </div>

          {/* Confidence bar always visible */}
          <div className="mt-3">
            <ConfidenceBar value={signal.confidence} />
          </div>
        </div>

        {/* Expanded content */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <div
                className="px-4 pb-4 space-y-4"
                style={{ borderTop: `1px solid ${cfg.border}30` }}
              >
                {/* Reasoning */}
                {signal.reasoning && (
                  <div className="pt-4">
                    <p className="section-label mb-2">AI Reasoning</p>
                    <p
                      className="text-sm text-slate-300 leading-relaxed p-3 rounded-lg"
                      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
                    >
                      {signal.reasoning}
                    </p>
                  </div>
                )}

                {/* Agent Consensus Gauges */}
                {signal.agents_consensus && Object.keys(signal.agents_consensus).length > 0 ? (
                  <div>
                    <p className="section-label mb-3">Agent Consensus</p>
                    <div className="grid grid-cols-5 gap-2">
                      {Object.entries(signal.agents_consensus).map(([agent, view], i) => (
                        <AgentGauge
                          key={agent}
                          name={agent}
                          view={String(view)}
                          color={agentColors[i % agentColors.length]}
                        />
                      ))}
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="section-label mb-3">Agent Consensus <span className="text-slate-600 text-xs font-normal">(Demo)</span></p>
                    <div className="grid grid-cols-5 gap-2">
                      {agentNames.map((name, i) => (
                        <AgentGauge key={name} name={name} view="" color={agentColors[i]} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Meta info */}
                <div className="flex items-center gap-4 text-xs text-slate-500">
                  {signal.time_horizon && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {signal.time_horizon}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Brain className="w-3.5 h-3.5" />
                    {signal.source}
                  </span>
                </div>

                {/* Action buttons */}
                <div className="flex gap-3 pt-1">
                  {(signal.direction === "BUY" || signal.direction === "STRONG_BUY") && (
                    <button
                      onClick={(e) => executeOrder("buy", e)}
                      disabled={executing}
                      className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-60"
                      style={{
                        background: "rgba(0,255,136,0.15)",
                        border: "1px solid rgba(0,255,136,0.4)",
                        color: "#00FF88",
                        boxShadow: "0 0 15px rgba(0,255,136,0.2)",
                      }}
                    >
                      {executing ? (
                        <Loader2 className="w-4 h-4 inline mr-2 animate-spin" />
                      ) : (
                        <TrendingUp className="w-4 h-4 inline mr-2" />
                      )}
                      Execute BUY
                    </button>
                  )}
                  {(signal.direction === "SELL" || signal.direction === "STRONG_SELL") && (
                    <button
                      onClick={(e) => executeOrder("sell", e)}
                      disabled={executing}
                      className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-60"
                      style={{
                        background: "rgba(255,0,128,0.15)",
                        border: "1px solid rgba(255,0,128,0.4)",
                        color: "#FF0080",
                        boxShadow: "0 0 15px rgba(255,0,128,0.2)",
                      }}
                    >
                      {executing ? (
                        <Loader2 className="w-4 h-4 inline mr-2 animate-spin" />
                      ) : (
                        <TrendingDown className="w-4 h-4 inline mr-2" />
                      )}
                      Execute SELL
                    </button>
                  )}
                  {signal.direction === "HOLD" && (
                    <button
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 py-2.5 rounded-xl text-sm font-bold cursor-default"
                      style={{
                        background: "rgba(255,215,0,0.08)",
                        border: "1px solid rgba(255,215,0,0.25)",
                        color: "#FFD700",
                      }}
                    >
                      <Minus className="w-4 h-4 inline mr-2" />
                      Hold Position
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

type DirectionFilter = "ALL" | "BUY" | "SELL" | "HOLD";

function PerformanceStrip({ perf }: { perf: SignalPerformanceResponse }) {
  if (perf.total_evaluated === 0) return null;
  const avgPct = (perf.avg_return * 100).toFixed(2);
  const winPct = (perf.win_rate * 100).toFixed(0);
  const avgColor = perf.avg_return >= 0 ? "#00FF88" : "#FF0080";
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-4 px-4 py-2.5 rounded-xl text-xs overflow-x-auto"
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      <span className="text-slate-500 whitespace-nowrap">AI Performance ({perf.total_evaluated} evaluated)</span>
      <span className="flex items-center gap-1 whitespace-nowrap">
        <span className="text-slate-500">Avg Return</span>
        <span className="font-mono font-bold" style={{ color: avgColor }}>{perf.avg_return >= 0 ? "+" : ""}{avgPct}%</span>
      </span>
      <span className="flex items-center gap-1 whitespace-nowrap">
        <span className="text-slate-500">Win Rate</span>
        <span className="font-mono font-bold text-cyan-400">{winPct}%</span>
      </span>
      {perf.best_signal && (
        <span className="flex items-center gap-1 whitespace-nowrap">
          <span className="text-slate-500">Best</span>
          <span className="font-mono font-bold text-neon-green">{perf.best_signal.ticker}</span>
          <span className="font-mono text-neon-green">+{(perf.best_signal.return_pct * 100).toFixed(1)}%</span>
        </span>
      )}
      {perf.worst_signal && (
        <span className="flex items-center gap-1 whitespace-nowrap">
          <span className="text-slate-500">Worst</span>
          <span className="font-mono font-bold text-neon-pink">{perf.worst_signal.ticker}</span>
          <span className="font-mono text-neon-pink">{(perf.worst_signal.return_pct * 100).toFixed(1)}%</span>
        </span>
      )}
    </motion.div>
  );
}

const EXPLAIN_SIGNALS_PAGE: ExplanationContent = {
  title: "KI-Handelssignale",
  subtitle: "Multi-Agent Signal-Generierung",
  color: "green",
  theory:
    "Das System generiert Handelssignale durch Konsens von 5 spezialisierten KI-Agenten: " +
    "Fundamental (KGV, Umsatzwachstum), Sentiment (News, Social), Technical (RSI, MACD, Elliott), " +
    "Macro (Zinsen, Inflation) und Risk Manager. Jeder Agent gibt ein gewichtetes Vote ab — " +
    "das finale Signal entsteht durch Mehrheitsentscheid mit Konfidenz-Score.",
  keyPoints: [
    "STRONG_BUY: ≥4 von 5 Agenten positiv, Konfidenz typisch > 85%",
    "BUY: Mehrheit positiv, Konfidenz 65–85%",
    "HOLD: Agenten uneinig, kein klarer Trend",
    "SELL / STRONG_SELL: Mehrheit oder alle Agenten negativ",
    "Konfidenz unter 60%: Signal mit erhöhter Vorsicht verwenden",
    "Price Target und Stop-Loss basieren auf technischer Analyse",
  ],
  practicalTip:
    "Signale sind Entscheidungshilfen, keine Garantien. " +
    "Am stärksten sind Signale mit Konfidenz > 80% UND Bestätigung durch mehrere Agenten (Agents Consensus). " +
    "Immer Stop-Loss setzen — idealerweise 2–5% unter Einstiegspreis.",
};

/* ============================================================ */
export default function SignalsPage() {
  const [ticker, setTicker] = useState("AAPL");
  const [fastMode, setFastMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [explainOpen, setExplainOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newSignalPulse, setNewSignalPulse] = useState(false);
  const [perf, setPerf] = useState<SignalPerformanceResponse | null>(null);
  const [isApiOnline, setIsApiOnline] = useState(false);
  const { signals, addSignal, setSignals } = useTradingStore();
  const inputRef = useRef<HTMLInputElement>(null);

  // Search & filter state
  const [searchTicker, setSearchTicker]   = useState("");
  const [dirFilter, setDirFilter]         = useState<DirectionFilter>("ALL");
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Batch scan state
  const BATCH_TICKERS = ["AAPL", "MSFT", "NVDA", "TSLA", "AMD", "META", "GOOGL", "AMZN"];
  const [batchModalOpen, setBatchModalOpen]   = useState(false);
  const [batchSelected, setBatchSelected]     = useState<string[]>(["AAPL", "MSFT", "NVDA"]);
  const [batchLoading, setBatchLoading]       = useState(false);
  const [batchProgress, setBatchProgress]     = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    api.signals.performance()
      .then((data) => { setPerf(data); setIsApiOnline(true); })
      .catch(() => setIsApiOnline(false));
    if (signals.length === 0) {
      api.signals.list()
        .then((data) => { if (data.length > 0) setSignals(data); })
        .catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleBatchTicker(t: string) {
    setBatchSelected((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
    );
  }

  async function handleBatchScan() {
    if (batchSelected.length === 0) return;
    setBatchLoading(true);
    setBatchProgress({ done: 0, total: batchSelected.length });
    try {
      const results = await api.signals.batch(batchSelected);
      results.forEach((s) => addSignal(s));
      setBatchProgress({ done: batchSelected.length, total: batchSelected.length });
      triggerPulse();
      setTimeout(() => {
        setBatchModalOpen(false);
        setBatchProgress(null);
      }, 800);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Batch scan failed");
    } finally {
      setBatchLoading(false);
    }
  }

  /** Trigger a brief neon-pulse animation on the signal list heading */
  function triggerPulse() {
    setNewSignalPulse(true);
    setTimeout(() => setNewSignalPulse(false), 2000);
  }

  async function handleGenerate() {
    if (!ticker.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const signal = await api.signals.generate({
        ticker: ticker.trim().toUpperCase(),
        fast_mode: fastMode,
      });
      addSignal(signal);
      triggerPulse();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Signal generation failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleDemo() {
    setDemoLoading(true);
    setError(null);
    try {
      const signal = await api.signals.demo(ticker.trim() || undefined);
      addSignal(signal);
      triggerPulse();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Demo signal failed");
    } finally {
      setDemoLoading(false);
    }
  }

  async function handleExportCsv() {
    try {
      const res = await fetch(
        `${API_BASE}/api/signals/export?format=csv`,
        { method: "GET" }
      );
      if (!res.ok) throw new Error(`Export failed: ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "signals.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "CSV export failed");
    }
  }

  const filteredSignals = useMemo(() => signals.filter((s) => {
    const tickerMatch = !searchTicker || s.ticker.includes(searchTicker.toUpperCase().trim());
    const dir = s.direction as string;
    const dirMatch =
      dirFilter === "ALL" ||
      dir === dirFilter ||
      (dirFilter === "BUY"  && (dir === "BUY"  || dir === "STRONG_BUY"))  ||
      (dirFilter === "SELL" && (dir === "SELL" || dir === "STRONG_SELL"));
    return tickerMatch && dirMatch;
  }), [signals, searchTicker, dirFilter]);

  return (
    <div className="space-y-5">
      {/* Candlestick Chart — large panel at top */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <CandlestickChart defaultTicker="AAPL" controlledTicker={ticker} height={340} />
      </motion.div>

      {/* Header */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: "rgba(0,255,136,0.15)", border: "1px solid rgba(0,255,136,0.3)" }}
            >
              <Brain className="w-4 h-4" style={{ color: "#00FF88" }} />
            </div>
            <h1 className="text-2xl font-bold text-slate-100">AI Signals</h1>
            <NeonBadge color="green">{signals.length} generated</NeonBadge>
            {isApiOnline ? (
              <NeonBadge color="cyan">LIVE</NeonBadge>
            ) : (
              <span className="text-xs font-bold px-2.5 py-1 rounded-full"
                style={{ background: "rgba(100,116,139,0.12)", border: "1px solid rgba(100,116,139,0.3)", color: "#64748B" }}>
                DEMO
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Batch Scan Button */}
            <button
              onClick={() => setBatchModalOpen(true)}
              aria-label="Batch scan multiple tickers"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
              style={{
                background: "rgba(123,47,255,0.12)",
                border: "1px solid rgba(123,47,255,0.35)",
                color: "#A855F7",
              }}
            >
              <ScanSearch className="w-3.5 h-3.5" aria-hidden="true" />
              Batch Scan
            </button>

            {signals.length > 0 && (
              <button
                onClick={handleExportCsv}
                aria-label="Export signals as CSV"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
                style={{
                  background: "rgba(0,255,136,0.08)",
                  border: "1px solid rgba(0,255,136,0.25)",
                  color: "#00FF88",
                }}
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                Export CSV
              </button>
            )}
          </div>
        </div>
        <p className="text-sm text-slate-500">
          Multi-agent analysis — Fundamentals · Sentiment · Technical · News · Risk
        </p>
      </motion.div>

      {/* Performance strip — shows only when backend has evaluated signals */}
      {perf && <PerformanceStrip perf={perf} />}

      {/* Generator Panel */}
      <GlassCard variant="green" delay={0.1}>
        <div className="flex items-center justify-between">
          <SectionLabel>Generate Signal</SectionLabel>
          <InfoButton onClick={() => setExplainOpen(true)} color="green" className="-mt-2" />
        </div>
        <div className="flex gap-3 items-end mt-3">
          <div className="flex-1">
            <label className="text-xs text-slate-500 mb-1.5 block">Ticker Symbol</label>
            <input
              ref={inputRef}
              type="text"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
              placeholder="AAPL · TSLA · BTC · NVDA"
              className="w-full rounded-xl px-4 py-2.5 text-sm font-mono text-slate-200 placeholder-slate-600 outline-none transition-all"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(0,255,136,0.2)",
              }}
              onFocus={(e) => { e.target.style.borderColor = "rgba(0,255,136,0.5)"; e.target.style.boxShadow = "0 0 12px rgba(0,255,136,0.15)"; }}
              onBlur={(e) => { e.target.style.borderColor = "rgba(0,255,136,0.2)"; e.target.style.boxShadow = "none"; }}
            />
          </div>

          <div>
            <label className="text-xs text-slate-500 mb-1.5 block">Analysis Mode</label>
            <div className="flex gap-2">
              {[
                { v: false, label: "Deep", sub: "Sonnet 4.6" },
                { v: true, label: "Fast", sub: "Haiku" },
              ].map(({ v, label, sub }) => (
                <button
                  key={String(v)}
                  onClick={() => setFastMode(v)}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold transition-all"
                  style={{
                    background: fastMode === v ? "rgba(0,255,136,0.15)" : "rgba(255,255,255,0.04)",
                    border: `1px solid ${fastMode === v ? "rgba(0,255,136,0.4)" : "rgba(255,255,255,0.08)"}`,
                    color: fastMode === v ? "#00FF88" : "#64748B",
                  }}
                >
                  {label}
                  <span className="block text-xs opacity-60">{sub}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            {/* Demo Button — no API key required */}
            <button
              onClick={handleDemo}
              disabled={demoLoading || loading}
              title="Generate a mock signal instantly — no API key required"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
              style={{
                background: demoLoading
                  ? "rgba(0,212,255,0.08)"
                  : "rgba(0,212,255,0.12)",
                border: "1px solid rgba(0,212,255,0.35)",
                color: "#00D4FF",
                boxShadow: demoLoading ? "none" : "0 0 14px rgba(0,212,255,0.15)",
              }}
            >
              {demoLoading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Demo</>
              ) : (
                <><Zap className="w-3.5 h-3.5" /> Demo</>
              )}
            </button>

            {/* Generate Button — requires Anthropic API key */}
            <button
              onClick={handleGenerate}
              disabled={loading || demoLoading}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
              style={{
                background: loading
                  ? "rgba(0,255,136,0.1)"
                  : "linear-gradient(135deg, rgba(0,255,136,0.25), rgba(0,212,255,0.15))",
                border: "1px solid rgba(0,255,136,0.4)",
                color: "#00FF88",
                boxShadow: loading ? "none" : "0 0 20px rgba(0,255,136,0.2)",
              }}
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing</>
              ) : (
                <><Zap className="w-4 h-4" /> Generate</>
              )}
            </button>
          </div>
        </div>

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 p-3 rounded-xl flex items-center gap-2"
            style={{ background: "rgba(255,0,128,0.1)", border: "1px solid rgba(255,0,128,0.3)" }}
          >
            <AlertTriangle className="w-4 h-4 text-neon-pink flex-shrink-0" />
            <p className="text-sm text-neon-pink">{error}</p>
          </motion.div>
        )}

        {!loading && !demoLoading && (
          <p className="text-xs text-slate-600 mt-3">
            <span className="text-cyan-600 font-medium">Demo</span> — instant mock signal, no API key needed.
            {" "}<span className="text-slate-700">·</span>{" "}
            <span className="text-neon-green/60">Generate</span> — real multi-agent analysis (Anthropic key required).
          </p>
        )}

        {loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 space-y-2">
            <p className="text-xs text-neon-green">Running multi-agent analysis on {ticker}...</p>
            <div className="flex gap-2">
              {["Fundamentals", "Sentiment", "Technical", "News", "Risk"].map((a, i) => (
                <motion.div
                  key={a}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 1, 0.5, 1] }}
                  transition={{ delay: i * 0.3, duration: 1, repeat: Infinity }}
                  className="flex-1 py-1 rounded text-center text-xs"
                  style={{ background: "rgba(0,255,136,0.08)", color: "#00FF88", border: "1px solid rgba(0,255,136,0.2)" }}
                >
                  {a}
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </GlassCard>

      {/* Search & Direction Filter */}
      {signals.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="flex flex-col gap-3 sm:flex-row sm:items-center"
        >
          {/* Ticker search */}
          <div className="flex-1 relative">
            <input
              type="text"
              value={searchTicker}
              onChange={(e) => {
                const val = e.target.value.toUpperCase();
                setSearchTicker(val);
              }}
              placeholder="Filter by ticker... AAPL, TSLA, BTC"
              className="w-full rounded-xl px-4 py-2 text-sm font-mono text-slate-300 placeholder-slate-600 outline-none transition-all"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(0,212,255,0.2)",
              }}
              onFocus={(e) => { e.target.style.borderColor = "rgba(0,212,255,0.5)"; }}
              onBlur={(e)  => { e.target.style.borderColor = "rgba(0,212,255,0.2)"; }}
            />
          </div>

          {/* Direction filter buttons */}
          <div className="flex items-center gap-2">
            {(["ALL", "BUY", "SELL", "HOLD"] as DirectionFilter[]).map((d) => {
              const active = dirFilter === d;
              const colMap: Record<DirectionFilter, string> = {
                ALL:  "#00D4FF",
                BUY:  "#00FF88",
                SELL: "#FF0080",
                HOLD: "#FFD700",
              };
              const col = colMap[d];
              return (
                <button
                  key={d}
                  onClick={() => setDirFilter(d)}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
                  style={
                    active
                      ? { background: `${col}20`, border: `1px solid ${col}60`, color: col }
                      : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#475569" }
                  }
                >
                  {d}
                </button>
              );
            })}

            {/* Hit count */}
            <span className="text-xs text-slate-500 ml-1">
              {filteredSignals.length}/{signals.length}
            </span>
          </div>
        </motion.div>
      )}

      {/* Signal list */}
      <div className="space-y-3">
        {/* Neon-pulse heading — lights up when a new signal arrives */}
        {signals.length > 0 && (
          <motion.div
            className="flex items-center gap-2"
            animate={
              newSignalPulse
                ? { opacity: [1, 0.4, 1, 0.4, 1], scale: [1, 1.02, 1, 1.02, 1] }
                : { opacity: 1, scale: 1 }
            }
            transition={{ duration: 0.8, ease: "easeInOut" }}
          >
            <div
              className="h-px flex-1 rounded-full"
              style={{
                background: newSignalPulse
                  ? "linear-gradient(90deg, transparent, #00FF88, transparent)"
                  : "linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)",
                transition: "background 0.4s ease",
                boxShadow: newSignalPulse ? "0 0 12px rgba(0,255,136,0.6)" : "none",
              }}
            />
            <span
              className="text-xs font-semibold px-2"
              style={{
                color: newSignalPulse ? "#00FF88" : "#475569",
                textShadow: newSignalPulse ? "0 0 10px rgba(0,255,136,0.8)" : "none",
                transition: "color 0.3s ease, text-shadow 0.3s ease",
              }}
            >
              {filteredSignals.length} signal{filteredSignals.length !== 1 ? "s" : ""}
              {newSignalPulse ? " — new signal received" : ""}
            </span>
            <div
              className="h-px flex-1 rounded-full"
              style={{
                background: newSignalPulse
                  ? "linear-gradient(90deg, transparent, #00FF88, transparent)"
                  : "linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)",
                boxShadow: newSignalPulse ? "0 0 12px rgba(0,255,136,0.6)" : "none",
                transition: "background 0.4s ease",
              }}
            />
          </motion.div>
        )}

        {!signals.length ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <GlassCard className="text-center py-16">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
                style={{ background: "rgba(0,255,136,0.08)", border: "1px solid rgba(0,255,136,0.15)" }}
              >
                <Brain className="w-8 h-8" style={{ color: "rgba(0,255,136,0.4)" }} />
              </div>
              <p className="text-slate-400 font-medium">No signals yet. Click Demo Signal to get started.</p>
              <p className="text-sm text-slate-600 mt-1">Enter a ticker above and click Generate or Demo</p>
              <button
                onClick={handleDemo}
                disabled={demoLoading}
                className="mt-4 flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold mx-auto transition-all disabled:opacity-50"
                style={{
                  background: "rgba(0,212,255,0.12)",
                  border: "1px solid rgba(0,212,255,0.35)",
                  color: "#00D4FF",
                  boxShadow: "0 0 14px rgba(0,212,255,0.15)",
                }}
              >
                {demoLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                Demo Signal
              </button>
            </GlassCard>
          </motion.div>
        ) : filteredSignals.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <GlassCard className="text-center py-10">
              <p className="text-slate-500 text-sm">No signals match your filter.</p>
              <button
                onClick={() => { setSearchTicker(""); setDirFilter("ALL"); }}
                className="mt-2 text-xs text-cyan-400 underline"
              >
                Clear filters
              </button>
            </GlassCard>
          </motion.div>
        ) : (
          filteredSignals.map((s, i) => <SignalCard key={s.id} signal={s} index={i} />)
        )}
      </div>

      {/* Batch Scan Modal */}
      <AnimatePresence>
        {batchModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
            onClick={() => !batchLoading && setBatchModalOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 20 }}
              transition={{ type: "spring", damping: 20, stiffness: 300 }}
              className="w-full max-w-md rounded-2xl p-6 space-y-5"
              style={{
                background: "linear-gradient(135deg, rgba(15,15,25,0.98), rgba(20,20,35,0.98))",
                border: "1px solid rgba(123,47,255,0.4)",
                boxShadow: "0 0 40px rgba(123,47,255,0.2), 0 20px 60px rgba(0,0,0,0.6)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ background: "rgba(123,47,255,0.15)", border: "1px solid rgba(123,47,255,0.3)" }}
                  >
                    <ScanSearch className="w-4 h-4" style={{ color: "#A855F7" }} />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-100">Batch Scan</h2>
                    <p className="text-xs text-slate-500">Select up to 10 tickers to scan in parallel</p>
                  </div>
                </div>
                {!batchLoading && (
                  <button onClick={() => setBatchModalOpen(false)} className="text-slate-600 hover:text-slate-300 transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>

              {/* Ticker checkboxes */}
              <div className="grid grid-cols-2 gap-2">
                {BATCH_TICKERS.map((t) => {
                  const selected = batchSelected.includes(t);
                  return (
                    <button
                      key={t}
                      onClick={() => toggleBatchTicker(t)}
                      disabled={batchLoading}
                      className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all text-left"
                      style={{
                        background: selected ? "rgba(123,47,255,0.12)" : "rgba(255,255,255,0.04)",
                        border: `1px solid ${selected ? "rgba(123,47,255,0.4)" : "rgba(255,255,255,0.08)"}`,
                        color: selected ? "#A855F7" : "#64748B",
                      }}
                    >
                      {selected
                        ? <CheckSquare className="w-4 h-4 flex-shrink-0" />
                        : <Square className="w-4 h-4 flex-shrink-0" />
                      }
                      <span className="font-mono">{t}</span>
                    </button>
                  );
                })}
              </div>

              {/* Progress bar */}
              {batchProgress && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>Analysing...</span>
                    <span className="font-mono">{batchProgress.done}/{batchProgress.total}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: "linear-gradient(90deg, #7B2FFF, #A855F7)" }}
                      initial={{ width: 0 }}
                      animate={{ width: `${(batchProgress.done / batchProgress.total) * 100}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-slate-600">
                  {batchSelected.length} selected · max 10
                </span>
                <button
                  onClick={handleBatchScan}
                  disabled={batchLoading || batchSelected.length === 0}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                  style={{
                    background: batchLoading ? "rgba(123,47,255,0.1)" : "linear-gradient(135deg, rgba(123,47,255,0.25), rgba(168,85,247,0.15))",
                    border: "1px solid rgba(123,47,255,0.4)",
                    color: "#A855F7",
                    boxShadow: batchLoading ? "none" : "0 0 20px rgba(123,47,255,0.2)",
                  }}
                >
                  {batchLoading
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Scanning...</>
                    : <><ScanSearch className="w-4 h-4" /> Scan {batchSelected.length > 0 ? batchSelected.length : ""} tickers</>
                  }
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ExplanationModal
        open={explainOpen}
        onClose={() => setExplainOpen(false)}
        content={EXPLAIN_SIGNALS_PAGE}
      />
    </div>
  );
}
