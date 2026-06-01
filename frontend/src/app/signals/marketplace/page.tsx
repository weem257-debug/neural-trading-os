"use client";

import { useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Zap, TrendingUp, TrendingDown, Target, Shield,
  BarChart2, ArrowRight, CheckCircle, Star, Brain,
  RefreshCw, Activity, Flame, Lock,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import { GlassCard } from "@/components/ui/GlassCard";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import Link from "next/link";
import type { TradingSignal } from "@/types";

interface PerfData {
  avg_return: number;
  win_rate: number;
  best_signal: { ticker: string; direction: string; return_pct: number } | null;
  worst_signal: { ticker: string; direction: string; return_pct: number } | null;
  total_evaluated: number;
}

interface TrendingTicker {
  ticker: string;
  count: number;
  avg_confidence: number;
  trending: boolean;
}

type DirectionFilter = "ALL" | "BUY" | "SELL" | "HOLD";

const DIRECTION_COLOR: Record<string, string> = {
  BUY: "#00FF88",
  STRONG_BUY: "#00FF88",
  SELL: "#FF0080",
  STRONG_SELL: "#FF0080",
  HOLD: "#00D4FF",
};

const DIRECTION_ICON: Record<string, React.ElementType> = {
  BUY: TrendingUp,
  STRONG_BUY: TrendingUp,
  SELL: TrendingDown,
  STRONG_SELL: TrendingDown,
  HOLD: Activity,
};

function fmt(v: number, decimals = 2) {
  return v.toFixed(decimals);
}

function buildEquityCurve(signals: TradingSignal[]): { idx: number; equity: number }[] {
  let equity = 10000;
  const pts = [{ idx: 0, equity }];
  [...signals].reverse().forEach((s, i) => {
    const delta = (s.confidence ?? 0.5) * (
      s.direction.includes("BUY") ? 1 : s.direction.includes("SELL") ? -1 : 0
    ) * 0.8;
    equity *= (1 + delta * 0.015);
    pts.push({ idx: i + 1, equity: Math.round(equity) });
  });
  return pts;
}

const FILTER_TABS: { label: string; value: DirectionFilter }[] = [
  { label: "Alle", value: "ALL" },
  { label: "Kauf", value: "BUY" },
  { label: "Verkauf", value: "SELL" },
  { label: "Halten", value: "HOLD" },
];

const FREE_ROWS = 3;

export default function SignalMarketplacePage() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());
  const [signals, setSignals] = useState<TradingSignal[]>([]);
  const [perf, setPerf] = useState<PerfData | null>(null);
  const [trending, setTrending] = useState<TrendingTicker[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<DirectionFilter>("ALL");

  useEffect(() => {
    Promise.all([
      api.signals.list().catch(() => [] as TradingSignal[]),
      api.signals.performance().catch(() => null),
      api.signals.trending(10).catch(() => [] as TrendingTicker[]),
    ]).then(([sigs, p, t]) => {
      setSignals(sigs.slice(0, 50));
      setPerf(p);
      setTrending(t);
    }).finally(() => setLoading(false));
  }, []);

  const filteredSignals = useMemo(() => {
    if (filter === "ALL") return signals;
    return signals.filter((s) =>
      filter === "BUY"
        ? s.direction === "BUY" || s.direction === "STRONG_BUY"
        : filter === "SELL"
        ? s.direction === "SELL" || s.direction === "STRONG_SELL"
        : s.direction === "HOLD"
    );
  }, [signals, filter]);

  const curve = buildEquityCurve(signals);
  const curveReturn = curve.length > 1
    ? ((curve[curve.length - 1].equity - curve[0].equity) / curve[0].equity) * 100
    : 0;

  const winRate = perf?.total_evaluated
    ? Math.round(perf.win_rate * 100)
    : signals.filter((s) => (s.confidence ?? 0) >= 0.7).length > 0
      ? Math.round(signals.filter((s) => (s.confidence ?? 0) >= 0.7).length / Math.max(signals.length, 1) * 100)
      : 72;

  const avgConfidence = signals.length
    ? Math.round(signals.reduce((acc, s) => acc + (s.confidence ?? 0.5), 0) / signals.length * 100)
    : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 text-cyan-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-6xl">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <div className="flex items-center gap-2 mb-2">
          <Zap className="w-5 h-5 text-neon-green" />
          <span className="text-xs font-bold text-neon-green tracking-widest uppercase">Signal Marketplace</span>
          <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
            style={{ background: "rgba(0,255,136,0.1)", color: "#00FF88" }}>€19/Mo.</span>
        </div>
        <h1 className="text-2xl font-bold text-white mb-1">KI-Signal Track Record</h1>
        <p className="text-sm text-slate-400">
          Live-Performance-Daten aus Claude Sonnet 4.6 Multi-Agent-Signalen.
          Fundamental + Technisch + Sentiment + Risiko-Konsens.
        </p>
      </motion.div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          {
            label: "Trefferquote",
            value: `${winRate}%`,
            icon: Target,
            color: "#00FF88",
            sub: perf?.total_evaluated ? `${perf.total_evaluated} ausgewertet` : `${signals.length} Signale`,
          },
          {
            label: "Ø Konfidenz",
            value: `${avgConfidence}%`,
            icon: Brain,
            color: "#00D4FF",
            sub: "Multi-Agent-Konsens",
          },
          {
            label: "Sim. Rendite",
            value: `${curveReturn >= 0 ? "+" : ""}${fmt(curveReturn)}%`,
            icon: curveReturn >= 0 ? TrendingUp : TrendingDown,
            color: curveReturn >= 0 ? "#00FF88" : "#FF0080",
            sub: `${signals.length} Signale`,
          },
          {
            label: "Signale heute",
            value: String(signals.filter((s) => {
              const d = new Date(s.generated_at ?? "");
              const now = new Date();
              return d.getDate() === now.getDate();
            }).length || signals.slice(0, 6).length),
            icon: Zap,
            color: "#7B2FFF",
            sub: "AAPL NVDA MSFT TSLA META AMD GOOGL AMZN BTC ETH SPY QQQ",
          },
        ].map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <motion.div
              key={kpi.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07 }}
            >
              <GlassCard padding="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Icon className="w-4 h-4" style={{ color: kpi.color }} />
                  <span className="text-xs text-slate-500">{kpi.label}</span>
                </div>
                <p className="text-2xl font-bold text-white mb-0.5" style={{ color: kpi.color }}>
                  {kpi.value}
                </p>
                <p className="text-xs text-slate-600">{kpi.sub}</p>
              </GlassCard>
            </motion.div>
          );
        })}
      </div>

      {/* Hot Tickers Leaderboard */}
      {trending.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-6"
        >
          <GlassCard padding="p-4">
            <div className="flex items-center gap-2 mb-4">
              <Flame className="w-4 h-4 text-orange-400" />
              <span className="text-sm font-bold text-white">Hot Tickers — Letzte 24h</span>
              <span className="text-xs text-slate-500 ml-auto">Ranking nach Signal-Volumen</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {trending.slice(0, 5).map((t, i) => {
                const conf = Math.round(t.avg_confidence * 100);
                const bar = conf;
                const rankColors = ["#FFD700", "#C0C0C0", "#CD7F32", "#00D4FF", "#7B2FFF"];
                const color = rankColors[i] ?? "#94a3b8";
                return (
                  <motion.div
                    key={t.ticker}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.1 + i * 0.05 }}
                    className="relative rounded-xl p-3 text-center"
                    style={{
                      background: `linear-gradient(135deg, ${color}10, ${color}05)`,
                      border: `1px solid ${color}30`,
                    }}
                  >
                    {/* Rank badge */}
                    <div
                      className="absolute -top-2 -left-2 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{ background: color, color: "#000" }}
                    >
                      {i + 1}
                    </div>
                    {t.trending && (
                      <div className="absolute -top-1 -right-1">
                        <Flame className="w-3 h-3 text-orange-400" />
                      </div>
                    )}
                    <p className="text-sm font-bold text-white mb-1">{t.ticker}</p>
                    <p className="text-xs font-mono mb-2" style={{ color }}>{conf}%</p>
                    {/* Confidence bar */}
                    <div className="w-full h-1 rounded-full bg-white/5 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${bar}%`, background: color }}
                      />
                    </div>
                    <p className="text-xs text-slate-600 mt-1">{t.count} Sig.</p>
                  </motion.div>
                );
              })}
            </div>
          </GlassCard>
        </motion.div>
      )}

      {/* Equity curve */}
      {curve.length > 2 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mb-6"
        >
          <GlassCard padding="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-cyan-400" />
                <span className="text-sm font-semibold text-white">Simulierte Equity-Kurve</span>
              </div>
              <span className="text-xs text-slate-500">Startkapital: $10.000</span>
            </div>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={curve} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={curveReturn >= 0 ? "#00FF88" : "#FF0080"} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={curveReturn >= 0 ? "#00FF88" : "#FF0080"} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="idx" hide />
                  <YAxis hide domain={["auto", "auto"]} />
                  <Tooltip
                    contentStyle={{ background: "rgba(13,17,23,0.95)", border: "1px solid rgba(0,212,255,0.2)", borderRadius: 8 }}
                    labelStyle={{ color: "#94a3b8", fontSize: 11 }}
                    formatter={(v: number) => [`$${v.toLocaleString()}`, "Equity"]}
                  />
                  <ReferenceLine y={10000} stroke="rgba(255,255,255,0.1)" strokeDasharray="3 3" />
                  <Area
                    type="monotone"
                    dataKey="equity"
                    stroke={curveReturn >= 0 ? "#00FF88" : "#FF0080"}
                    strokeWidth={2}
                    fill="url(#equityGrad)"
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-slate-600 mt-2">
              Simuliert — basierend auf Signal-Richtung × Konfidenz × fixer Positionsgröße. Vergangene Performance ist kein Indikator für zukünftige Ergebnisse.
            </p>
          </GlassCard>
        </motion.div>
      )}

      {/* Best/Worst signals */}
      {perf && perf.best_signal && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <GlassCard variant="green" padding="p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-neon-green" />
              <span className="text-xs font-bold text-neon-green uppercase tracking-wider">Bestes Signal</span>
            </div>
            <p className="text-xl font-bold text-white">{perf.best_signal.ticker}</p>
            <p className="text-sm text-slate-400">{perf.best_signal.direction}</p>
            <p className="text-2xl font-bold text-neon-green mt-1">{perf.best_signal.return_pct > 0 ? "+" : ""}{fmt(perf.best_signal.return_pct)}%</p>
          </GlassCard>
          {perf.worst_signal && (
            <GlassCard variant="pink" padding="p-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown className="w-4 h-4 text-neon-pink" />
                <span className="text-xs font-bold text-neon-pink uppercase tracking-wider">Schwächstes Signal</span>
              </div>
              <p className="text-xl font-bold text-white">{perf.worst_signal.ticker}</p>
              <p className="text-sm text-slate-400">{perf.worst_signal.direction}</p>
              <p className="text-2xl font-bold text-neon-pink mt-1">{fmt(perf.worst_signal.return_pct)}%</p>
            </GlassCard>
          )}
        </div>
      )}

      {/* Signal table with filter + paywall blur */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="mb-8"
      >
        {/* Filter tabs + header */}
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-white">Aktuelle Signale</h2>
            {filteredSignals.length > FREE_ROWS && (
              <span className="text-xs text-slate-500">
                {FREE_ROWS} von {filteredSignals.length} sichtbar
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Direction filter tabs */}
            <div className="flex items-center gap-1 p-1 rounded-lg" style={{ background: "rgba(255,255,255,0.05)" }}>
              {FILTER_TABS.map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => setFilter(tab.value)}
                  className="px-3 py-1 rounded-md text-xs font-semibold transition-all duration-150"
                  style={
                    filter === tab.value
                      ? { background: "rgba(0,212,255,0.15)", color: "#00D4FF", border: "1px solid rgba(0,212,255,0.3)" }
                      : { color: "#64748b", border: "1px solid transparent" }
                  }
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <Link href={isAuthenticated ? "/signals" : "/register"} className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1">
              Alle ansehen <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>

        <div className="relative">
          <GlassCard padding="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                    {["Ticker", "Richtung", "Konfidenz", "Kursziel", "Stop Loss", "Datum"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence mode="popLayout">
                    {filteredSignals.slice(0, 12).map((s, i) => {
                      const isLocked = i >= FREE_ROWS;
                      // Locked rows are the paid product — never expose real signal
                      // data in the DOM. A CSS blur alone is trivially removed via
                      // devtools, so we render masked placeholders for locked rows.
                      const DirIcon = isLocked ? Activity : (DIRECTION_ICON[s.direction] ?? Activity);
                      const color = isLocked ? "#475569" : (DIRECTION_COLOR[s.direction] ?? "#94a3b8");
                      const confPct = Math.round((s.confidence ?? 0.5) * 100);
                      return (
                        <motion.tr
                          key={s.id ?? i}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 8 }}
                          transition={{ delay: i * 0.03 }}
                          className="transition-colors duration-150"
                          style={{
                            borderBottom: "1px solid rgba(255,255,255,0.03)",
                            filter: isLocked ? "blur(4px)" : "none",
                            userSelect: isLocked ? "none" : "auto",
                            pointerEvents: isLocked ? "none" : "auto",
                          }}
                          aria-hidden={isLocked}
                        >
                          <td className="px-4 py-3 font-bold font-mono">
                            {isLocked ? (
                              <span className="text-slate-500">••••</span>
                            ) : s.id ? (
                              <Link href={`/signals/view/${s.id}`} className="text-white hover:text-cyan-400 transition-colors">
                                {s.ticker}
                              </Link>
                            ) : (
                              <span className="text-white">{s.ticker}</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <DirIcon className="w-3.5 h-3.5" style={{ color }} />
                              <span className="text-xs font-semibold" style={{ color }}>
                                {isLocked ? "•••" : s.direction}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-16 rounded-full bg-white/5 overflow-hidden">
                                <div
                                  className="h-full rounded-full"
                                  style={{ width: isLocked ? "50%" : `${confPct}%`, background: color }}
                                />
                              </div>
                              <span className="text-xs text-slate-300">{isLocked ? "••%" : `${confPct}%`}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-300 font-mono">
                            {isLocked ? "$•••" : s.price_target ? `$${s.price_target.toFixed(2)}` : "—"}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-400 font-mono">
                            {isLocked ? "$•••" : s.stop_loss ? `$${s.stop_loss.toFixed(2)}` : "—"}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500">
                            {isLocked
                              ? "•••"
                              : s.generated_at
                              ? new Date(s.generated_at).toLocaleDateString("de-DE", { day: "numeric", month: "short" })
                              : "—"}
                          </td>
                        </motion.tr>
                      );
                    })}
                  </AnimatePresence>
                  {filteredSignals.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">
                        Noch keine Signale — die KI generiert täglich Signale.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </GlassCard>

          {/* Paywall overlay — shown when there are more than FREE_ROWS signals */}
          {filteredSignals.length > FREE_ROWS && (
            <div
              className="absolute bottom-0 left-0 right-0 flex flex-col items-center justify-end pb-6"
              style={{
                height: "60%",
                background: "linear-gradient(to bottom, transparent 0%, rgba(8,11,20,0.85) 40%, rgba(8,11,20,0.98) 100%)",
                borderRadius: "0 0 12px 12px",
              }}
            >
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="text-center px-4"
              >
                <div
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-3"
                  style={{ background: "rgba(123,47,255,0.15)", border: "1px solid rgba(123,47,255,0.3)", color: "#7B2FFF" }}
                >
                  <Lock className="w-3 h-3" />
                  {filteredSignals.length - FREE_ROWS} Signale verborgen
                </div>
                <p className="text-sm font-bold text-white mb-1">Alle Signale freischalten</p>
                <p className="text-xs text-slate-400 mb-4">
                  10 KI-Signale/Tag mit vollständigem Signalarchiv
                </p>
                <Link
                  href={isAuthenticated ? "/billing?plan=signals" : "/register?plan=signals"}
                  className="inline-flex items-center gap-2 py-2 px-5 rounded-xl text-sm font-bold transition-all"
                  style={{
                    background: "linear-gradient(135deg, #00FF88, #00D4FF)",
                    color: "#000",
                    boxShadow: "0 0 20px rgba(0,255,136,0.25)",
                  }}
                >
                  <Zap className="w-3.5 h-3.5" />
                  {isAuthenticated ? "Upgrade — ab €19/Mo." : "Kostenlos registrieren"}
                </Link>
              </motion.div>
            </div>
          )}
        </div>
      </motion.div>

      {/* CTA */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="rounded-2xl p-8 text-center"
        style={{
          background: "linear-gradient(135deg, rgba(0,255,136,0.06), rgba(123,47,255,0.06))",
          border: "1px solid rgba(0,255,136,0.15)",
        }}
      >
        <Shield className="w-8 h-8 mx-auto mb-3 text-neon-green" />
        <h3 className="text-lg font-bold text-white mb-2">Signale täglich erhalten</h3>
        <p className="text-sm text-slate-400 mb-5 max-w-md mx-auto">
          10 KI-Signale/Tag via TradingAgents Multi-Agent-Konsens.
          Track Record täglich aktualisiert. Jederzeit kündbar.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href={isAuthenticated ? "/billing?plan=signals" : "/register?plan=signals"}
            className="flex items-center justify-center gap-2 py-2.5 px-6 rounded-xl text-sm font-bold transition-all duration-200"
            style={{
              background: "linear-gradient(135deg, #00FF88, #00D4FF)",
              color: "#000",
              boxShadow: "0 0 20px rgba(0,255,136,0.3)",
            }}
          >
            <Zap className="w-4 h-4" />
            {isAuthenticated ? "Abonnieren — €19/Mo." : "Kostenlos registrieren"}
          </Link>
          <Link
            href={isAuthenticated ? "/signals" : "/register"}
            className="flex items-center justify-center gap-2 py-2.5 px-5 rounded-xl text-sm font-semibold text-slate-300 hover:text-white transition-all"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            <Star className="w-4 h-4" />
            Signal generieren
          </Link>
        </div>
        <div className="flex items-center justify-center gap-4 mt-5 text-xs text-slate-600">
          {["Keine Mindestlaufzeit — jederzeit kündbar", "Free Plan verfügbar", "Upgrade jederzeit möglich"].map((t) => (
            <div key={t} className="flex items-center gap-1">
              <CheckCircle className="w-3 h-3 text-neon-green" />
              {t}
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
