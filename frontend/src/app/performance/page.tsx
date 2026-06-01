"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  TrendingUp, TrendingDown, Target, Brain, Zap,
  ArrowRight, CheckCircle, BarChart2, Award, Trophy, User,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";

const DIR_DE: Record<string, string> = {
  STRONG_BUY: "Starker Kauf", BUY: "Kaufen", HOLD: "Halten",
  SELL: "Verkaufen", STRONG_SELL: "Starker Verkauf",
};
const dirLabel = (d: string) => DIR_DE[d.toUpperCase()] ?? d;

interface PerfEntry {
  signal_id: string;
  ticker: string;
  direction: string;
  return_pct: number;
}

interface PerfData {
  avg_return: number;
  win_rate: number;
  best_signal: PerfEntry | null;
  worst_signal: PerfEntry | null;
  total_evaluated: number;
}

interface TotalData {
  total: number;
}

interface TickerPerfEntry {
  ticker: string;
  total: number;
  wins: number;
  win_rate: number;
  avg_return: number;
}

function StatCard({
  label, value, sub, color, icon: Icon, delay,
}: {
  label: string; value: string; sub?: string;
  color: string; icon: React.ElementType; delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5 }}
      className="rounded-2xl p-5"
      style={{
        background: "rgba(255,255,255,0.025)",
        border: `1px solid ${color}30`,
        boxShadow: `0 0 30px ${color}08`,
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4" style={{ color }} />
        <span className="text-xs font-semibold text-slate-500 tracking-wider uppercase">{label}</span>
      </div>
      <p className="text-3xl font-bold" style={{ color }}>{value}</p>
      {sub && <p className="text-xs text-slate-600 mt-1">{sub}</p>}
    </motion.div>
  );
}

