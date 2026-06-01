"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import type { RiskMetrics, RiskLimits } from "@/types";
import {
  Shield, AlertTriangle, RefreshCw, TrendingDown,
  Activity, Zap, BarChart2,
} from "lucide-react";
import { GlassCard, SectionLabel, NeonBadge } from "@/components/ui/GlassCard";
import { ExplanationModal, InfoButton } from "@/components/ui/ExplanationModal";
import type { ExplanationContent } from "@/components/ui/ExplanationModal";
import { useAlertsStream } from "@/hooks/useWebSocket";

/* ---- Mock data ---- */
const MOCK_RISK: RiskMetrics = {
  portfolio_var_95: 3240,
  portfolio_var_99: 5180,
  max_drawdown: 0.087,
  current_drawdown: 0.023,
  sharpe_ratio: 1.84,
  beta: 0.72,
  concentration_risk: 0.35,
  leverage: 1.0,
  alerts: [],
};

/* ---- Tachometer Gauge ---- */
function TachometerGauge({
  value, max, label, unit, warnAt = 0.7, critAt = 0.9,
}: {
  value: number; max: number; label: string; unit: string; warnAt?: number; critAt?: number;
}) {
  const pct = Math.min(value / max, 1);
  const isCrit = pct >= critAt;
  const isWarn = pct >= warnAt && !isCrit;
  const color = isCrit ? "#FF0080" : isWarn ? "#FFD700" : "#00FF88";

  // Arc geometry: 220° sweep, starting at 160° (lower-left)
  const R = 70; const cx = 90; const cy = 90;
  const startDeg = 160; const sweepDeg = 220;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const arcStart = { x: cx + R * Math.cos(toRad(startDeg)), y: cy + R * Math.sin(toRad(startDeg)) };
  const arcEnd   = { x: cx + R * Math.cos(toRad(startDeg + sweepDeg)), y: cy + R * Math.sin(toRad(startDeg + sweepDeg)) };
  const fillEnd  = startDeg + pct * sweepDeg;
  const fillPt   = { x: cx + R * Math.cos(toRad(fillEnd)), y: cy + R * Math.sin(toRad(fillEnd)) };
  const largeArc = (angle: number) => angle > 180 ? 1 : 0;

  // Needle
  const needleDeg = startDeg + pct * sweepDeg;
  const needleLen = 55;
  const nx = cx + needleLen * Math.cos(toRad(needleDeg));
  const ny = cy + needleLen * Math.sin(toRad(needleDeg));

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6 }}
      className="flex flex-col items-center rounded-2xl p-5"
      style={{
        background: "linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))",
        border: `1px solid ${color}25`,
      }}
    >
      <svg width="180" height="110" viewBox="0 0 180 110">
        <defs>
          <linearGradient id={`arc-grad-${label}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#00FF88" />
            <stop offset="50%" stopColor="#FFD700" />
            <stop offset="100%" stopColor="#FF0080" />
          </linearGradient>
          <filter id={`glow-${label}`}>
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Background arc */}
        <path
          d={`M ${arcStart.x},${arcStart.y} A ${R},${R} 0 ${largeArc(sweepDeg)} 1 ${arcEnd.x},${arcEnd.y}`}
          fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="10" strokeLinecap="round"
        />

        {/* Fill arc */}
        {pct > 0 && (
          <path
            d={`M ${arcStart.x},${arcStart.y} A ${R},${R} 0 ${largeArc(pct * sweepDeg)} 1 ${fillPt.x},${fillPt.y}`}
            fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 6px ${color})` }}
          />
        )}

        {/* Tick marks */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const d = startDeg + t * sweepDeg;
          const r1 = R + 8; const r2 = R + 14;
          return (
            <line
              key={t}
              x1={cx + r1 * Math.cos(toRad(d))} y1={cy + r1 * Math.sin(toRad(d))}
              x2={cx + r2 * Math.cos(toRad(d))} y2={cy + r2 * Math.sin(toRad(d))}
              stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeLinecap="round"
            />
          );
        })}

        {/* Needle */}
        <line
          x1={cx} y1={cy} x2={nx} y2={ny}
          stroke={color} strokeWidth="2" strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 4px ${color})` }}
        />
        <circle cx={cx} cy={cy} r="5" fill={color} style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
        <circle cx={cx} cy={cy} r="3" fill="#080B14" />

        {/* Value text */}
        <text
          x={cx} y={cy - 25}
          textAnchor="middle" fill={color}
          fontSize="16" fontFamily="JetBrains Mono" fontWeight="bold"
          style={{ filter: `drop-shadow(0 0 6px ${color})` }}
        >
          {unit === "%" ? `${(value * 100).toFixed(1)}%` : value.toFixed(2)}
        </text>
      </svg>

      <p className="text-sm font-semibold text-slate-300 mt-1">{label}</p>
      {isCrit && <NeonBadge color="pink">CRITICAL</NeonBadge>}
      {isWarn && <NeonBadge color="yellow">WARNING</NeonBadge>}
      {!isCrit && !isWarn && <NeonBadge color="green">OK</NeonBadge>}
    </motion.div>
  );
}

/* ---- Horizontal risk bar ---- */
function RiskBar({ label, value, max, unit = "%" }: {
  label: string; value: number; max: number; unit?: string;
}) {
  const pct = Math.min((value / max) * 100, 100);
  const color = pct >= 80 ? "#FF0080" : pct >= 55 ? "#FFD700" : "#00FF88";
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-400">{label}</span>
        <span className="font-mono font-bold" style={{ color }}>
          {unit === "$" ? `$${value.toLocaleString()}` : unit === "x" ? `${value.toFixed(2)}x` : `${(value * 100).toFixed(1)}%`}
        </span>
      </div>
      <div className="relative h-2 bg-white/5 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="h-full rounded-full"
          style={{ background: `linear-gradient(90deg, #00FF88, ${color})`, boxShadow: `0 0 6px ${color}` }}
        />
      </div>
    </div>
  );
}

