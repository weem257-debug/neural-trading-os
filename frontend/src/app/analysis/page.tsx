"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  ComposedChart, Line, Bar, XAxis, YAxis, ResponsiveContainer,
  Tooltip, ReferenceLine, Legend, Area,
} from "recharts";
import { api } from "@/lib/api";
import type { ElliottWaveAnalysis, ElliottWavePoint, FibonacciLevel } from "@/types";
import {
  Activity, Loader2, RefreshCw, TrendingUp, TrendingDown,
  Minus, Target, ShieldAlert, Waves, Info,
} from "lucide-react";
import { GlassCard, SectionLabel, NeonBadge } from "@/components/ui/GlassCard";
import { ExplanationModal } from "@/components/ui/ExplanationModal";

// ---------------------------------------------------------------------------
// Explanation content
// ---------------------------------------------------------------------------

const ELLIOTT_EXPLANATION = {
  title: "Elliott-Wellen-Theorie",
  subtitle: "Ralph Nelson Elliott, 1938",
  color: "purple" as const,
  theory:
    "Die Elliott-Wellen-Theorie beschreibt, dass Märkte in wiederkehrenden Wellenmustern verlaufen, die das kollektive Anlegerverhalten widerspiegeln. " +
    "Ein vollständiger Zyklus besteht aus 8 Wellen: 5 Impulswellen (in Trendrichtung) und 3 Korrekturwellen (A-B-C gegen den Trend). " +
    "Fibonacci-Verhältnisse bestimmen die Ausdehnung und Korrekturtiefe jeder Welle.",
  diagram: <ElliottDiagramSVG />,
  keyPoints: [
    "Welle 1, 3, 5 sind Impulswellen — Bewegung in Trendrichtung",
    "Welle 2, 4 sind Korrekturen — Welle 2 korrigiert 38,2–78,6% von Welle 1",
    "Welle 3 ist niemals die kürzeste (meist 161,8% von Welle 1)",
    "Welle 4 überlappt nie mit dem Hoch von Welle 1 (wichtigste Regel!)",
    "Nach Welle 5 folgt eine A-B-C-Korrektur von 38,2–61,8% des gesamten Impulses",
    "Fibonacci: 0.236 / 0.382 / 0.500 / 0.618 / 0.786 / 1.618 / 2.618",
  ],
  practicalTip:
    "Trading-Strategie: Einstieg am Ende von Welle 2 oder 4 mit Stop-Loss unter dem Startpunkt der jeweiligen Welle. " +
    "Das beste Risiko/Ertrags-Verhältnis bietet Welle 3 — sie ist die stärkste und längste Bewegung.",
};

function ElliottDiagramSVG() {
  const pts = {
    0: [20, 160],  1: [80, 60],   2: [120, 100],
    3: [190, 20],  4: [230, 60],  5: [300, 10],
    A: [340, 80],  B: [370, 50],  C: [410, 120],
  };
  const w = 440; const h = 180;

  const line = (a: number[], b: number[], color: string, dash = "") => (
    <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={color} strokeWidth={1.8}
      strokeDasharray={dash} strokeLinecap="round" />
  );
  const dot = (p: number[], label: string, color: string) => (
    <g key={label}>
      <circle cx={p[0]} cy={p[1]} r={4} fill={color} />
      <text x={p[0]} y={p[1] - 8} textAnchor="middle" fontSize={10} fill={color} fontWeight="bold">{label}</text>
    </g>
  );

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ maxHeight: 160 }}>
      {/* Impulse lines */}
      {line(pts[0], pts[1], "#00D4FF")}
      {line(pts[1], pts[2], "#FF0080")}
      {line(pts[2], pts[3], "#00D4FF")}
      {line(pts[3], pts[4], "#FF0080")}
      {line(pts[4], pts[5], "#00D4FF")}
      {/* Corrective */}
      {line(pts[5], pts.A, "#FFD700", "4 2")}
      {line(pts.A, pts.B, "#FFD700", "4 2")}
      {line(pts.B, pts.C, "#FFD700", "4 2")}
      {/* Dots */}
      {dot(pts[0], "0", "#64748B")}
      {dot(pts[1], "1", "#00D4FF")}
      {dot(pts[2], "2", "#FF0080")}
      {dot(pts[3], "3", "#00D4FF")}
      {dot(pts[4], "4", "#FF0080")}
      {dot(pts[5], "5", "#00D4FF")}
      {dot(pts.A, "A", "#FFD700")}
      {dot(pts.B, "B", "#FFD700")}
      {dot(pts.C, "C", "#FFD700")}
      {/* Labels */}
      <text x={2} y={175} fontSize={9} fill="#475569">← Impulse (1-2-3-4-5)</text>
      <text x={300} y={175} fontSize={9} fill="#475569">Korrektiv (A-B-C) →</text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Wave direction badge