export default function PerformancePage() {
  const [perf, setPerf] = useState<PerfData | null>(null);
  const [totalSignals, setTotalSignals] = useState<number | null>(null);
  const [tickerPerf, setTickerPerf] = useState<TickerPerfEntry[]>([]);
  const [myPerf, setMyPerf] = useState<PerfData | null>(null);
  const [loading, setLoading] = useState(true);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());

  useEffect(() => {
    Promise.all([
      api.signals.performance().catch(() => null),
      api.signals.total().catch(() => null),
      api.signals.performanceByTicker().catch(() => ({ tickers: [] })),
      isAuthenticated ? api.signals.performanceMine().catch(() => null) : Promise.resolve(null),
    ]).then(([perfData, totalData, tickerData, myPerfData]: [PerfData | null, TotalData | null, { tickers: TickerPerfEntry[] }, PerfData | null]) => {
      setPerf(perfData);
      setTotalSignals(totalData?.total ?? null);
      setTickerPerf(tickerData?.tickers ?? []);
      setMyPerf(myPerfData);
      setLoading(false);
    });
  }, [isAuthenticated]);

  const winPct = perf ? Math.round(perf.win_rate * 100) : null;
  const avgRetPct = perf ? (perf.avg_return * 100).toFixed(2) : null;

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(180deg, #080b14 0%, #0d1117 100%)" }}>
      {/* Gradient orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full opacity-5"
          style={{ background: "radial-gradient(circle, #00D4FF, transparent)", filter: "blur(60px)" }} />
        <div className="absolute bottom-1/3 right-1/4 w-96 h-96 rounded-full opacity-5"
          style={{ background: "radial-gradient(circle, #7B2FFF, transparent)", filter: "blur(60px)" }} />
      </div>

      <div className="relative max-w-4xl mx-auto px-4 py-16 sm:py-24">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-6"
            style={{ background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.2)", color: "#00D4FF" }}>
            <Brain className="w-3.5 h-3.5" />
            KI-Analyse-Performance — Live-Daten
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4">
            Wie gut sind die<br />
            <span style={{ color: "#00D4FF" }}>KI-Handelssignale?</span>
          </h1>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">
            Echtzeit-Auswertung aller generierten Signale. Kein Marketing — echte Zahlen aus dem laufenden System.
          </p>
        </motion.div>

        {/* Stats Grid */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-12">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="rounded-2xl p-5 animate-pulse h-28"
                style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)" }} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-12">
            <StatCard
              label="Trefferquote"
              value={winPct !== null ? `${winPct}%` : "—"}
              sub="Signale mit positiver Rendite"
              color="#00FF88"
              icon={Target}
              delay={0.1}
            />
            <StatCard
              label="Ø Rendite"
              value={avgRetPct !== null ? `${Number(avgRetPct) > 0 ? "+" : ""}${avgRetPct}%` : "—"}
              sub="Durchschnitt aller bewerteten Signale"
              color="#00D4FF"
              icon={TrendingUp}
              delay={0.15}
            />
            <StatCard
              label="Ausgewertet"
              value={perf ? perf.total_evaluated.toLocaleString("de-DE") : "—"}
              sub="Signale mit Rendite-Tracking"
              color="#A78BFA"
              icon={BarChart2}
              delay={0.2}
            />
            <StatCard
              label="Gesamt"
              value={totalSignals !== null ? totalSignals.toLocaleString("de-DE") : "—"}
              sub="Aller generierten KI-Signale"
              color="#FFAA00"
              icon={Zap}
              delay={0.25}
            />
          </div>
        )}

        {/* Empty state notice */}
        {!loading && perf && perf.total_evaluated === 0 && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
            className="flex items-start gap-3 p-4 rounded-xl mb-8"
            style={{ background: "rgba(0,212,255,0.06)", border: "1px solid rgba(0,212,255,0.18)" }}
          >
            <Brain className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-cyan-300 mb-0.5">Daten werden gesammelt</p>
              <p className="text-xs text-slate-500">
                Erst nach 24 Stunden werden generierte Signale gegen die tatsächliche Kursentwicklung ausgewertet.
                Sobald die ersten Ergebnisse vorliegen, erscheinen hier echte Kennzahlen.
              </p>
            </div>
          </motion.div>
        )}

        {/* Best / Worst signals */}
        {perf && (perf.best_signal || perf.worst_signal) && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
            className="grid sm:grid-cols-2 gap-4 mb-12"
          >
            {perf.best_signal && (
              <div className="rounded-2xl p-5"
                style={{ background: "rgba(0,255,136,0.04)", border: "1px solid rgba(0,255,136,0.15)" }}>
                <div className="flex items-center gap-2 mb-3">
                  <Award className="w-4 h-4 text-green-400" />
                  <span className="text-xs font-semibold text-green-400 tracking-wider uppercase">Bestes Signal</span>
                </div>
                <p className="text-2xl font-bold text-white mb-1">{perf.best_signal.ticker}</p>
                <p className="text-green-400 font-semibold">
                  {perf.best_signal.return_pct > 0 ? "+" : ""}{(perf.best_signal.return_pct * 100).toFixed(2)}% Rendite
                </p>
                <p className="text-xs text-slate-500 mt-1">{dirLabel(perf.best_signal.direction)} Signal</p>
              </div>
            )}
            {perf.worst_signal && (
              <div className="rounded-2xl p-5"
                style={{ background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.12)" }}>
                <div className="flex items-center gap-2 mb-3">
                  <TrendingDown className="w-4 h-4 text-red-400" />
                  <span className="text-xs font-semibold text-red-400 tracking-wider uppercase">Schwächstes Signal</span>
                </div>
                <p className="text-2xl font-bold text-white mb-1">{perf.worst_signal.ticker}</p>
                <p className="text-red-400 font-semibold">
                  {(perf.worst_signal.return_pct * 100).toFixed(2)}% Rendite
                </p>
                <p className="text-xs text-slate-500 mt-1 capitalize">{perf.worst_signal.direction.toLowerCase()} Signal</p>
              </div>
            )}
          </motion.div>
        )}

        {/* Ticker-Breakdown */}
        {tickerPerf.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.32 }}
            className="rounded-2xl p-6 mb-12"
            style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <div className="flex items-center gap-2 mb-5">
              <Trophy className="w-4 h-4" style={{ color: "#FFAA00" }} />
              <h2 className="text-lg font-bold text-white">Ticker-Performance-Ranking</h2>
              <span className="text-xs text-slate-600 ml-auto">Top nach Trefferquote</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-600 border-b border-white/5">
                    <th className="text-left py-2 pr-4">#</th>
                    <th className="text-left py-2 pr-4">Ticker</th>
                    <th className="text-right py-2 pr-4">Trefferquote</th>
                    <th className="text-right py-2 pr-4">Ø Rendite</th>
                    <th className="text-right py-2">Signale</th>
                  </tr>
                </thead>
                <tbody>
                  {tickerPerf.map((t, i) => {
                    const winPct = Math.round(t.win_rate * 100);
                    const avgRet = (t.avg_return * 100).toFixed(2);
                    const positive = t.avg_return >= 0;
                    return (
                      <tr key={t.ticker} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                        <td className="py-2.5 pr-4 text-slate-600 text-xs">{i + 1}</td>
                        <td className="py-2.5 pr-4 font-bold text-white">{t.ticker}</td>
                        <td className="py-2.5 pr-4 text-right">
                          <div className="inline-flex items-center gap-2">
                            <div className="w-20 h-1.5 rounded-full overflow-hidden bg-white/5">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${winPct}%`,
                                  background: winPct >= 60 ? "#00FF88" : winPct >= 40 ? "#FFAA00" : "#EF4444",
                                }}
                              />
                            </div>
                            <span
                              className="text-xs font-semibold w-10 text-right"
                              style={{ color: winPct >= 60 ? "#00FF88" : winPct >= 40 ? "#FFAA00" : "#EF4444" }}
                            >
                              {winPct}%
                            </span>
                          </div>
                        </td>
                        <td
                          className="py-2.5 pr-4 text-right text-xs font-semibold"
                          style={{ color: positive ? "#00FF88" : "#EF4444" }}
                        >
                          {positive ? "+" : ""}{avgRet}%
                        </td>
                        <td className="py-2.5 text-right text-xs text-slate-600">{t.total}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}

        {/* Meine Performance — nur für eingeloggte Nutzer */}
        {isAuthenticated && !loading && myPerf && myPerf.total_evaluated > 0 && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.34 }}
            className="rounded-2xl p-6 mb-12"
            style={{ background: "linear-gradient(135deg, rgba(0,212,255,0.04), rgba(123,47,255,0.04))", border: "1px solid rgba(0,212,255,0.18)" }}
          >
            <div className="flex items-center gap-2 mb-5">
              <User className="w-4 h-4" style={{ color: "#00D4FF" }} />
              <h2 className="text-lg font-bold text-white">Meine Signal-Performance</h2>
              <span className="text-xs text-slate-600 ml-auto">Persönliche Auswertung</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
              {/* Personal win rate */}
              <div className="rounded-xl p-4" style={{ background: "rgba(0,255,136,0.05)", border: "1px solid rgba(0,255,136,0.15)" }}>
                <p className="text-xs text-slate-500 mb-1">Meine Trefferquote</p>
                <p className="text-2xl font-bold" style={{ color: "#00FF88" }}>{Math.round(myPerf.win_rate * 100)}%</p>
                {perf && myPerf.win_rate > perf.win_rate && (
                  <p className="text-xs mt-1" style={{ color: "#00FF88" }}>↑ besser als Ø</p>
                )}
              </div>
              {/* Personal avg return */}
              <div className="rounded-xl p-4" style={{ background: "rgba(0,212,255,0.05)", border: "1px solid rgba(0,212,255,0.15)" }}>
                <p className="text-xs text-slate-500 mb-1">Meine Ø Rendite</p>
                <p className="text-2xl font-bold" style={{ color: myPerf.avg_return >= 0 ? "#00D4FF" : "#EF4444" }}>
                  {myPerf.avg_return >= 0 ? "+" : ""}{(myPerf.avg_return * 100).toFixed(2)}%
                </p>
                {perf && myPerf.avg_return > perf.avg_return && (
                  <p className="text-xs mt-1" style={{ color: "#00D4FF" }}>↑ besser als Ø</p>
                )}
              </div>
              {/* Evaluated count */}
              <div className="rounded-xl p-4" style={{ background: "rgba(123,47,255,0.05)", border: "1px solid rgba(123,47,255,0.15)" }}>
                <p className="text-xs text-slate-500 mb-1">Ausgewertete Signale</p>
                <p className="text-2xl font-bold text-white">{myPerf.total_evaluated}</p>
                <p className="text-xs text-slate-600 mt-1">mit Rendite-Tracking</p>
              </div>
              {/* Best signal */}
              {myPerf.best_signal && (
                <div className="rounded-xl p-4" style={{ background: "rgba(255,170,0,0.05)", border: "1px solid rgba(255,170,0,0.15)" }}>
                  <p className="text-xs text-slate-500 mb-1">Bestes Signal</p>
                  <p className="text-lg font-bold text-white">{myPerf.best_signal.ticker}</p>
                  <p className="text-sm font-semibold" style={{ color: "#FFAA00" }}>
                    {myPerf.best_signal.return_pct > 0 ? "+" : ""}{(myPerf.best_signal.return_pct * 100).toFixed(2)}%
                  </p>
                </div>
              )}
            </div>

            {/* Global vs personal comparison bar */}
            {perf && perf.total_evaluated > 0 && (
              <div className="space-y-3 pt-4 border-t border-white/5">
                <p className="text-xs text-slate-500 font-semibold tracking-wider uppercase">Vergleich: Ich vs. System-Ø</p>
                {[
                  { label: "Trefferquote", mine: myPerf.win_rate, global: perf.win_rate, fmt: (v: number) => `${Math.round(v * 100)}%` },
                  { label: "Ø Rendite", mine: myPerf.avg_return, global: perf.avg_return, fmt: (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(2)}%` },
                ].map(({ label, mine, global, fmt }) => {
                  const better = mine >= global;
                  return (
                    <div key={label}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-slate-500">{label}</span>
                        <span className="flex gap-3">
                          <span style={{ color: better ? "#00FF88" : "#94a3b8" }}>Ich: <strong>{fmt(mine)}</strong></span>
                          <span className="text-slate-600">System: {fmt(global)}</span>
                        </span>
                      </div>
                      <div className="relative h-1.5 rounded-full bg-white/5">
                        <div
                          className="absolute left-0 h-full rounded-full transition-all"
                          style={{ width: `${Math.min(100, Math.max(0, mine * 100))}%`, background: better ? "#00FF88" : "#94a3b8", opacity: 0.6 }}
                        />
                        <div
                          className="absolute left-0 h-full rounded-full border-r-2 border-white/30"
                          style={{ width: `${Math.min(100, Math.max(0, global * 100))}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-4 flex gap-2">
              <Link
                href={isAuthenticated ? "/signals" : "/register"}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all hover:brightness-110"
                style={{ background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.25)", color: "#00D4FF" }}
              >
                <Zap className="w-3.5 h-3.5" /> Neues Signal generieren
              </Link>
            </div>
          </motion.div>
        )}

        {/* How it works */}
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }}
          className="rounded-2xl p-6 mb-12"
          style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <h2 className="text-lg font-bold text-white mb-4">So funktioniert die KI-Analyse</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              { step: "1", title: "Multi-Agenten-Analyse", desc: "9 spezialisierte KI-Modelle analysieren Kurs, Sentiment und Fundamentaldaten gleichzeitig." },
              { step: "2", title: "Agenten-Konsens", desc: "Claude Sonnet 4.6 aggregiert die Einzelmeinungen zu einem Richtungsurteil mit Konfidenzscore." },
              { step: "3", title: "Performance-Tracking", desc: "Jedes Signal wird täglich ausgewertet — Rendite und Trefferquote werden live aktualisiert." },
            ].map(({ step, title, desc }) => (
              <div key={step} className="space-y-2">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{ background: "rgba(0,212,255,0.1)", color: "#00D4FF", border: "1px solid rgba(0,212,255,0.2)" }}>
                  {step}
                </div>
                <p className="text-sm font-semibold text-slate-200">{title}</p>
                <p className="text-xs text-slate-500">{desc}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Disclaimer */}
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
          className="rounded-xl px-4 py-3 mb-10 text-xs text-slate-600"
          style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}
        >
          <strong className="text-slate-500">Risikohinweis (WpHG §85):</strong> Die dargestellten Performance-Kennzahlen basieren auf historischen Daten und stellen keine Anlageberatung dar. Vergangene Performance ist kein verlässlicher Indikator für zukünftige Ergebnisse. Handel mit Finanzinstrumenten ist mit erheblichem Verlustrisiko verbunden.
        </motion.div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}
          className="text-center space-y-4"
        >
          <h2 className="text-2xl font-bold text-white">
            {isAuthenticated ? "Signal generieren" : "Selbst ausprobieren — kostenlos"}
          </h2>
          <p className="text-slate-400">
            {isAuthenticated
              ? "KI analysiert deinen Ticker mit 9 spezialisierten Agenten."
              : "3 KI-Signale pro Tag im Free Plan. Keine Kreditkarte erforderlich."}
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Link
              href={isAuthenticated ? "/signals" : "/register"}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-all"
              style={{
                background: "linear-gradient(135deg, rgba(0,212,255,0.2), rgba(123,47,255,0.15))",
                border: "1px solid rgba(0,212,255,0.4)",
                color: "#00D4FF",
                boxShadow: "0 0 30px rgba(0,212,255,0.15)",
              }}
            >
              <Zap className="w-4 h-4" />
              {isAuthenticated ? "Zum Signal-Generator" : "Kostenlos registrieren"}
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href={isAuthenticated ? "/billing" : "/pricing"}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all"
              style={{ border: "1px solid rgba(255,255,255,0.1)", color: "#94a3b8" }}
            >
              {isAuthenticated ? "Plan upgraden" : "Pläne ansehen"}
            </Link>
          </div>
          <div className="flex items-center justify-center gap-4 text-xs text-slate-600 flex-wrap">
            {["Kostenloser Free Plan", "Kein Abo nötig", "Paper Trading inklusive"].map(f => (
              <span key={f} className="flex items-center gap-1">
                <CheckCircle className="w-3 h-3 text-green-600" />
                {f}
              </span>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