/* ============================================================ */
function computeRiskLevel(m: RiskMetrics): "LOW" | "MEDIUM" | "HIGH" {
  if (
    m.alerts.length > 0 ||
    m.current_drawdown >= 0.08 ||
    m.concentration_risk >= 0.65 ||
    m.leverage >= 2.0
  ) return "HIGH";
  if (
    m.current_drawdown >= 0.04 ||
    m.concentration_risk >= 0.45 ||
    m.sharpe_ratio < 0.5
  ) return "MEDIUM";
  return "LOW";
}

function LimitRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-xs font-mono font-bold" style={{ color: valueColor ?? "#CBD5E1" }}>{value}</span>
    </div>
  );
}

const EXPLAIN_VAR: ExplanationContent = {
  title: "Value at Risk (VaR)",
  subtitle: "Statistische Risikomessung",
  color: "pink",
  theory:
    "VaR quantifiziert den maximalen erwarteten Tagesverlust bei gegebener Wahrscheinlichkeit. " +
    "VaR 95% bedeutet: An 19 von 20 Handelstagen überschreitet der Verlust diesen Wert nicht. " +
    "VaR 99% ist strenger — nur 1% der Tage haben höhere Verluste. Berechnung via historische Simulation über 252 Handelstage.",
  keyPoints: [
    "VaR 95%: Überschritten an ~1 von 20 Handelstagen (normal)",
    "VaR 99%: Überschritten an ~1 von 100 Handelstagen (Extremrisiko)",
    "Max Drawdown: Größter Verlust von Hoch zu Tief — historisch",
    "Sharpe > 1.5 gilt als gut; Sharpe > 2.0 als sehr gut",
    "VaR ist kein garantierter Maximalverlust — nur ein statistisches Maß",
  ],
  practicalTip:
    "Wenn VaR 95% mehr als 2% des Portfolio-Werts beträgt, ist das Risiko erhöht. " +
    "In Krisenzeiten (Crash, Black Swan) kann der tatsächliche Verlust VaR 99% weit überschreiten — daher immer Stop-Loss setzen.",
};

const EXPLAIN_EXPOSURE: ExplanationContent = {
  title: "Portfolio-Exposure",
  subtitle: "Risiko-Konzentration & Leverage",
  color: "purple",
  theory:
    "Konzentrations-Risiko misst, wie stark das Portfolio von wenigen Positionen abhängt. " +
    "Ein gut diversifiziertes Portfolio hat < 30% in der größten Position. " +
    "Leverage (Hebel) multipliziert Gewinne UND Verluste — im Paper-Mode immer 1.0x.",
  keyPoints: [
    "Konzentration > 50% bedeutet starke Abhängigkeit von einer Position",
    "Drawdown > 10% ist ein Warnsignal für zu hohes Risiko",
    "Leverage 1x = kein Hebel (normaler Kassahandel)",
    "Beta misst die Korrelation mit dem Markt (S&P 500) — Beta 1.0 = marktkonform",
  ],
  practicalTip:
    "Kein einzelnes Asset sollte > 25% des Portfolios ausmachen. " +
    "Wenn Konzentration > 40%, defensive Positionen hinzufügen oder rebalancen.",
};