// ---------------------------------------------------------------------------

function DirectionBadge({ dir }: { dir: string }) {
  if (dir === "bullish") return (
    <span className="flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold" style={{ background: "rgba(0,255,136,0.12)", border: "1px solid rgba(0,255,136,0.3)", color: "#00FF88" }}>
      <TrendingUp className="w-3.5 h-3.5" /> BULLISH
    </span>
  );
  if (dir === "bearish") return (
    <span className="flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold" style={{ background: "rgba(255,0,128,0.12)", border: "1px solid rgba(255,0,128,0.3)", color: "#FF0080" }}>
      <TrendingDown className="w-3.5 h-3.5" /> BEARISH
    </span>
  );
  return (
    <span className="flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold" style={{ background: "rgba(100,116,139,0.12)", border: "1px solid rgba(100,116,139,0.3)", color: "#94a3b8" }}>
      <Minus className="w-3.5 h-3.5" /> NEUTRAL
    </span>
  );
}

// ---------------------------------------------------------------------------
// Confidence bar
// ---------------------------------------------------------------------------

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 70 ? "#00FF88" : pct >= 40 ? "#FFD700" : "#FF0080";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-slate-500">Signal-Qualität</span>
        <span className="font-mono font-bold" style={{ color }}>{pct}%</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="h-full rounded-full"
          style={{ background: color, boxShadow: `0 0 8px ${color}60` }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Wave labels row
// ---------------------------------------------------------------------------

function WaveLabelsRow({ waves }: { waves: ElliottWavePoint[] }) {
  if (!waves.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {waves.map((w) => {
        const isPeak = w.wave_type === "peak";
        const isCurrent = w.is_current;
        const color = isCurrent ? "#FFD700" : isPeak ? "#00D4FF" : "#FF0080";
        return (
          <motion.div
            key={w.label + w.date}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex flex-col items-center px-3 py-2 rounded-xl"
            style={{
              background: isCurrent ? "rgba(255,215,0,0.12)" : `${color}10`,
              border: `1px solid ${color}30`,
              boxShadow: isCurrent ? "0 0 12px rgba(255,215,0,0.2)" : "none",
              minWidth: 64,
            }}
          >
            <span className="text-base font-black font-mono" style={{ color }}>
              {w.label}
            </span>
            <span className="text-xs font-mono text-slate-500 mt-0.5">
              {w.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-xs text-slate-600 mt-0.5">{w.date.slice(5)}</span>
            {isCurrent && (
              <span className="text-xs font-bold mt-1" style={{ color: "#FFD700" }}>← JETZT</span>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fibonacci table
// ---------------------------------------------------------------------------

function FibTable({ levels, currentPrice }: { levels: FibonacciLevel[]; currentPrice: number }) {
  const shown = levels.filter((l) => !l.label.startsWith("+")).slice(0, 8);
  return (
    <div className="space-y-1">
      {shown.map((l) => {
        const isNear = Math.abs(l.price - currentPrice) / currentPrice < 0.02;
        return (
          <div
            key={l.label + l.price}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
            style={{
              background: isNear ? "rgba(255,215,0,0.06)" : "rgba(255,255,255,0.02)",
              border: isNear ? "1px solid rgba(255,215,0,0.25)" : "1px solid transparent",
            }}
          >
            <span className="font-mono text-xs w-12 text-slate-400">{l.label}</span>
            <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.06)" }} />
            <span className="font-mono text-xs font-bold text-slate-200">
              ${l.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            {isNear && <span className="text-xs font-bold" style={{ color: "#FFD700" }}>≈</span>}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Price chart with wave annotations
// ---------------------------------------------------------------------------

function WaveChart({ analysis }: { analysis: ElliottWaveAnalysis }) {
  const { candles, waves, fibonacci_levels } = analysis;
  if (!candles.length) return (
    <div className="flex items-center justify-center h-48 text-slate-500 text-sm">Keine Chart-Daten</div>
  );

  // Prepare chart data
  const data = candles.map((c) => ({
    date: c.date.slice(5),
    close: c.close,
    high: c.high,
    low: c.low,
    volume: c.volume,
  }));

  // Fibonacci reference lines (key ones only)
  const keyFibs = fibonacci_levels.filter((l) => ["38.2%", "50.0%", "61.8%"].includes(l.label));
  const currentPrice = candles[candles.length - 1]?.close ?? 0;
  const minY = Math.min(...candles.map((c) => c.low)) * 0.995;
  const maxY = Math.max(...candles.map((c) => c.high)) * 1.005;

  // Wave annotation lines (vertical)
  const waveAnnotations = waves.map((w) => {
    const candleIdx = candles.findIndex((c) => c.date >= w.date);
    const barDate = candleIdx >= 0 ? candles[candleIdx].date.slice(5) : null;
    const isPeak = w.wave_type === "peak";
    return { label: w.label, date: barDate, color: isPeak ? "#00D4FF" : "#FF0080" };
  }).filter((a) => a.date);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: "#475569" }}
          tickLine={false}
          axisLine={false}
          interval={Math.floor(data.length / 6)}
        />
        <YAxis
          domain={[minY, maxY]}
          tick={{ fontSize: 10, fill: "#475569" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `$${v.toFixed(0)}`}
          width={50}
        />
        <Tooltip
          contentStyle={{
            background: "rgba(8,11,20,0.95)",
            border: "1px solid rgba(0,212,255,0.2)",
            borderRadius: 8,
            fontSize: 12,
          }}
          formatter={(v: number) => [`$${v.toFixed(2)}`]}
        />

        {/* Fibonacci reference lines */}
        {keyFibs.map((f) => (
          <ReferenceLine
            key={f.label}
            y={f.price}
            stroke="rgba(255,215,0,0.3)"
            strokeDasharray="4 2"
            label={{ value: f.label, position: "insideTopRight", fontSize: 9, fill: "#FFD700" }}
          />
        ))}

        {/* Wave vertical markers */}
        {waveAnnotations.map((a) => (
          <ReferenceLine
            key={a.label + a.date}
            x={a.date!}
            stroke={a.color}
            strokeOpacity={0.5}
            strokeDasharray="2 2"
            label={{ value: a.label, position: "top", fontSize: 9, fill: a.color, fontWeight: "bold" }}
          />
        ))}

        {/* Current price */}
        <ReferenceLine
          y={currentPrice}
          stroke="rgba(255,255,255,0.3)"
          strokeDasharray="2 4"
        />

        <Area
          type="monotone"
          dataKey="close"
          stroke="#00D4FF"
          strokeWidth={1.5}
          fill="rgba(0,212,255,0.06)"
          dot={false}
          activeDot={{ r: 3, fill: "#00D4FF" }}
        />

        <Bar
          dataKey="volume"
          fill="rgba(255,255,255,0.04)"
          yAxisId={0}
          opacity={0.4}
          maxBarSize={4}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

const PERIODS = ["1mo", "3mo", "6mo", "1y", "2y"];

export default function AnalysisPage() {
  const [ticker, setTicker] = useState("AAPL");
  const [period, setPeriod] = useState("6mo");
  const [analysis, setAnalysis] = useState<ElliottWaveAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [explanationOpen, setExplanationOpen] = useState(false);
  const [isLiveData, setIsLiveData] = useState(false);

  const load = useCallback(async (t: string, p: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.analysis.elliott(t.toUpperCase(), p);
      setAnalysis(data);
      setIsLiveData(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analyse fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Load demo on mount
    api.analysis.elliottDemo()
      .then((data) => { setAnalysis(data); setTicker(data.ticker); setIsLiveData(false); })
      .catch(() => {});
  }, []);

  const currentPrice = analysis?.candles?.at(-1)?.close ?? 0;

  return (
    <div className="space-y-5">
      {/* ExplanationModal */}
      <ExplanationModal
        open={explanationOpen}
        onClose={() => setExplanationOpen(false)}
        content={ELLIOTT_EXPLANATION}
      />

      {/* Header */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <div className="flex items-start justify-between mb-1">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(123,47,255,0.15)", border: "1px solid rgba(123,47,255,0.3)" }}>
              <Waves className="w-4 h-4" style={{ color: "#7B2FFF" }} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-100">Elliott-Wellen</h1>
              {analysis && (
                <p className="text-xs text-slate-500 mt-0.5">{analysis.ticker} · {analysis.period} · {analysis.wave_degree}</p>
              )}
            </div>
            {analysis && (
              <NeonBadge color="purple">
                {analysis.sequence_type === "impulse" ? "Impuls 1-2-3-4-5" : "Korrektur A-B-C"}
              </NeonBadge>
            )}
            {isLiveData ? (
              <NeonBadge color="green">LIVE</NeonBadge>
            ) : (
              <span className="text-xs font-bold px-2.5 py-1 rounded-full"
                style={{ background: "rgba(100,116,139,0.12)", border: "1px solid rgba(100,116,139,0.3)", color: "#64748B" }}>
                DEMO
              </span>
            )}
          </div>
          <button
            onClick={() => setExplanationOpen(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all"
            style={{ background: "rgba(123,47,255,0.1)", border: "1px solid rgba(123,47,255,0.3)", color: "#7B2FFF" }}
          >
            <Info className="w-3.5 h-3.5" />
            Theorie erklären
          </button>
        </div>
        <p className="text-sm text-slate-500">
          Automatische Wellenanalyse · Fibonacci-Validierung · Echtzeit-Kursdaten via yfinance
        </p>
      </motion.div>

      {/* Ticker input */}
      <GlassCard>
        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex-1 min-w-40">
            <label className="block text-xs font-semibold tracking-wider mb-1.5 text-slate-500">TICKER</label>
            <input
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && load(ticker, period)}
              placeholder="AAPL, TSLA, BTC-USD…"
              className="w-full rounded-xl px-4 py-2.5 text-sm font-mono text-slate-200 placeholder-slate-600 outline-none"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold tracking-wider mb-1.5 text-slate-500">PERIODE</label>
            <div className="flex gap-1.5">
              {PERIODS.map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className="px-3 py-2.5 rounded-xl text-xs font-bold transition-all"
                  style={{
                    background: period === p ? "rgba(123,47,255,0.2)" : "rgba(255,255,255,0.04)",
                    border: period === p ? "1px solid rgba(123,47,255,0.5)" : "1px solid rgba(255,255,255,0.08)",
                    color: period === p ? "#7B2FFF" : "#64748B",
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={() => load(ticker, period)}
            disabled={loading || !ticker.trim()}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, rgba(123,47,255,0.2), rgba(0,212,255,0.1))", border: "1px solid rgba(123,47,255,0.4)", color: "#7B2FFF" }}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
            Analysieren
          </button>
          {analysis && !loading && (
            <button
              onClick={() => load(ticker, period)}
              className="p-2.5 rounded-xl transition-all"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#64748B" }}
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}
        </div>
        {error && (
          <p className="mt-3 text-sm text-red-400 font-medium">{error}</p>
        )}
      </GlassCard>

      {loading && !analysis && (
        <GlassCard className="flex items-center justify-center py-16">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3" style={{ color: "#7B2FFF" }} />
            <p className="text-slate-400">Berechne Elliott-Wellen…</p>
          </div>
        </GlassCard>
      )}

      {analysis && (
        <>
          {/* Summary row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Aktuelle Welle", value: analysis.current_wave, color: "#FFD700" },
              { label: "Sequenz", value: analysis.sequence_type === "impulse" ? "Impuls" : "Korrektur", color: "#7B2FFF" },
              { label: "Stop-Loss", value: `$${analysis.stop_loss.toFixed(2)}`, color: "#FF0080" },
              { label: "Nächstes Ziel", value: analysis.price_targets[0] ? `$${analysis.price_targets[0].toFixed(2)}` : "—", color: "#00FF88" },
            ].map(({ label, value, color }) => (
              <GlassCard key={label} padding="p-3" delay={0.05}>
                <p className="text-xs text-slate-500 mb-1">{label}</p>
                <p className="text-lg font-bold font-mono" style={{ color }}>{value}</p>
              </GlassCard>
            ))}
          </div>

          {/* Chart + direction */}
          <GlassCard delay={0.1}>
            <div className="flex items-center justify-between mb-3">
              <SectionLabel>Preis-Chart mit Wellenpunkten</SectionLabel>
              <div className="flex items-center gap-2">
                <DirectionBadge dir={analysis.wave_direction} />
              </div>
            </div>
            <WaveChart analysis={analysis} />
            <p className="text-xs text-slate-600 mt-2 text-center">
              Vertikale Linien = Wave-Pivot-Punkte · Goldene Linien = Fibonacci-Retracement
            </p>
          </GlassCard>

          {/* Wave labels */}
          <GlassCard delay={0.15}>
            <div className="flex items-center justify-between mb-4">
              <SectionLabel>Wellen-Sequenz</SectionLabel>
              <ConfidenceBar value={analysis.confidence} />
            </div>
            <WaveLabelsRow waves={analysis.waves} />
          </GlassCard>

          {/* Fibonacci + targets */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <GlassCard delay={0.2}>
              <SectionLabel>Fibonacci-Levels</SectionLabel>
              <FibTable levels={analysis.fibonacci_levels} currentPrice={currentPrice} />
            </GlassCard>

            <GlassCard delay={0.25}>
              <SectionLabel>Preisziele &amp; Interpretation</SectionLabel>
              <div className="space-y-3">
                {/* Targets */}
                {analysis.price_targets.map((t, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Target className="w-4 h-4 flex-shrink-0" style={{ color: "#00FF88" }} />
                    <div className="flex-1">
                      <p className="text-xs text-slate-500">Ziel {i + 1} ({i === 0 ? "161.8%" : "261.8%"} Extension)</p>
                      <p className="font-mono font-bold text-sm" style={{ color: "#00FF88" }}>
                        ${t.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>
                ))}
                {/* Stop */}
                <div className="flex items-center gap-3">
                  <ShieldAlert className="w-4 h-4 flex-shrink-0 text-red-400" />
                  <div>
                    <p className="text-xs text-slate-500">Stop-Loss (−3% von W0)</p>
                    <p className="font-mono font-bold text-sm text-red-400">${analysis.stop_loss.toFixed(2)}</p>
                  </div>
                </div>
                {/* Interpretation */}
                <div className="mt-3 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <p className="text-xs text-slate-400 leading-relaxed">{analysis.interpretation}</p>
                </div>
              </div>
            </GlassCard>
          </div>
        </>
      )}
    </div>
  );
}
