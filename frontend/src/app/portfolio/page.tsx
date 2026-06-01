"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import CountUp from "react-countup";
import { api } from "@/lib/api";
import type { PortfolioSnapshot, PortfolioAnalytics, Position } from "@/types";
import { useTradingStore } from "@/store/tradingStore";
import {
  Briefcase, RefreshCw, TrendingUp, TrendingDown,
  DollarSign, PieChart, Activity, BarChart2,
} from "lucide-react";
import { GlassCard, SectionLabel, NeonBadge } from "@/components/ui/GlassCard";
import { ExplanationModal, InfoButton } from "@/components/ui/ExplanationModal";
import type { ExplanationContent } from "@/components/ui/ExplanationModal";
import {
  AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid,
} from "recharts";

// ---------------------------------------------------------------------------
// Correlation Heatmap (5x5)
// ---------------------------------------------------------------------------

function CorrelationHeatmap({ matrix, tickers }: { matrix: Record<string, Record<string, number>>; tickers: string[] }) {
  function colorFor(val: number): string {
    // val in [-1, 1] → Red (negative) → White (0) → Green (positive)
    if (val >= 0) {
      const intensity = Math.round(val * 180);
      return `rgba(0, ${100 + intensity}, 80, ${0.4 + val * 0.5})`;
    } else {
      const intensity = Math.round(Math.abs(val) * 180);
      return `rgba(${100 + intensity}, 0, 60, ${0.4 + Math.abs(val) * 0.5})`;
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="text-xs font-mono">
        <thead>
          <tr>
            <th className="w-16 pr-2" />
            {tickers.map((t) => (
              <th key={t} className="w-16 text-center text-slate-500 pb-1 font-semibold">{t.replace("-USD", "")}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tickers.map((t1) => (
            <tr key={t1}>
              <td className="text-slate-500 pr-2 py-0.5 text-right font-semibold">{t1.replace("-USD", "")}</td>
              {tickers.map((t2) => {
                const val = matrix[t1]?.[t2] ?? 0;
                return (
                  <td key={t2} className="w-16 h-8 text-center rounded transition-all" style={{ background: colorFor(val) }}>
                    <span className="text-white font-bold" style={{ fontSize: "10px" }}>
                      {val.toFixed(2)}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-slate-600 mt-2">
        Grün = positive Korrelation &nbsp;|&nbsp; Rot = negative Korrelation
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Analytics Panel
// ---------------------------------------------------------------------------

function AnalyticsPanel() {
  const [data, setData] = useState<PortfolioAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showExplain, setShowExplain] = useState(false);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.portfolio.analytics());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analytics konnten nicht geladen werden");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAnalytics(); }, [loadAnalytics]);

  return (
    <>
    <GlassCard variant="purple" delay={0.4}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-purple-400" />
          <SectionLabel>Portfolio-Analyse — 30 Tage</SectionLabel>
        </div>
        <div className="flex items-center gap-2">
          <InfoButton onClick={() => setShowExplain(true)} color="purple" />
          <button
            onClick={loadAnalytics}
          className="text-xs px-2 py-1 rounded-lg text-slate-500 hover:text-slate-300 transition-colors"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
        >
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
        </button>
        </div>
      </div>

      {loading && !data && (
        <div className="flex items-center justify-center py-10">
          <RefreshCw className="w-5 h-5 animate-spin text-purple-400" />
          <span className="ml-2 text-xs text-slate-500">Berechne Kennzahlen via yfinance…</span>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-400 text-center py-4">{error}</p>
      )}

      {data && (
        <div className="space-y-5">
          {/* Key metrics row */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {[
              { label: "Sharpe Ratio", value: data.sharpe_ratio.toFixed(3), color: data.sharpe_ratio >= 1 ? "#00FF88" : data.sharpe_ratio >= 0 ? "#FFD700" : "#FF0080", hint: "Annualisiert, rf=0" },
              { label: "Beta vs SPY", value: data.beta.toFixed(3), color: "#00D4FF", hint: "Marktkorrelation" },
              { label: "Volatilität 30T", value: `${(data.volatility_30d * 100).toFixed(1)}%`, color: "#7B2FFF", hint: "Annualisiert" },
              { label: "Bester Wert", value: data.best_performer.ticker, color: "#00FF88", hint: `${data.best_performer.return_pct > 0 ? "+" : ""}${data.best_performer.return_pct.toFixed(1)}%` },
              { label: "Schwächster Wert", value: data.worst_performer.ticker, color: "#FF0080", hint: `${data.worst_performer.return_pct.toFixed(1)}%` },
            ].map(({ label, value, color, hint }) => (
              <div
                key={label}
                className="rounded-xl p-3"
                style={{
                  background: `${color}08`,
                  border: `1px solid ${color}20`,
                }}
              >
                <p className="text-xs text-slate-600 mb-1">{label}</p>
                <p className="text-lg font-bold font-mono" style={{ color }}>{value}</p>
                <p className="text-xs text-slate-600">{hint}</p>
              </div>
            ))}
          </div>

          {/* Worst performer */}
          <div className="flex items-center gap-3 p-3 rounded-xl"
            style={{ background: "rgba(255,0,128,0.05)", border: "1px solid rgba(255,0,128,0.15)" }}>
            <TrendingDown className="w-4 h-4 text-pink-500 flex-shrink-0" />
            <div>
              <p className="text-xs text-slate-500">Schwächster Titel (30T)</p>
              <p className="font-bold font-mono text-pink-400">{data.worst_performer.ticker} &nbsp;
                <span className="text-sm">{data.worst_performer.return_pct.toFixed(1)}%</span>
              </p>
            </div>
          </div>

          {/* Correlation heatmap */}
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-3 font-semibold">Korrelationsmatrix</p>
            <CorrelationHeatmap matrix={data.correlation_matrix} tickers={data.tickers} />
          </div>
        </div>
      )}
    </GlassCard>

    {showExplain && (
      <ExplanationModal
        open={showExplain}
        onClose={() => setShowExplain(false)}
        content={EXPLAIN_ANALYTICS}
      />
    )}
  </>
  );
}

const MOCK_PORTFOLIO: PortfolioSnapshot = {
  timestamp: new Date().toISOString(),
  total_value: 124850.00,
  cash: 28320.00,
  invested: 96530.00,
  total_pnl: 14850.00,
  total_pnl_pct: 0.1347,
  day_pnl: 1247.30,
  day_pnl_pct: 0.0101,
  positions: [
    { ticker: "NVDA", asset_class: "stock",  quantity: 25,  avg_entry_price: 720.00, current_price: 875.20, market_value: 21880, unrealized_pnl: 3880, unrealized_pnl_pct: 0.2156, realized_pnl: 0, weight: 0.226 },
    { ticker: "BTC",  asset_class: "crypto", quantity: 0.5, avg_entry_price: 58000,  current_price: 67420,  market_value: 33710, unrealized_pnl: 4710, unrealized_pnl_pct: 0.1624, realized_pnl: 0, weight: 0.349 },
    { ticker: "AAPL", asset_class: "stock",  quantity: 80,  avg_entry_price: 175.00, current_price: 189.43, market_value: 15154, unrealized_pnl: 1154, unrealized_pnl_pct: 0.0824, realized_pnl: 0, weight: 0.157 },
    { ticker: "MSFT", asset_class: "stock",  quantity: 30,  avg_entry_price: 395.00, current_price: 415.80, market_value: 12474, unrealized_pnl: 624,  unrealized_pnl_pct: 0.0527, realized_pnl: 0, weight: 0.129 },
    { ticker: "TSLA", asset_class: "stock",  quantity: 40,  avg_entry_price: 260.00, current_price: 248.75, market_value: 9950,  unrealized_pnl: -450, unrealized_pnl_pct: -0.0433, realized_pnl: 0, weight: 0.103 },
  ],
};

// Mock equity curve
function generateEquityCurve() {
  const data = [];
  let val = 100000;
  for (let i = 60; i >= 0; i--) {
    val = val + (Math.random() - 0.42) * 2000;
    const d = new Date();
    d.setDate(d.getDate() - i);
    data.push({ date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }), value: Math.round(val) });
  }
  return data;
}

const EQUITY_CURVE = generateEquityCurve();
const COLORS = ["#00D4FF", "#00FF88", "#7B2FFF", "#FFD700", "#FF0080"];

const EXPLAIN_ANALYTICS: ExplanationContent = {
  title: "Portfolio-Analytics",
  subtitle: "Sharpe, Beta, Volatilität",
  color: "purple",
  theory:
    "Portfolio-Analytics misst die risikobereinigte Performance über 30 Tage. " +
    "Sharpe Ratio = (Rendite − risikofreier Zins) / Volatilität. Je höher, desto besser die Rendite pro Risikoeinheit. " +
    "Beta misst die Sensitivität gegenüber dem Markt — Beta > 1 bedeutet, das Portfolio bewegt sich stärker als der S&P 500.",
  keyPoints: [
    "Sharpe > 1.5: Gut — Rendite rechtfertigt das Risiko",
    "Sharpe > 2.0: Sehr gut — selten zu erreichen dauerhaft",
    "Beta < 0.8: Defensiv — dämpft Marktbewegungen",
    "Beta > 1.2: Aggressiv — verstärkt Marktbewegungen",
    "Volatilität 30d: Schwankungsbreite der täglichen Renditen (annualisiert)",
    "Korrelationsmatrix: Niedrige Korrelation zwischen Positionen = bessere Diversifikation",
  ],
  practicalTip:
    "Ziel: Sharpe > 1.5, Beta 0.7–1.0, Volatilität < 20%. " +
    "Wenn Best Performer mehr als 3x besser als Worst Performer ist, überprüfe ob das Portfolio zu konzentriert ist.",
};

const EXPLAIN_EQUITY: ExplanationContent = {
  title: "Equity Curve",
  subtitle: "Portfolio-Wertentwicklung über Zeit",
  color: "cyan",
  theory:
    "Die Equity Curve zeigt den kumulierten Portfolio-Wert über Zeit. " +
    "Ein gleichmäßig steigender Verlauf deutet auf konsistente Gewinne hin. " +
    "Starke Einbrüche (Drawdowns) sind sichtbar als V-förmige Rückgänge.",
  keyPoints: [
    "Steiler Anstieg = gute Periode mit starken Trades",
    "Flacher Bereich = Konsolidierung, keine klaren Signale",
    "V-förmiger Einbruch = Drawdown, dann Erholung",
    "Neue Hochs (All Time High) = Portfolio in Wachstumsphase",
  ],
  practicalTip:
    "Wenn die Equity Curve einen neuen Tiefstand macht (Lower Low), ist das ein Warnsignal — Strategie oder Risikomanagement überprüfen.",
};

export default function PortfolioPage() {
  const [portfolio, setPortfolio] = useState<PortfolioSnapshot>(MOCK_PORTFOLIO);
  const [equityCurve, setEquityCurve] = useState<Array<{ date: string; value: number }>>(EQUITY_CURVE);
  const [loading, setLoading] = useState(false);
  const [isLiveData, setIsLiveData] = useState(false);
  const [explainContent, setExplainContent] = useState<ExplanationContent | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [p, curve] = await Promise.all([
        api.portfolio.snapshot(),
        api.portfolio.equityCurve(60),
      ]);
      setPortfolio(p);
      if (curve.length > 0) setEquityCurve(curve);
      setIsLiveData(true);
    } catch { setIsLiveData(false); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  // Enrich positions with live WS prices when available
  const storePrices = useTradingStore((s) => s.prices);
  const hasLivePrices = Object.keys(storePrices).length > 0;

  const enrichedPositions = useMemo<Position[]>(() => {
    if (!hasLivePrices) return portfolio.positions;
    return portfolio.positions.map((p) => {
      // BTC-USD in store, BTC-USD in portfolio — keys should match
      const live = storePrices[p.ticker];
      if (!live) return p;
      const livePrice = live.price;
      const costBasis = p.quantity * p.avg_entry_price;
      const marketValue = p.quantity * livePrice;
      const unrealizedPnl = marketValue - costBasis;
      const unrealizedPnlPct = costBasis > 0 ? unrealizedPnl / costBasis : 0;
      return {
        ...p,
        current_price: livePrice,
        market_value: Math.round(marketValue * 100) / 100,
        unrealized_pnl: Math.round(unrealizedPnl * 100) / 100,
        unrealized_pnl_pct: Math.round(unrealizedPnlPct * 1e6) / 1e6,
      };
    });
  }, [portfolio.positions, storePrices, hasLivePrices]);

  // Recompute hero stats from enriched positions when live prices available
  const livePortfolio = useMemo(() => {
    if (!hasLivePrices || enrichedPositions === portfolio.positions) return portfolio;
    const liveInvested = enrichedPositions.reduce((s, p) => s + p.market_value, 0);
    const liveTotal = portfolio.cash + liveInvested;
    const costBasis = portfolio.positions.reduce(
      (s, p) => s + p.quantity * p.avg_entry_price, 0
    );
    const livePnl = liveInvested - costBasis;
    const livePnlPct = costBasis > 0 ? livePnl / costBasis : 0;
    // Recompute weights
    const positions = enrichedPositions.map((p) => ({
      ...p,
      weight: liveTotal > 0 ? p.market_value / liveTotal : p.weight,
    }));
    return {
      ...portfolio,
      total_value: Math.round(liveTotal * 100) / 100,
      invested: Math.round(liveInvested * 100) / 100,
      total_pnl: Math.round(livePnl * 100) / 100,
      total_pnl_pct: Math.round(livePnlPct * 1e6) / 1e6,
      positions,
    };
  }, [portfolio, enrichedPositions, hasLivePrices]);

  const pnlPos = livePortfolio.total_pnl >= 0;
  const dayPos = livePortfolio.day_pnl >= 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: "rgba(123,47,255,0.15)", border: "1px solid rgba(123,47,255,0.3)" }}>
              <Briefcase className="w-4 h-4" style={{ color: "#7B2FFF" }} />
            </div>
            <h1 className="text-2xl font-bold text-slate-100">Portfolio</h1>
            <NeonBadge color="purple">{livePortfolio.positions.length} Positionen</NeonBadge>
            {isLiveData ? (
              <NeonBadge color="green">LIVE</NeonBadge>
            ) : (
              <span className="text-xs font-bold px-2.5 py-1 rounded-full"
                style={{ background: "rgba(100,116,139,0.12)", border: "1px solid rgba(100,116,139,0.3)", color: "#64748B" }}>
                DEMO
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500">Nautilus Trader Ausführungs-Engine · Echtzeit-P&L</p>
        </motion.div>
        <button onClick={load} className="flex items-center gap-2 text-xs px-3 py-2 rounded-xl transition-all"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#64748B" }}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Aktualisieren
        </button>
      </div>

      {/* Hero stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Gesamtwert",   value: livePortfolio.total_value,  prefix: "$", color: "#00D4FF", icon: DollarSign  },
          { label: "Cash",         value: livePortfolio.cash,          prefix: "$", color: "#7B2FFF", icon: PieChart    },
          { label: "Investiert",   value: livePortfolio.invested,      prefix: "$", color: "#00D4FF", icon: Activity    },
          {
            label: "Gesamt-P&L",
            value: Math.abs(livePortfolio.total_pnl),
            prefix: pnlPos ? "+$" : "-$",
            color: pnlPos ? "#00FF88" : "#FF0080",
            icon: pnlPos ? TrendingUp : TrendingDown,
            sub: `${pnlPos ? "+" : ""}${(livePortfolio.total_pnl_pct * 100).toFixed(2)}% gesamt`,
          },
        ].map(({ label, value, prefix, color, icon: Icon, sub }, i) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 + i * 0.07 }}
            className="rounded-xl p-4 relative overflow-hidden"
            style={{
              background: "linear-gradient(135deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))",
              border: `1px solid ${color}25`,
            }}
          >
            <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-3"
              style={{ background: `${color}15`, border: `1px solid ${color}30` }}>
              <Icon className="w-4 h-4" style={{ color }} />
            </div>
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">{label}</p>
            <p className="text-2xl font-bold font-mono" style={{ color, textShadow: `0 0 15px ${color}50` }}>
              {prefix}<CountUp end={value} decimals={0} separator="," duration={1.2} />
            </p>
            {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
          </motion.div>
        ))}
      </div>

      {/* Equity Curve */}
      <GlassCard variant="cyan" delay={0.2}>
        <div className="flex items-center justify-between mb-4">
          <SectionLabel>Equity-Kurve — 60 Tage</SectionLabel>
          <div className="flex items-center gap-2">
            <InfoButton onClick={() => setExplainContent(EXPLAIN_EQUITY)} color="cyan" />
            <span className="text-xs text-slate-500">Rendite:</span>
            <span className="text-xs font-bold font-mono" style={{ color: "#00FF88" }}>{livePortfolio.total_pnl_pct > 0 ? "+" : ""}{(livePortfolio.total_pnl_pct * 100).toFixed(2)}%</span>
          </div>
        </div>
        <div style={{ height: "200px" }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={equityCurve} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#00D4FF" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#00D4FF" stopOpacity="0" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis
                dataKey="date" tick={{ fill: "#475569", fontSize: 10 }}
                axisLine={false} tickLine={false}
                interval={10}
              />
              <YAxis
                tick={{ fill: "#475569", fontSize: 10 }}
                axisLine={false} tickLine={false}
                tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip
                contentStyle={{
                  background: "rgba(8,11,20,0.95)",
                  border: "1px solid rgba(0,212,255,0.3)",
                  borderRadius: "8px",
                  color: "#E2E8F0",
                  fontSize: "12px",
                }}
                formatter={(v: number) => [`$${v.toLocaleString()}`, "Portfoliowert"]}
              />
              <Area
                type="monotone" dataKey="value"
                stroke="#00D4FF" strokeWidth={2}
                fill="url(#equityGradient)"
                dot={false}
                style={{ filter: "drop-shadow(0 0 4px rgba(0,212,255,0.4))" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </GlassCard>

      {/* Positions Table */}
      <GlassCard delay={0.3} padding="p-4">
        <div className="flex items-center justify-between mb-4">
          <SectionLabel>Offene Positionen</SectionLabel>
          <div className="flex items-center gap-2">
            {hasLivePrices && (
              <div className="flex items-center gap-1.5 text-xs" style={{ color: "#00FF88" }}>
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#00FF88", boxShadow: "0 0 4px #00FF88", animation: "glow-pulse-green 1.5s ease-in-out infinite" }} />
                Live
              </div>
            )}
            <NeonBadge color="purple">DEMO-HANDEL</NeonBadge>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                {["Asset", "Menge", "Ø Einstieg", "Aktuell", "Marktwert", "Unr. G/V", "Gewicht"].map((h) => (
                  <th key={h} className="text-left py-2 pr-4 text-xs text-slate-600 uppercase tracking-wider font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {livePortfolio.positions.map((p, i) => {
                const pos = p.unrealized_pnl >= 0;
                const c = COLORS[i % COLORS.length];
                const isLive = hasLivePrices && !!storePrices[p.ticker];
                return (
                  <motion.tr
                    key={p.ticker}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.35 + i * 0.06 }}
                    style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                  >
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg text-xs font-bold flex items-center justify-center"
                          style={{ background: `${c}20`, color: c }}>
                          {p.ticker.slice(0, 2)}
                        </div>
                        <div>
                          <p className="font-bold text-slate-200">{p.ticker}</p>
                          <p className="text-xs text-slate-600 capitalize">{p.asset_class}</p>
                        </div>
                      </div>
                    </td>
                    <td className="pr-4 font-mono text-slate-400 text-sm">
                      {p.asset_class === "crypto" ? p.quantity.toFixed(4) : p.quantity}
                    </td>
                    <td className="pr-4 font-mono text-slate-400">${p.avg_entry_price.toLocaleString()}</td>
                    <td className="pr-4">
                      <div className="flex items-center gap-1.5">
                        {isLive && (
                          <div
                            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                            style={{ background: "#00FF88", boxShadow: "0 0 4px #00FF88" }}
                            title="Live-Kurs"
                          />
                        )}
                        <span className="font-mono text-slate-300 font-semibold">
                          ${p.current_price >= 1000
                            ? p.current_price.toLocaleString("en-US", { maximumFractionDigits: 0 })
                            : p.current_price.toFixed(2)}
                        </span>
                      </div>
                    </td>
                    <td className="pr-4 font-mono text-slate-300">${p.market_value.toLocaleString()}</td>
                    <td className="pr-4">
                      <div>
                        <p className="font-mono font-bold" style={{ color: pos ? "#00FF88" : "#FF0080" }}>
                          {pos ? "+" : ""}{(p.unrealized_pnl_pct * 100).toFixed(2)}%
                        </p>
                        <p className="text-xs text-slate-600 font-mono">
                          {pos ? "+" : ""}${p.unrealized_pnl.toLocaleString()}
                        </p>
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-white/5 rounded-full h-1.5 overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${(p.weight * 100).toFixed(0)}%`, background: c }} />
                        </div>
                        <span className="text-xs font-mono text-slate-500">{(p.weight * 100).toFixed(0)}%</span>
                      </div>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {/* Analytics Panel */}
      <AnalyticsPanel />

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