export default function RiskPage() {
  const [metrics, setMetrics] = useState<RiskMetrics>(MOCK_RISK);
  const [limits, setLimits] = useState<RiskLimits | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasRealData, setHasRealData] = useState(false);
  const [explainContent, setExplainContent] = useState<ExplanationContent | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [m, l, a] = await Promise.all([
        api.risk.metrics(),
        api.risk.limits(),
        api.risk.alerts().catch(() => [] as string[]),
      ]);
      setMetrics({ ...m, alerts: a.length > 0 ? a : m.alerts });
      setLimits(l);
      setHasRealData(true);
    } catch {
      // use mock data
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  // Subscribe to WS "alerts" channel — append risk_alert messages in real-time
  const { lastEvent: alertEvent } = useAlertsStream();
  useEffect(() => {
    if (!alertEvent) return;
    const raw = alertEvent as unknown as { type?: string; message?: string };
    if (raw.type === "risk_alert" && raw.message) {
      setMetrics((prev) => ({
        ...prev,
        alerts: [raw.message!, ...prev.alerts].slice(0, 20), // keep last 20
      }));
    }
  }, [alertEvent]);

  // Simulate live risk updates only when using mock data (no real API data available)
  useEffect(() => {
    if (hasRealData) return;
    const interval = setInterval(() => {
      setMetrics((prev) => ({
        ...prev,
        current_drawdown: Math.max(0, prev.current_drawdown + (Math.random() - 0.5) * 0.002),
        sharpe_ratio: Math.max(0, prev.sharpe_ratio + (Math.random() - 0.5) * 0.05),
      }));
    }, 4000);
    return () => clearInterval(interval);
  }, [hasRealData]);

  const riskLevel = computeRiskLevel(metrics);
  const riskColor = { LOW: "#00FF88", MEDIUM: "#FFD700", HIGH: "#FF0080" }[riskLevel];
  const hasAlerts = metrics.alerts && metrics.alerts.length > 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="flex items-center gap-3 mb-1">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: "rgba(255,0,128,0.15)", border: "1px solid rgba(255,0,128,0.3)" }}
            >
              <Shield className="w-4 h-4" style={{ color: "#FF0080" }} />
            </div>
            <h1 className="text-2xl font-bold text-slate-100">Risiko-Panel</h1>
            <span
              className="text-xs px-3 py-1 rounded-full font-bold"
              style={{
                background: `${riskColor}15`,
                border: `1px solid ${riskColor}40`,
                color: riskColor,
                textShadow: `0 0 8px ${riskColor}`,
              }}
            >
              {riskLevel} RISIKO
            </span>
            {hasRealData ? (
              <NeonBadge color="green">LIVE</NeonBadge>
            ) : (
              <span className="text-xs font-bold px-2.5 py-1 rounded-full"
                style={{ background: "rgba(100,116,139,0.12)", border: "1px solid rgba(100,116,139,0.3)", color: "#64748B" }}>
                DEMO
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500">
            Jesse Risikomodul · TradingAgents Risk Agent · Echtzeit-Überwachung
          </p>
        </motion.div>

        <button
          onClick={load}
          className="flex items-center gap-2 text-xs px-3 py-2 rounded-xl transition-all"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            color: "#64748B",
          }}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Aktualisieren
        </button>
      </div>

      {/* Alert Banner */}
      {hasAlerts && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl p-4 flex items-start gap-3"
          style={{
            background: "rgba(255,0,128,0.1)",
            border: "1px solid rgba(255,0,128,0.4)",
            boxShadow: "0 0 20px rgba(255,0,128,0.15)",
            animation: "glow-pulse-pink 2s ease-in-out infinite",
          }}
        >
          <AlertTriangle className="w-5 h-5 text-neon-pink flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-neon-pink mb-1">RISIKOALARME AKTIV</p>
            <ul className="space-y-1">
              {metrics.alerts.map((a, i) => (
                <li key={i} className="text-sm text-slate-300 flex items-start gap-2">
                  <span style={{ color: "#FF0080" }}>·</span> {a}
                </li>
              ))}
            </ul>
          </div>
        </motion.div>
      )}

      {/* Tachometer Gauges row */}
      <GlassCard delay={0.1} padding="p-5">
        <div className="flex items-center justify-between">
          <SectionLabel>Risikoanzeigen</SectionLabel>
          <InfoButton onClick={() => setExplainContent(EXPLAIN_VAR)} color="pink" className="-mt-2" />
        </div>
        <div className="grid grid-cols-4 gap-4 mt-4">
          <TachometerGauge
            value={metrics.current_drawdown}
            max={0.2}
            label="Akt. Drawdown"
            unit="%"
            warnAt={0.6}
            critAt={0.85}
          />
          <TachometerGauge
            value={metrics.concentration_risk}
            max={1}
            label="Konzentration"
            unit="%"
            warnAt={0.5}
            critAt={0.75}
          />
          <TachometerGauge
            value={metrics.leverage}
            max={3}
            label="Leverage"
            unit="x"
            warnAt={0.4}
            critAt={0.65}
          />
          <TachometerGauge
            value={metrics.sharpe_ratio}
            max={3}
            label="Sharpe Ratio"
            unit="x"
            warnAt={0.95}  // High is GOOD for Sharpe — invert logic visually
            critAt={0.99}
          />
        </div>
      </GlassCard>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "VaR 95%",      value: `$${metrics.portfolio_var_95.toLocaleString()}`, color: "#00D4FF", icon: BarChart2 },
          { label: "VaR 99%",      value: `$${metrics.portfolio_var_99.toLocaleString()}`, color: "#7B2FFF", icon: TrendingDown },
          { label: "Max. Drawdown", value: `${(metrics.max_drawdown * 100).toFixed(2)}%`,  color: "#FF0080", icon: Activity },
          { label: "Beta",         value: metrics.beta?.toFixed(2) ?? "k.A.",              color: "#FFD700", icon: Zap },
        ].map(({ label, value, color, icon: Icon }, i) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + i * 0.06 }}
            className="rounded-xl p-4 relative overflow-hidden"
            style={{
              background: "linear-gradient(135deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))",
              border: `1px solid ${color}25`,
            }}
          >
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center mb-3"
              style={{ background: `${color}15`, border: `1px solid ${color}30` }}
            >
              <Icon className="w-4 h-4" style={{ color }} />
            </div>
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">{label}</p>
            <p className="text-2xl font-bold font-mono" style={{ color, textShadow: `0 0 15px ${color}50` }}>{value}</p>
          </motion.div>
        ))}
      </div>

      {/* Risk bar gauges */}
      <div className="grid grid-cols-2 gap-4">
        <GlassCard delay={0.3}>
          <div className="flex items-center justify-between">
            <SectionLabel>Portfolio-Exposure</SectionLabel>
            <InfoButton onClick={() => setExplainContent(EXPLAIN_EXPOSURE)} color="purple" className="-mt-2" />
          </div>
          <div className="space-y-4 mt-3">
            <RiskBar label="Konzentrations-Risiko (Top 5)" value={metrics.concentration_risk} max={1} />
            <RiskBar label="Akt. Drawdown" value={metrics.current_drawdown} max={0.2} />
            <RiskBar label="Leverage" value={metrics.leverage} max={3} unit="x" />
          </div>
        </GlassCard>

        <GlassCard delay={0.35}>
          <SectionLabel>Konfigurierte Risikolimits</SectionLabel>
          <div className="space-y-3 mt-3">
            {limits ? (
              <>
                <LimitRow label="Max. Positionsgröße" value={`${(limits.max_position_size_pct * 100).toFixed(0)}%`} />
                <LimitRow label="Max. Tagesverlust" value={`${(limits.max_daily_loss_pct * 100).toFixed(0)}%`} />
                <LimitRow label="Max. Leverage" value={`${limits.max_leverage}×`} />
                <LimitRow
                  label="Live-Trading"
                  value={limits.enable_live_trading ? "Aktiviert" : "Deaktiviert"}
                  valueColor={limits.enable_live_trading ? "#FF0080" : "#00FF88"}
                />
              </>
            ) : (
              <>
                <LimitRow label="Max. Positionsgröße" value="—" />
                <LimitRow label="Max. Tagesverlust" value="—" />
                <LimitRow label="Max. Leverage" value="—" />
                <LimitRow label="Live-Trading" value="—" />
              </>
            )}
          </div>
        </GlassCard>
      </div>

      {explainContent && (
        <ExplanationModal
          open={explainContent !== null}
          onClose={() => setExplainContent(null)}
          content={explainContent}
        />
      )}
    </div>
  );
}
