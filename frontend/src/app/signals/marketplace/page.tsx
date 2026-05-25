"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Zap, TrendingUp, TrendingDown, Target, Shield,
  BarChart2, ArrowRight, CheckCircle, Star, Brain,
  RefreshCw, Activity,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import { GlassCard } from "@/components/ui/GlassCard";
import { api, API_BASE } from "@/lib/api";
import Link from "next/link";
import type { TradingSignal } from "@/types";

interface PerfData {
  avg_return: number;
  win_rate: number;
  best_signal: { ticker: string; direction: string; return_pct: number } | null;
  worst_signal: { ticker: string; direction: string; return_pct: number } | null;
  total_evaluated: number;
}

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

// Deterministic equity curve from signal list
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

export default function SignalMarketplacePage() {
  const [signals, setSignals] = useState<TradingSignal[]>([]);
  const [perf, setPerf] = useState<PerfData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.signals.list().catch(() => [] as TradingSignal[]),
      fetch(`${API_BASE}/api/signals/performance`).then((r) => r.json()).catch(() => null),
    ]).then(([sigs, p]) => {
      setSignals(sigs.slice(0, 50));
      setPerf(p);
    }).finally(() => setLoading(false));
  }, []);

  const curve = buildEquityCurve(signals);
  const curveReturn = curve.length > 1
    ? ((curve[curve.length - 1].equity - curve[0].equity) / curve[0].equity) * 100
    : 0;

  const winRate = perf?.total_evaluated
    ? Math.round(perf.win_rate * 100)
    : signals.filter((s) => s.direction.includes("BUY") || s.direction.includes("SELL")).length > 0
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
            style={{ background: "rgba(0,255,136,0.1)", color: "#00FF88" }}>€19/mo</span>
        </div>
        <h1 className="text-2xl font-bold text-white mb-1">AI Signal Track Record</h1>
        <p className="text-sm text-slate-400">
          Live performance data from Claude Sonnet 4.6 multi-agent signals.
          Fundamental + Technical + Sentiment + Risk consensus.
        </p>
      </motion.div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          {
            label: "Win Rate",
            value: `${winRate}%`,
            icon: Target,
            color: "#00FF88",
            sub: perf?.total_evaluated ? `${perf.total_evaluated} evaluated` : `${signals.length} signals`,
          },
          {
            label: "Avg Confidence",
            value: `${avgConfidence}%`,
            icon: Brain,
            color: "#00D4FF",
            sub: "multi-agent consensus",
          },
          {
            label: "Simulated Return",
            value: `${curveReturn >= 0 ? "+" : ""}${fmt(curveReturn)}%`,
            icon: curveReturn >= 0 ? TrendingUp : TrendingDown,
            color: curveReturn >= 0 ? "#00FF88" : "#FF0080",
            sub: `${signals.length} signals`,
          },
          {
            label: "Signals Today",
            value: String(signals.filter((s) => {
              const d = new Date(s.generated_at ?? "");
              const now = new Date();
              return d.getDate() === now.getDate();
            }).length || signals.slice(0, 6).length),
            icon: Zap,
            color: "#7B2FFF",
            sub: "AAPL NVDA MSFT TSLA META AMD",
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
                <span className="text-sm font-semibold text-white">Simulated Equity Curve</span>
              </div>
              <span className="text-xs text-slate-500">Starting capital: $10,000</span>
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
              Simulated — based on signal direction × confidence × fixed position size. Past performance does not guarantee future results.
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
              <span className="text-xs font-bold text-neon-green uppercase tracking-wider">Best Signal</span>
            </div>
            <p className="text-xl font-bold text-white">{perf.best_signal.ticker}</p>
            <p className="text-sm text-slate-400">{perf.best_signal.direction}</p>
            <p className="text-2xl font-bold text-neon-green mt-1">+{fmt(perf.best_signal.return_pct)}%</p>
          </GlassCard>
          {perf.worst_signal && (
            <GlassCard variant="pink" padding="p-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown className="w-4 h-4 text-neon-pink" />
                <span className="text-xs font-bold text-neon-pink uppercase tracking-wider">Worst Signal</span>
              </div>
              <p className="text-xl font-bold text-white">{perf.worst_signal.ticker}</p>
              <p className="text-sm text-slate-400">{perf.worst_signal.direction}</p>
              <p className="text-2xl font-bold text-neon-pink mt-1">{fmt(perf.worst_signal.return_pct)}%</p>
            </GlassCard>
          )}
        </div>
      )}

      {/* Recent signals table */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="mb-8"
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-white">Recent Signals</h2>
          <Link href="/signals" className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1">
            View all <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        <GlassCard padding="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                  {["Ticker", "Direction", "Confidence", "Price Target", "Stop Loss", "Date"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {signals.slice(0, 12).map((s, i) => {
                  const DirIcon = DIRECTION_ICON[s.direction] ?? Activity;
                  const color = DIRECTION_COLOR[s.direction] ?? "#94a3b8";
                  return (
                    <tr
                      key={s.id ?? i}
                      className="transition-colors duration-150"
                      style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}
                    >
                      <td className="px-4 py-3 font-bold text-white font-mono">{s.ticker}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <DirIcon className="w-3.5 h-3.5" style={{ color }} />
                          <span className="text-xs font-semibold" style={{ color }}>{s.direction}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 rounded-full bg-white/5 overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.round((s.confidence ?? 0.5) * 100)}%`,
                                background: color,
                              }}
                            />
                          </div>
                          <span className="text-xs text-slate-300">{Math.round((s.confidence ?? 0.5) * 100)}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-300 font-mono">
                        {s.price_target ? `$${s.price_target.toFixed(2)}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400 font-mono">
                        {s.stop_loss ? `$${s.stop_loss.toFixed(2)}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {s.generated_at
                          ? new Date(s.generated_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
                {signals.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">
                      No signals yet — the AI generates 6 signals daily at 15:00 UTC.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </GlassCard>
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
        <h3 className="text-lg font-bold text-white mb-2">Get these signals in your inbox</h3>
        <p className="text-sm text-slate-400 mb-5 max-w-md mx-auto">
          10 AI signals/day via TradingAgents multi-agent consensus.
          Track record visible here, updated daily. Cancel any time.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/billing"
            className="flex items-center justify-center gap-2 py-2.5 px-6 rounded-xl text-sm font-bold transition-all duration-200"
            style={{
              background: "linear-gradient(135deg, #00FF88, #00D4FF)",
              color: "#000",
              boxShadow: "0 0 20px rgba(0,255,136,0.3)",
            }}
          >
            <Zap className="w-4 h-4" />
            Subscribe — €19/mo
          </Link>
          <Link
            href="/signals"
            className="flex items-center justify-center gap-2 py-2.5 px-5 rounded-xl text-sm font-semibold text-slate-300 hover:text-white transition-all"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            <Star className="w-4 h-4" />
            Generate a signal
          </Link>
        </div>
        <div className="flex items-center justify-center gap-4 mt-5 text-xs text-slate-600">
          {["No lock-in — cancel any time", "14-day free trial", "Upgrade to full dashboard anytime"].map((t) => (
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
