"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import CountUp from "react-countup";
import {
  TrendingUp, TrendingDown, DollarSign, Shield,
  Activity, Zap, Brain, Target, AlertTriangle,
  ArrowUpRight, ArrowDownRight, Cpu, Radio,
  CreditCard, BarChart2, ShoppingCart, Copy, Check,
} from "lucide-react";
import Link from "next/link";
import { GlassCard, SectionLabel, NeonBadge } from "@/components/ui/GlassCard";
import { ExplanationModal, InfoButton } from "@/components/ui/ExplanationModal";
import type { ExplanationContent } from "@/components/ui/ExplanationModal";
import { SkeletonCard, SkeletonChart } from "@/components/ui/Skeleton";
import { Watchlist } from "@/components/trading/Watchlist";
import { api } from "@/lib/api";
import { useAlertsStream } from "@/hooks/useWebSocket";
import { useTradingStore } from "@/store/tradingStore";
import { useAuthStore } from "@/store/authStore";
import type { PortfolioSnapshot, RiskMetrics, ApiMetricsResponse } from "@/types";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
} from "recharts";

/* ---- Constants ---- */
const PORTFOLIO_REFRESH_INTERVAL_MS = 5000;
const SPARKLINE_POINTS = 20;
const SPARKLINE_DRIFT = 0.48;
const SPARKLINE_VOLATILITY = 3;
const PORTFOLIO_VALUE_DRIFT = 0.48;
const PORTFOLIO_VALUE_VOLATILITY = 80;
const PORTFOLIO_PNL_DRIFT = 0.48;
const PORTFOLIO_PNL_VOLATILITY = 30;
const INITIAL_SIGNALS_COUNT = 7;

/* ---- Mock data for visual richness ---- */
const MOCK_SIGNALS_FEED = [
  { id: "1", ticker: "NVDA", direction: "STRONG_BUY", confidence: 0.91, source: "Technical", ts: "12:34:01" },
  { id: "2", ticker: "TSLA", direction: "SELL",       confidence: 0.74, source: "Sentiment",  ts: "12:31:44" },
  { id: "3", ticker: "AAPL", direction: "HOLD",       confidence: 0.58, source: "Fundamental",ts: "12:28:10" },
  { id: "4", ticker: "META", direction: "BUY",        confidence: 0.82, source: "TradingAgents",ts: "12:25:33" },
  { id: "5", ticker: "MSFT", direction: "STRONG_BUY", confidence: 0.88, source: "Composite",  ts: "12:22:05" },
  { id: "6", ticker: "AMD",  direction: "SELL",       confidence: 0.69, source: "Technical",  ts: "12:18:50" },
  { id: "7", ticker: "AMZN", direction: "BUY",        confidence: 0.76, source: "Sentiment",  ts: "12:15:22" },
];

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
    { ticker: "NVDA", asset_class: "stock", quantity: 25,   avg_entry_price: 720.00, current_price: 875.20, market_value: 21880, unrealized_pnl: 3880,  unrealized_pnl_pct: 0.2156, realized_pnl: 0, weight: 0.226 },
    { ticker: "AAPL", asset_class: "stock", quantity: 80,   avg_entry_price: 175.00, current_price: 189.43, market_value: 15154, unrealized_pnl: 1154,  unrealized_pnl_pct: 0.0824, realized_pnl: 0, weight: 0.157 },
    { ticker: "MSFT", asset_class: "stock", quantity: 30,   avg_entry_price: 395.00, current_price: 415.80, market_value: 12474, unrealized_pnl: 624,   unrealized_pnl_pct: 0.0527, realized_pnl: 0, weight: 0.129 },
    { ticker: "BTC",  asset_class: "crypto", quantity: 0.5, avg_entry_price: 58000,  current_price: 67420,  market_value: 33710, unrealized_pnl: 4710,  unrealized_pnl_pct: 0.1624, realized_pnl: 0, weight: 0.349 },
    { ticker: "TSLA", asset_class: "stock", quantity: 40,   avg_entry_price: 260.00, current_price: 248.75, market_value: 9950,  unrealized_pnl: -450,  unrealized_pnl_pct: -0.0433, realized_pnl: 0, weight: 0.103 },
  ],
};

const MOCK_RISK: RiskMetrics = {
  portfolio_var_95: 3240,
  portfolio_var_99: 5180,
  max_drawdown: 0.087,
  current_drawdown: 0.023,
  sharpe_ratio: 1.84,
  concentration_risk: 0.35,
  leverage: 1.0,
  alerts: [],
};

const AGENT_ACTIVITY = [
  { name: "Fundamental",    active: true,  load: 78, color: "#00D4FF" },
  { name: "Sentiment",      active: true,  load: 92, color: "#00FF88" },
  { name: "Technisch",      active: false, load: 0,  color: "#7B2FFF" },
  { name: "News",           active: true,  load: 45, color: "#FFD700" },
  { name: "Risiko-Manager", active: true,  load: 61, color: "#FF0080" },
];

const DONUT_COLORS = ["#00D4FF", "#00FF88", "#7B2FFF", "#FFD700", "#FF0080"];

/* ---- Explanation content for InfoButton modals ---- */
const EXPLAIN_PORTFOLIO: ExplanationContent = {
  title: "Portfolio-Allokation",
  subtitle: "Asset-Gewichtung & Diversifikation",
  color: "cyan",
  theory: "Die Asset-Allokation bestimmt, wie das Kapital auf verschiedene Anlageklassen (Aktien, Krypto, Cash) verteilt ist. Eine optimale Diversifikation reduziert das unsystematische Risiko, ohne die erwartete Rendite wesentlich zu senken (Markowitz-Portfolio-Theorie).",
  keyPoints: [
    "Jede Position zeigt Gewichtung, aktuellen Preis und unrealisierte P&L",
    "Donut-Chart: Größere Segmente = höhere Gewichtung im Portfolio",
    "Korrelation beachten: Diversifikation hilft nur bei unkorrelierten Assets",
    "Rebalancing: Gewichte regelmäßig anpassen wenn Drift > 5%",
  ],
  practicalTip: "Kein einzelnes Asset sollte mehr als 30–40% des Portfolios ausmachen. BTC und Tech-Aktien sind stark korreliert — für echte Diversifikation auch Anleihen oder Rohstoffe einbeziehen.",
};

const EXPLAIN_SIGNALS: ExplanationContent = {
  title: "KI-Signal-Feed",
  subtitle: "Multi-Agent Trading Intelligence",
  color: "green",
  theory: "Das System kombiniert 5 spezialisierte KI-Agenten (Fundamental, Technisch, Sentiment, Macro, Risk) zu einem Composite-Signal. Jeder Agent analysiert unterschiedliche Datensources. Das finale Signal entsteht durch gewichteten Konsens.",
  keyPoints: [
    "STRONG_BUY / BUY: Mehrheitskonsens positiv, Konfidenz > 75%",
    "HOLD: Gemischte Signale, kein klarer Trend erkennbar",
    "SELL / STRONG_SELL: Mehrheitskonsens negativ oder Risikowarnung",
    "Konfidenz-Score: 0–100% — unter 60% Signal mit Vorsicht behandeln",
    "Source-Tag zeigt welcher Agent das stärkste Signal geliefert hat",
  ],
  practicalTip: "Nie blind einem einzelnen Signal folgen. Starke Signale (> 85% Konfidenz) mit technischer Bestätigung (Support/Resistance, Volumen) kombinieren. Stop-Loss immer setzen.",
};

const EXPLAIN_RISK: ExplanationContent = {
  title: "Risiko-Snapshot",
  subtitle: "Value at Risk & Portfolio-Metriken",
  color: "pink",
  theory: "Value at Risk (VaR) quantifiziert den maximalen erwarteten Verlust über einen Zeitraum mit gegebener Wahrscheinlichkeit. VaR 95% bedeutet: Mit 95% Wahrscheinlichkeit verliert das Portfolio an einem Tag nicht mehr als diesen Betrag.",
  keyPoints: [
    "VaR 95%: Tagesrisiko — überschritten in 1 von 20 Handelstagen",
    "VaR 99%: Extremrisiko — überschritten in 1 von 100 Handelstagen",
    "Max Drawdown: Größter Verlust vom Hoch bis zum Tief (historisch)",
    "Sharpe Ratio > 1.5 gilt als gut; > 2.0 als sehr gut",
    "Konzentrations-Risiko: Anteil des größten Holdings am Gesamtportfolio",
  ],
  practicalTip: "Wenn VaR 95% mehr als 2% des Portfolios beträgt, ist das Risiko erhöht. Leverage > 1 multipliziert sowohl Gewinne als auch Verluste — im Paper-Mode sicher testen.",
};

const EXPLAIN_AGENTS: ExplanationContent = {
  title: "Neuronale Agent-Aktivität",
  subtitle: "Multi-Agent System Status",
  color: "purple",
  theory: "Das Neural Trading OS verwendet 5 spezialisierte KI-Agenten parallel. Jeder Agent ist auf einen Analysebereich spezialisiert und gibt ein gewichtetes Vote ab. Das System aggregiert die Votes zu einem finalen Trading-Signal.",
  keyPoints: [
    "Fundamentals: Analysiert KGV, Umsatz, Gewinnwachstum, Bilanz",
    "Sentiment: Verarbeitet News-Headlines, Reddit, Twitter-Sentiment",
    "Technical: RSI, MACD, Bollinger Bands, Elliott-Wellen-Analyse",
    "News: Real-Time Ereignisse, Earnings-Überraschungen, Insider-Käufe",
    "Risk Manager: Überwacht Portfolio-Grenzen, Stop-Levels, Exposure",
  ],
  practicalTip: "Die Load-Anzeige zeigt die aktuelle Auslastung. Bei > 90% Auslastung kann es zu Verzögerungen bei der Signal-Generierung kommen. Alle Agenten müssen aktiv sein für zuverlässige Composite-Signale.",
};

/* ---- Direction helpers ---- */
const DIR_LABELS_DE: Record<string, string> = {
  STRONG_BUY: "Starker Kauf", BUY: "Kaufen", HOLD: "Halten",
  SELL: "Verkaufen", STRONG_SELL: "Starker Verkauf",
};
function dirLabel(d: string) { return DIR_LABELS_DE[d] ?? d; }

const SOURCE_LABELS_DE: Record<string, string> = {
  Technical: "Technisch", Sentiment: "Sentiment", Fundamental: "Fundamental",
  TradingAgents: "Multi-Agenten", Composite: "Komposit", News: "News",
  "Risk Manager": "Risiko-Manager",
};
function srcLabel(s: string) { return SOURCE_LABELS_DE[s] ?? s; }

function directionStyle(d: string) {
  if (d === "STRONG_BUY") return { bg: "rgba(0,255,136,0.15)", border: "rgba(0,255,136,0.4)", color: "#00FF88", label: "S.BUY" };
  if (d === "BUY")         return { bg: "rgba(0,255,136,0.08)", border: "rgba(0,255,136,0.25)", color: "#00DD77", label: "BUY" };
  if (d === "HOLD")        return { bg: "rgba(255,215,0,0.08)", border: "rgba(255,215,0,0.25)", color: "#FFD700", label: "HOLD" };
  if (d === "SELL")        return { bg: "rgba(255,0,128,0.08)", border: "rgba(255,0,128,0.25)", color: "#FF6098", label: "SELL" };
  return                          { bg: "rgba(255,0,128,0.15)", border: "rgba(255,0,128,0.4)", color: "#FF0080", label: "S.SELL" };
}

/* ---- Sparkline (SVG micro-chart) ---- */
function Sparkline({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 80; const h = 28;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  });
  const pathD = `M ${pts.join(" L ")}`;
  const areaD = `M ${pts[0]} L ${pts.join(" L ")} L ${w},${h} L 0,${h} Z`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <defs>
        <linearGradient id={`sg-${color.replace("#","")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#sg-${color.replace("#","")})`} />
      <path d={pathD} stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" />
      {/* Last dot */}
      <circle cx={w} cy={pts[pts.length - 1].split(",")[1]} r="2.5" fill={color} style={{ filter: `drop-shadow(0 0 4px ${color})` }} />
    </svg>
  );
}

function generateSparkline(seed: number): number[] {
  const arr: number[] = [];
  let v = 100 + seed;
  for (let i = 0; i < SPARKLINE_POINTS; i++) {
    v += (Math.random() - SPARKLINE_DRIFT) * SPARKLINE_VOLATILITY;
    arr.push(v);
  }
  return arr;
}

/* ---- Gauge (tachometer style) ---- */
function TachometerGauge({ value, max, label, unit, color }: {
  value: number; max: number; label: string; unit: string; color: string;
}) {
  const pct = Math.min(value / max, 1);
  const angle = pct * 180 - 90; // -90 to +90
  const r = 40; const cx = 50; const cy = 55;
  // Arc from 180° to 0° (left to right)
  const startAngle = Math.PI;
  const endAngle = 0;
  const arcX1 = cx + r * Math.cos(startAngle);
  const arcY1 = cy + r * Math.sin(startAngle);
  const arcX2 = cx + r * Math.cos(endAngle);
  const arcY2 = cy + r * Math.sin(endAngle);
  const fillEndAngle = startAngle - pct * Math.PI;
  const fillX2 = cx + r * Math.cos(fillEndAngle);
  const fillY2 = cy + r * Math.sin(fillEndAngle);
  const needleAngle = (pct * 180) * (Math.PI / 180);
  const needleX = cx + 32 * Math.cos(Math.PI - needleAngle);
  const needleY = cy - 32 * Math.sin(needleAngle) + 32 * Math.sin(0); // simplified

  return (
    <div className="flex flex-col items-center">
      <svg width="100" height="65" viewBox="0 0 100 65">
        <defs>
          <linearGradient id={`gauge-${label}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#00FF88" />
            <stop offset="50%" stopColor="#FFD700" />
            <stop offset="100%" stopColor="#FF0080" />
          </linearGradient>
        </defs>
        {/* Background arc */}
        <path
          d={`M ${arcX1},${arcY1} A ${r},${r} 0 0 1 ${arcX2},${arcY2}`}
          fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" strokeLinecap="round"
        />
        {/* Fill arc */}
        <path
          d={`M ${arcX1},${arcY1} A ${r},${r} 0 0 1 ${fillX2},${fillY2}`}
          fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 4px ${color})` }}
        />
        {/* Center dot */}
        <circle cx={cx} cy={cy} r="3" fill={color} style={{ filter: `drop-shadow(0 0 3px ${color})` }} />
      </svg>
      <p className="text-xs font-mono font-bold mt-1" style={{ color }}>{value.toFixed(1)}{unit}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}

/* ---- KPI Card ---- */
function KpiCard({
  label, value, sub, color, icon: Icon, delay = 0,
}: {
  label: string; value: React.ReactNode; sub?: string;
  color: "cyan" | "green" | "pink" | "purple"; icon: React.ElementType; delay?: number;
}) {
  const colorMap = {
    cyan:   { text: "#00D4FF", bg: "rgba(0,212,255,0.1)",   border: "rgba(0,212,255,0.25)",   glow: "rgba(0,212,255,0.3)" },
    green:  { text: "#00FF88", bg: "rgba(0,255,136,0.1)",   border: "rgba(0,255,136,0.25)",   glow: "rgba(0,255,136,0.3)" },
    pink:   { text: "#FF0080", bg: "rgba(255,0,128,0.1)",   border: "rgba(255,0,128,0.25)",   glow: "rgba(255,0,128,0.3)" },
    purple: { text: "#7B2FFF", bg: "rgba(123,47,255,0.1)",  border: "rgba(123,47,255,0.25)",  glow: "rgba(123,47,255,0.3)" },
  };
  const c = colorMap[color];
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      className="relative overflow-hidden rounded-xl p-4"
      style={{
        background: "linear-gradient(135deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))",
        border: `1px solid ${c.border}`,
        backdropFilter: "blur(20px)",
      }}
    >
      {/* Corner glow */}
      <div className="absolute top-0 right-0 w-20 h-20 rounded-full pointer-events-none"
        style={{ background: `radial-gradient(circle, ${c.glow} 0%, transparent 70%)`, transform: "translate(30%, -30%)" }} />

      <div className="flex items-start justify-between mb-3">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center"
          style={{ background: c.bg, border: `1px solid ${c.border}` }}
        >
          <Icon className="w-4 h-4" style={{ color: c.text }} />
        </div>
        <ArrowUpRight className="w-3.5 h-3.5 text-slate-600" />
      </div>
      <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">{label}</p>
      <div className="text-xl font-bold font-mono" style={{ color: c.text }}>{value}</div>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </motion.div>
  );
}

/* ---- Market Status Badge ---- */
function getMarketStatus(): { label: string; open: boolean; hint: string } {
  const now = new Date();
  // Convert to US Eastern Time using Intl (handles DST automatically)
  const etStr = now.toLocaleString("en-US", { timeZone: "America/New_York" });
  const et = new Date(etStr);
  const day = et.getDay(); // 0=Sun, 6=Sat
  const h = et.getHours();
  const m = et.getMinutes();
  const mins = h * 60 + m;
  const isWeekday = day >= 1 && day <= 5;
  const nyseOpen = isWeekday && mins >= 9 * 60 + 30 && mins < 16 * 60;
  const premarket = isWeekday && mins >= 4 * 60 && mins < 9 * 60 + 30;
  const afterhours = isWeekday && mins >= 16 * 60 && mins < 20 * 60;
  if (nyseOpen) return { label: "NYSE Offen", open: true, hint: "NYSE/NASDAQ reguläre Handelszeit (09:30–16:00 ET)" };
  if (premarket) return { label: "Vorbörslich", open: false, hint: "Vorbörslicher Handel aktiv (04:00–09:30 ET)" };
  if (afterhours) return { label: "Nachbörslich", open: false, hint: "Nachbörslicher Handel (16:00–20:00 ET)" };
  return { label: "NYSE Geschlossen", open: false, hint: isWeekday ? "NYSE außerhalb der Handelszeiten" : "NYSE — Wochenende" };
}

function MarketStatusBadge() {
  const [status, setStatus] = useState(getMarketStatus);
  useEffect(() => {
    const id = setInterval(() => setStatus(getMarketStatus()), 60_000);
    return () => clearInterval(id);
  }, []);
  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold"
      style={{
        background: status.open ? "rgba(0,255,136,0.06)" : "rgba(100,116,139,0.06)",
        border: `1px solid ${status.open ? "rgba(0,255,136,0.2)" : "rgba(100,116,139,0.15)"}`,
        color: status.open ? "#00FF88" : "#64748b",
      }}
      title={status.hint}
    >
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{
          background: status.open ? "#00FF88" : "#64748b",
          boxShadow: status.open ? "0 0 4px #00FF88" : "none",
        }}
      />
      {status.label}
    </div>
  );
}

/* ============================================================ */
export default function DashboardPage() {
  const [portfolio, setPortfolio] = useState<PortfolioSnapshot>(MOCK_PORTFOLIO);
  const [risk, setRisk] = useState<RiskMetrics>(MOCK_RISK);
  const [winRate, setWinRate] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [isApiOnline, setIsApiOnline] = useState(false);
  const [executionMode, setExecutionMode] = useState<"paper" | "live">("paper");
  const [explainContent, setExplainContent] = useState<ExplanationContent | null>(null);
  const [dailyStats, setDailyStats] = useState<{ total_today: number; buy: number; sell: number; hold: number } | null>(null);
  const [quotaUsage, setQuotaUsage] = useState<{ signals_used_today: number; signals_limit: number; signals_remaining: number } | null>(null);
  const [healthMetrics, setHealthMetrics] = useState<ApiMetricsResponse | null>(null);
  const [firstRunDismissed, setFirstRunDismissed] = useState(() => {
    try { return localStorage.getItem("neural_first_run_v1") === "1"; } catch { return false; }
  });
  const { events: alertEvents } = useAlertsStream();
  const { signals, setSignals } = useTradingStore((s) => ({ signals: s.signals, setSignals: s.setSignals }));
  const tier = useAuthStore((s) => s.tier);
  const username = useAuthStore((s) => s.username);
  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h >= 5 && h < 12) return "Guten Morgen";
    if (h >= 12 && h < 18) return "Guten Tag";
    if (h >= 18 && h < 22) return "Guten Abend";
    return "Hallo";
  }, []);

  // DB history: loaded once on mount, used as fallback when session store is empty
  const [dbHistory, setDbHistory] = useState<typeof MOCK_SIGNALS_FEED>([]);
  useEffect(() => {
    api.signals.history(10).then((rows) => {
      if (rows.length > 0) {
        setDbHistory(rows.map((r) => ({
          id: r.id,
          ticker: r.ticker,
          direction: r.direction,
          confidence: r.confidence,
          source: r.source,
          ts: new Date(r.generated_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }),
        })));
      }
    }).catch(() => {});
  }, []);

  // Use real session signals first, then DB history, then mock feed
  const signalFeed = useMemo(
    () => signals.length > 0
      ? signals.slice(0, 10).map((s) => ({ ...s, ts: new Date(s.generated_at).toLocaleTimeString() }))
      : dbHistory.length > 0
      ? dbHistory
      : MOCK_SIGNALS_FEED,
    [signals, dbHistory]
  );

  const fetchPortfolio = useCallback(async (initial = false) => {
    if (!initial) setIsRefreshing(true);
    try {
      const snapshot = await api.portfolio.snapshot();
      setPortfolio(snapshot);
      setIsApiOnline(true);
    } catch {
      // Graceful degradation — keep existing mock data on error
      setIsApiOnline(false);
    } finally {
      setIsRefreshing(false);
      if (initial) setInitialLoading(false);
    }
  }, []);

  const handleManualRefresh = useCallback(() => {
    fetchPortfolio(false);
  }, [fetchPortfolio]);

  function dismissFirstRun() {
    try { localStorage.setItem("neural_first_run_v1", "1"); } catch {}
    setFirstRunDismissed(true);
  }

  const [referralCopied, setReferralCopied] = useState(false);
  const [referralCount, setReferralCount] = useState<number | null>(null);
  function copyReferralLink() {
    if (!username) return;
    const ref = btoa(username);
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
    navigator.clipboard.writeText(`${base}/invite/${ref}`).then(() => {
      setReferralCopied(true);
      setTimeout(() => setReferralCopied(false), 2000);
    }).catch(() => {});
  }

  // Refresh portfolio with micro-fluctuations for demo
  useEffect(() => {
    const interval = setInterval(() => {
      setPortfolio((prev) => ({
        ...prev,
        total_value:
          prev.total_value +
          (Math.random() - PORTFOLIO_VALUE_DRIFT) * PORTFOLIO_VALUE_VOLATILITY,
        day_pnl:
          prev.day_pnl +
          (Math.random() - PORTFOLIO_PNL_DRIFT) * PORTFOLIO_PNL_VOLATILITY,
      }));
      setTick((t) => t + 1);
    }, PORTFOLIO_REFRESH_INTERVAL_MS);

    // Initial load from backend — show skeleton until resolved
    fetchPortfolio(true);
    // Load risk metrics, execution mode and signal performance in parallel
    api.risk.metrics().then(setRisk).catch(() => {});
    api.execution.mode().then((m) => setExecutionMode(m.mode as "paper" | "live")).catch(() => {});
    api.signals.performance().then((d) => setWinRate(d.win_rate)).catch(() => {});
    api.billing.usage().then(setQuotaUsage).catch(() => {});
    // Poll daily signal stats every 60s for live buy/sell/hold counts
    const fetchStats = () => api.signals.stats().then(setDailyStats).catch(() => {});
    fetchStats();
    const statsInterval = setInterval(fetchStats, 60_000);
    // Poll system health metrics every 60s for live social-proof stats
    const fetchHealth = () => api.health.metrics().then(setHealthMetrics).catch(() => {});
    fetchHealth();
    const healthInterval = setInterval(fetchHealth, 60_000);
    // Load referral count once (requires auth — fails silently for guests)
    api.auth.referralStats().then((s) => setReferralCount(s.referral_count)).catch(() => {});
    // Load existing signals; if store is empty, generate a demo batch to pre-populate the feed
    api.signals.list().then((existing) => {
      if (existing.length > 0) {
        setSignals(existing);
      } else {
        api.signals
          .batch(["AAPL", "NVDA", "TSLA", "MSFT", "META", "BTC"])
          .then(setSignals)
          .catch(() => {});
      }
    }).catch(() => {});

    return () => { clearInterval(interval); clearInterval(statsInterval); clearInterval(healthInterval); };
  }, [fetchPortfolio, setSignals]);

  const donutData = useMemo(
    () =>
      portfolio.positions.map((p) => ({
        name: p.ticker,
        value: p.market_value,
      })),
    [portfolio.positions]
  );

  const pnlPos = portfolio.total_pnl >= 0;
  const dayPos = portfolio.day_pnl >= 0;
  const riskLabel = risk.current_drawdown > 0.15 ? "HOCH" : risk.current_drawdown > 0.05 ? "MITTEL" : "NIEDRIG";
  const riskColor: "pink" | "purple" | "cyan" = risk.current_drawdown > 0.15 ? "pink" : risk.current_drawdown > 0.05 ? "purple" : "cyan";

  const activeAgentCount = AGENT_ACTIVITY.filter((a) => a.active).length;

  const signalCounts = useMemo(() => {
    const buy  = signalFeed.filter((s) => s.direction === "BUY" || s.direction === "STRONG_BUY").length;
    const sell = signalFeed.filter((s) => s.direction === "SELL" || s.direction === "STRONG_SELL").length;
    const hold = signalFeed.filter((s) => s.direction === "HOLD").length;
    return { buy, sell, hold };
  }, [signalFeed]);

  const topSignal = useMemo(() => {
    if (!signalFeed.length) return null;
    return signalFeed.reduce((best, s) =>
      (s.confidence ?? 0) > (best.confidence ?? 0) ? s : best
    );
  }, [signalFeed]);

  // ---- Skeleton loading state ----
  if (initialLoading) {
    return (
      <div className="space-y-5" aria-busy="true" aria-label="Dashboard wird geladen...">
        {/* Header skeleton */}
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <div className="h-3 w-40 rounded bg-cyan-500/10 border border-cyan-500/10 animate-pulse" />
            <div className="h-10 w-64 rounded bg-cyan-500/10 border border-cyan-500/10 animate-pulse" />
            <div className="h-3 w-52 rounded bg-white/5 animate-pulse" />
          </div>
        </div>
        {/* KPI cards skeleton */}
        <div className="grid grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => <SkeletonCard key={i} />)}
        </div>
        {/* Main grid skeleton */}
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-5">
            <SkeletonChart height={180} />
          </div>
          <div className="col-span-4">
            <SkeletonChart height={240} showLegend={false} />
          </div>
          <div className="col-span-3 space-y-4">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ---- Hero Row ---- */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex items-start justify-between"
      >
        <div>
          <p className="section-label">NEURAL TRADING OS</p>
          {username && (
            <p className="text-xs mt-0.5" style={{ color: "rgba(100,116,139,0.6)" }}>
              {greeting}, {username}
            </p>
          )}
          <div className="flex items-baseline gap-3 mt-1">
            <h1
              className="text-4xl font-bold font-mono"
              style={{
                color: "#00D4FF",
                textShadow: "0 0 30px rgba(0,212,255,0.5), 0 0 60px rgba(0,212,255,0.2)",
              }}
            >
              $<CountUp end={portfolio.total_value} decimals={2} separator="," duration={1.5} key={tick} />
            </h1>
            <span
              className="text-lg font-semibold font-mono"
              style={{ color: pnlPos ? "#00FF88" : "#FF0080" }}
            >
              {pnlPos ? "+" : ""}{(portfolio.total_pnl_pct * 100).toFixed(2)}%
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Gesamtportfoliowert — live aktualisiert
          </p>
        </div>

        {/* Status indicators + Refresh */}
        <div className="flex items-center gap-3 text-xs">
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{
              background: isApiOnline ? "rgba(0,255,136,0.08)" : "rgba(239,68,68,0.08)",
              border: isApiOnline ? "1px solid rgba(0,255,136,0.2)" : "1px solid rgba(239,68,68,0.2)",
            }}
          >
            <div
              className="status-dot-live"
              style={isApiOnline ? {} : { background: "#EF4444", boxShadow: "0 0 6px #EF4444" }}
            />
            <span style={{ color: isApiOnline ? "#00FF88" : "#EF4444" }}>
              {isApiOnline ? "Systeme Online" : "API Offline"}
            </span>
          </div>
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{
              background: executionMode === "live" ? "rgba(255,0,128,0.08)" : "rgba(0,212,255,0.08)",
              border: executionMode === "live" ? "1px solid rgba(255,0,128,0.2)" : "1px solid rgba(0,212,255,0.2)",
            }}
          >
            <Radio
              className="w-3 h-3"
              style={{ color: executionMode === "live" ? "#FF0080" : "#00D4FF" }}
            />
            <span style={{ color: executionMode === "live" ? "#FF0080" : "#00D4FF" }}>
              {executionMode === "live" ? "LIVE-MODUS" : "PAPER-MODUS"}
            </span>
          </div>
          <MarketStatusBadge />
          <button
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-3 py-2 rounded-lg transition-opacity disabled:opacity-50"
            style={{
              background: "rgba(123,47,255,0.08)",
              border: "1px solid rgba(123,47,255,0.25)",
              color: "#7B2FFF",
              cursor: isRefreshing ? "not-allowed" : "pointer",
            }}
            title="Portfolio-Daten aktualisieren"
          >
            <Activity
              className="w-3 h-3"
              style={{
                animation: isRefreshing ? "spin 1s linear infinite" : "none",
              }}
            />
            <span>{isRefreshing ? "Aktualisiert..." : "Aktualisieren"}</span>
          </button>
        </div>
      </motion.div>

      {/* ---- First-Run Activation Banner ---- */}
      {!firstRunDismissed && dbHistory.length === 0 && !initialLoading && (
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          className="relative overflow-hidden rounded-2xl p-5"
          style={{
            background: "linear-gradient(135deg, rgba(0,212,255,0.07), rgba(123,47,255,0.05))",
            border: "1px solid rgba(0,212,255,0.2)",
          }}
        >
          {/* Glow */}
          <div className="absolute top-0 left-0 w-72 h-24 pointer-events-none"
            style={{ background: "radial-gradient(ellipse, rgba(0,212,255,0.12) 0%, transparent 70%)" }} />
          <div className="flex items-center justify-between gap-6 relative">
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "rgba(0,212,255,0.12)", border: "1px solid rgba(0,212,255,0.3)" }}>
                <Zap className="w-5 h-5" style={{ color: "#00D4FF" }} />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-100 mb-0.5">Willkommen! Generiere dein erstes KI-Signal</p>
                <p className="text-xs text-slate-400 max-w-xl">
                  Gib einen Ticker ein (z.B. AAPL, BTC, NVDA) und lass das Multi-Agenten-System eine vollständige
                  Elliott-Wave- und Sentiment-Analyse erstellen — kostenlos, dauerhaft.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <Link
                href="/signals"
                onClick={dismissFirstRun}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all hover:opacity-90"
                style={{
                  background: "rgba(0,212,255,0.18)",
                  border: "1px solid rgba(0,212,255,0.45)",
                  color: "#00D4FF",
                }}
              >
                <Zap className="w-4 h-4" />
                Erstes Signal generieren
                <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
              <button
                onClick={dismissFirstRun}
                className="text-xs text-slate-500 hover:text-slate-300 transition-colors px-2 py-1"
                title="Banner schließen"
              >
                ✕
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* ---- KPI Cards ---- */}
      <div className="grid grid-cols-4 gap-4">
        <KpiCard
          label="Gesamt P&L"
          value={<span style={{ color: pnlPos ? "#00FF88" : "#FF0080" }}>
            {pnlPos ? "+" : ""}${Math.abs(portfolio.total_pnl).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>}
          sub={`${pnlPos ? "+" : ""}${(portfolio.total_pnl_pct * 100).toFixed(2)}% gesamt`}
          color={pnlPos ? "green" : "pink"}
          icon={pnlPos ? TrendingUp : TrendingDown}
          delay={0.05}
        />
        <KpiCard
          label="Heute P&L"
          value={<span style={{ color: dayPos ? "#00FF88" : "#FF0080" }}>
            {dayPos ? "+" : ""}${Math.abs(portfolio.day_pnl).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>}
          sub={`${dayPos ? "+" : ""}${(portfolio.day_pnl_pct * 100).toFixed(2)}% heute`}
          color={dayPos ? "green" : "pink"}
          icon={dayPos ? ArrowUpRight : ArrowDownRight}
          delay={0.1}
        />
        <KpiCard
          label="Trefferquote"
          value={<span>{winRate !== null ? `${(winRate * 100).toFixed(1)}%` : "—"}</span>}
          sub="Bewertete Signale"
          color="cyan"
          icon={Target}
          delay={0.15}
        />
        <KpiCard
          label="Risikograd"
          value={<span>{riskLabel}</span>}
          sub={`VaR 95%: $${risk.portfolio_var_95.toLocaleString()}`}
          color={riskColor}
          icon={Shield}
          delay={0.2}
        />
      </div>

      {/* ---- Main Grid ---- */}
      <div className="grid grid-cols-12 gap-4">
        {/* Portfolio Donut + Top Holdings — 5 cols */}
        <div className="col-span-5 space-y-4">
          {/* Donut */}
          <GlassCard variant="cyan" delay={0.25}>
            <div className="flex items-center justify-between">
              <SectionLabel>Asset-Allokation</SectionLabel>
              <InfoButton onClick={() => setExplainContent(EXPLAIN_PORTFOLIO)} color="cyan" className="-mt-1" />
            </div>
            <div className="flex items-center gap-4">
              <div className="w-36 h-36 flex-shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donutData}
                      cx="50%"
                      cy="50%"
                      innerRadius={38}
                      outerRadius={58}
                      paddingAngle={3}
                      dataKey="value"
                      strokeWidth={0}
                    >
                      {donutData.map((_, i) => (
                        <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: "rgba(8,11,20,0.95)",
                        border: "1px solid rgba(0,212,255,0.3)",
                        borderRadius: "8px",
                        color: "#E2E8F0",
                        fontSize: "12px",
                      }}
                      formatter={(v: number) => [`$${v.toLocaleString()}`, ""]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-2">
                {portfolio.positions.map((p, i) => (
                  <div key={p.ticker} className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length], boxShadow: `0 0 6px ${DONUT_COLORS[i % DONUT_COLORS.length]}` }} />
                    <span className="text-xs font-bold text-slate-300 w-10">{p.ticker}</span>
                    <div className="flex-1 bg-white/5 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${(p.weight * 100).toFixed(0)}%`, background: DONUT_COLORS[i % DONUT_COLORS.length], boxShadow: `0 0 4px ${DONUT_COLORS[i % DONUT_COLORS.length]}` }}
                      />
                    </div>
                    <span className="text-xs text-slate-500 w-8 text-right">{(p.weight * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </GlassCard>

          {/* Top Holdings sparklines */}
          <GlassCard delay={0.3}>
            <SectionLabel>Top Positionen</SectionLabel>
            <div className="space-y-3">
              {portfolio.positions.slice(0, 4).map((p, i) => {
                const pos = p.unrealized_pnl >= 0;
                const sparkColor = pos ? "#00FF88" : "#FF0080";
                return (
                  <div key={p.ticker} className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
                      style={{ background: `${DONUT_COLORS[i % DONUT_COLORS.length]}20`, color: DONUT_COLORS[i % DONUT_COLORS.length] }}
                    >
                      {p.ticker.slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-slate-200">{p.ticker}</span>
                        <span className="text-sm font-mono font-bold" style={{ color: sparkColor }}>
                          {pos ? "+" : ""}{(p.unrealized_pnl_pct * 100).toFixed(2)}%
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">${p.current_price.toLocaleString()}</p>
                    </div>
                    <Sparkline data={generateSparkline(i * 10)} color={sparkColor} />
                  </div>
                );
              })}
            </div>
          </GlassCard>
        </div>

        {/* Live Signal Feed — 4 cols */}
        <div className="col-span-4">
          <GlassCard variant="green" padding="p-4" delay={0.2} className="h-full">
            <div className="flex items-center justify-between mb-3">
              <SectionLabel>Live-Signal-Feed</SectionLabel>
              <div className="flex items-center gap-2">
                <InfoButton onClick={() => setExplainContent(EXPLAIN_SIGNALS)} color="green" />
                <div className="flex items-center gap-1.5">
                  <div className="status-dot-live" style={{ width: "6px", height: "6px" }} />
                  <span className="text-xs text-neon-green">LIVE</span>
                </div>
              </div>
            </div>
            <div className="space-y-2 overflow-y-auto" style={{ maxHeight: "400px" }}>
              <AnimatePresence>
                {signalFeed.map((s, i) => {
                  const ds = directionStyle(s.direction);
                  return (
                    <motion.div
                      key={s.id}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="flex items-center gap-2 p-2.5 rounded-lg"
                      style={{
                        background: `${ds.bg}`,
                        border: `1px solid ${ds.border}`,
                      }}
                    >
                      <div
                        className="w-8 h-8 rounded flex items-center justify-center text-xs font-bold flex-shrink-0"
                        style={{ background: `${ds.bg}`, color: ds.color }}
                      >
                        {s.ticker.slice(0, 3)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-bold text-slate-200">{s.ticker}</span>
                          <span
                            className="text-xs px-1.5 py-0.5 rounded font-semibold"
                            style={{ background: ds.bg, border: `1px solid ${ds.border}`, color: ds.color, fontSize: "9px" }}
                          >
                            {ds.label}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500">{srcLabel(s.source)}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs font-mono font-bold" style={{ color: ds.color }}>
                          {(s.confidence * 100).toFixed(0)}%
                        </p>
                        <p className="text-xs text-slate-600">{s.ts || "now"}</p>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </GlassCard>
        </div>

        {/* Watchlist + Neural Activity + Risk Mini — 3 cols */}
        <div className="col-span-3 space-y-4">
          {/* Watchlist */}
          <Watchlist />

          {/* Neural Activity Widget */}
          <GlassCard variant="purple" delay={0.3}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Brain className="w-4 h-4 text-neon-purple" />
                <SectionLabel>KI-Aktivität</SectionLabel>
              </div>
              <InfoButton onClick={() => setExplainContent(EXPLAIN_AGENTS)} color="purple" />
            </div>
            <div className="space-y-3">
              {AGENT_ACTIVITY.map((a) => (
                <div key={a.name}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <div
                        className="w-1.5 h-1.5 rounded-full"
                        style={{
                          background: a.active ? a.color : "rgba(100,116,139,0.4)",
                          boxShadow: a.active ? `0 0 4px ${a.color}` : "none",
                          animation: a.active ? "glow-pulse 2s ease-in-out infinite" : "none",
                        }}
                      />
                      <span className="text-xs text-slate-400">{a.name}</span>
                    </div>
                    <span className="text-xs font-mono" style={{ color: a.active ? a.color : "#334155" }}>
                      {a.active ? `${a.load}%` : "INAKTIV"}
                    </span>
                  </div>
                  <div className="w-full bg-white/5 rounded-full h-1 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${a.load}%` }}
                      transition={{ duration: 1, delay: 0.5 }}
                      className="h-full rounded-full"
                      style={{ background: a.active ? a.color : "transparent", boxShadow: a.active ? `0 0 4px ${a.color}` : "none" }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 space-y-1.5" style={{ borderTop: "1px solid rgba(123,47,255,0.2)" }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Cpu className="w-3.5 h-3.5 text-neon-purple" />
                  <span className="text-xs text-slate-500">{activeAgentCount}/{AGENT_ACTIVITY.length} Agenten aktiv</span>
                </div>
                {healthMetrics && (
                  <span className="text-xs font-mono text-neon-green">{healthMetrics.signals_generated_today} Signals heute</span>
                )}
              </div>
              {healthMetrics && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Radio className="w-3 h-3 text-neon-cyan" />
                    <span className="text-xs text-slate-500">{healthMetrics.ws_connections_active} Verbindungen aktiv</span>
                  </div>
                  <span className="text-xs text-slate-600">
                    Up {Math.floor(healthMetrics.uptime_seconds / 86400)}d {Math.floor((healthMetrics.uptime_seconds % 86400) / 3600)}h
                  </span>
                </div>
              )}
            </div>
          </GlassCard>

          {/* Risk Mini Gauges */}
          <GlassCard variant="pink" delay={0.35}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-neon-pink" />
                <SectionLabel>Risiko-Übersicht</SectionLabel>
              </div>
              <InfoButton onClick={() => setExplainContent(EXPLAIN_RISK)} color="pink" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <TachometerGauge
                value={risk.current_drawdown * 100}
                max={20}
                label="Drawdown"
                unit="%"
                color="#FF0080"
              />
              <TachometerGauge
                value={risk.sharpe_ratio}
                max={3}
                label="Sharpe"
                unit="x"
                color="#00FF88"
              />
            </div>
            <div className="mt-2 flex items-center justify-center gap-2">
              {risk.alerts.length > 0 ? (
                <>
                  <AlertTriangle className="w-3.5 h-3.5" style={{ color: "#FF0080" }} />
                  <span className="text-xs" style={{ color: "#FF0080" }}>{risk.alerts.length} aktive{risk.alerts.length !== 1 ? " Alarme" : " Alarm"}</span>
                </>
              ) : (
                <>
                  <Activity className="w-3.5 h-3.5 text-neon-green" />
                  <span className="text-xs" style={{ color: "#00FF88" }}>Risiko im Rahmen</span>
                </>
              )}
            </div>
          </GlassCard>

          {/* Active Signals Count */}
          <GlassCard variant="cyan" delay={0.4}>
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-4 h-4 text-cyan-400" />
              <SectionLabel>Signale heute</SectionLabel>
            </div>
            <div className="text-3xl font-bold font-mono text-center py-2" style={{ color: "#00D4FF", textShadow: "0 0 20px rgba(0,212,255,0.5)" }}>
              {dailyStats?.total_today ?? (INITIAL_SIGNALS_COUNT + signals.length)}
            </div>
            <div className="flex justify-around text-center mt-1">
              <div>
                <p className="text-xs font-bold" style={{ color: "#00FF88" }}>{dailyStats?.buy ?? signalCounts.buy}</p>
                <p className="text-xs text-slate-500">Kauf</p>
              </div>
              <div>
                <p className="text-xs font-bold" style={{ color: "#FFD700" }}>{dailyStats?.hold ?? signalCounts.hold}</p>
                <p className="text-xs text-slate-500">Halten</p>
              </div>
              <div>
                <p className="text-xs font-bold" style={{ color: "#FF0080" }}>{dailyStats?.sell ?? signalCounts.sell}</p>
                <p className="text-xs text-slate-500">Verkauf</p>
              </div>
            </div>
            {quotaUsage && quotaUsage.signals_limit > 0 && (
              <div className="mt-3 pt-3" style={{ borderTop: "1px solid rgba(0,212,255,0.15)" }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-slate-500">Tageskontingent</span>
                  <span
                    className="text-xs font-mono font-bold"
                    style={{
                      color: quotaUsage.signals_remaining === 0 ? "#FF0080"
                        : quotaUsage.signals_remaining <= 1 ? "#FFD700"
                        : "#00D4FF",
                    }}
                  >
                    {quotaUsage.signals_used_today}/{quotaUsage.signals_limit}
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min((quotaUsage.signals_used_today / quotaUsage.signals_limit) * 100, 100)}%`,
                      background: quotaUsage.signals_remaining === 0 ? "#FF0080"
                        : quotaUsage.signals_remaining <= 1 ? "#FFD700"
                        : "#00D4FF",
                    }}
                  />
                </div>
                {quotaUsage.signals_remaining === 0 && (
                  <p className="text-xs mt-1 text-center" style={{ color: "#FF0080" }}>Kontingent aufgebraucht · Reset 00:00 UTC</p>
                )}
              </div>
            )}
          </GlassCard>

          {/* Quick Actions */}
          <GlassCard delay={0.45}>
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-4 h-4 text-neon-green" />
              <SectionLabel>Schnellzugriff</SectionLabel>
            </div>
            <div className="space-y-2">
              <Link
                href="/signals/marketplace"
                className="flex items-center justify-between px-3 py-2 rounded-lg group transition-colors"
                style={{ background: "rgba(0,212,255,0.06)", border: "1px solid rgba(0,212,255,0.12)" }}
              >
                <div className="flex items-center gap-2">
                  <BarChart2 className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="text-xs text-slate-300 group-hover:text-cyan-400 transition-colors">Signal-Bilanz</span>
                </div>
                <ArrowUpRight className="w-3 h-3 text-slate-600 group-hover:text-cyan-400 transition-colors" />
              </Link>
              <Link
                href="/pricing"
                className="flex items-center justify-between px-3 py-2 rounded-lg group transition-colors"
                style={{ background: "rgba(123,47,255,0.06)", border: "1px solid rgba(123,47,255,0.12)" }}
              >
                <div className="flex items-center gap-2">
                  <ShoppingCart className="w-3.5 h-3.5 text-neon-purple" />
                  <span className="text-xs text-slate-300 group-hover:text-neon-purple transition-colors">Plan upgraden</span>
                </div>
                <ArrowUpRight className="w-3 h-3 text-slate-600 group-hover:text-neon-purple transition-colors" />
              </Link>
              <Link
                href="/billing"
                className="flex items-center justify-between px-3 py-2 rounded-lg group transition-colors"
                style={{ background: "rgba(0,255,136,0.05)", border: "1px solid rgba(0,255,136,0.1)" }}
              >
                <div className="flex items-center gap-2">
                  <CreditCard className="w-3.5 h-3.5 text-neon-green" />
                  <span className="text-xs text-slate-300 group-hover:text-neon-green transition-colors">Abo verwalten</span>
                </div>
                <ArrowUpRight className="w-3 h-3 text-slate-600 group-hover:text-neon-green transition-colors" />
              </Link>
            </div>
          </GlassCard>

          {/* Referral Widget */}
          {username && tier !== "demo" && (
            <GlassCard delay={0.46}>
              <div className="flex items-center gap-2 mb-2">
                <ArrowUpRight className="w-4 h-4" style={{ color: "#00FF88" }} />
                <SectionLabel>Freunde einladen</SectionLabel>
              </div>
              <p className="text-xs text-slate-500 mb-3">Teile Neural Trading OS mit deinem Netzwerk.</p>
              <button
                onClick={copyReferralLink}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg transition-all"
                style={{
                  background: referralCopied ? "rgba(0,255,136,0.08)" : "rgba(0,212,255,0.05)",
                  border: `1px solid ${referralCopied ? "rgba(0,255,136,0.3)" : "rgba(0,212,255,0.12)"}`,
                }}
              >
                <span className="text-xs font-mono text-slate-400 truncate max-w-[140px]">
                  /invite/{btoa(username)}
                </span>
                {referralCopied
                  ? <Check className="w-3.5 h-3.5 shrink-0 ml-2" style={{ color: "#00FF88" }} />
                  : <Copy className="w-3.5 h-3.5 shrink-0 ml-2 text-slate-500" />
                }
              </button>
              <p className="text-xs text-center mt-1.5" style={{ color: referralCopied ? "#00FF88" : "#475569" }}>
                {referralCopied ? "Link kopiert!" : "Klicken zum Kopieren"}
              </p>
              {referralCount !== null && (
                <div className="mt-3 pt-3 flex items-center justify-between" style={{ borderTop: "1px solid rgba(0,255,136,0.1)" }}>
                  <span className="text-xs text-slate-600">Eingeladene Nutzer</span>
                  <span className="text-xs font-bold font-mono" style={{ color: referralCount > 0 ? "#00FF88" : "#475569" }}>
                    {referralCount > 0 ? `✓ ${referralCount}` : "0"}
                  </span>
                </div>
              )}
            </GlassCard>
          )}

          {/* Upgrade CTA für Free/Demo-User */}
          {(tier === "free" || tier === "demo" || tier === null) && (
            <GlassCard delay={0.48}>
              <div
                className="rounded-xl p-4 text-center"
                style={{
                  background: "linear-gradient(135deg, rgba(123,47,255,0.1), rgba(0,212,255,0.06))",
                  border: "1px solid rgba(123,47,255,0.25)",
                }}
              >
                <p className="text-xs font-bold text-violet-400 tracking-wider uppercase mb-1">Free Plan</p>
                <p className="text-sm font-semibold text-white mb-3">3 Signale/Tag · Upgrade für mehr</p>
                <Link
                  href="/billing?plan=basic"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all"
                  style={{
                    background: "rgba(123,47,255,0.2)",
                    border: "1px solid rgba(123,47,255,0.4)",
                    color: "#a78bfa",
                  }}
                >
                  <ShoppingCart className="w-3.5 h-3.5" />
                  Jetzt upgraden
                  <ArrowUpRight className="w-3 h-3" />
                </Link>
              </div>
            </GlassCard>
          )}

          {/* Top Signal des Tages */}
          {topSignal && (
            <GlassCard delay={0.5}>
              <div className="flex items-center gap-2 mb-3">
                <Target className="w-4 h-4 text-neon-green" />
                <SectionLabel>Stärkstes Signal</SectionLabel>
              </div>
              <Link href="/signals" className="block group">
                <div
                  className="rounded-xl p-3 transition-all group-hover:brightness-110"
                  style={{
                    background: topSignal.direction.includes("BUY")
                      ? "rgba(0,255,136,0.06)"
                      : topSignal.direction.includes("SELL")
                      ? "rgba(255,0,128,0.06)"
                      : "rgba(255,215,0,0.06)",
                    border: `1px solid ${topSignal.direction.includes("BUY") ? "rgba(0,255,136,0.2)" : topSignal.direction.includes("SELL") ? "rgba(255,0,128,0.2)" : "rgba(255,215,0,0.2)"}`,
                  }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-black text-slate-100 font-mono">{topSignal.ticker}</span>
                    <span
                      className="text-xs font-bold px-2 py-0.5 rounded-md"
                      style={{
                        color: topSignal.direction.includes("BUY") ? "#00FF88" : topSignal.direction.includes("SELL") ? "#FF0080" : "#FFD700",
                        background: topSignal.direction.includes("BUY") ? "rgba(0,255,136,0.12)" : topSignal.direction.includes("SELL") ? "rgba(255,0,128,0.12)" : "rgba(255,215,0,0.12)",
                      }}
                    >
                      {dirLabel(topSignal.direction)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
                      <div
                        className="h-1.5 rounded-full"
                        style={{
                          width: `${Math.round((topSignal.confidence ?? 0) * 100)}%`,
                          background: topSignal.direction.includes("BUY") ? "#00FF88" : topSignal.direction.includes("SELL") ? "#FF0080" : "#FFD700",
                        }}
                      />
                    </div>
                    <span className="text-xs text-slate-400 font-mono flex-shrink-0">
                      {Math.round((topSignal.confidence ?? 0) * 100)}%
                    </span>
                  </div>
                </div>
                <p className="text-xs text-slate-600 mt-2 text-right group-hover:text-slate-500 transition-colors">
                  Alle Signale ansehen →
                </p>
              </Link>
            </GlassCard>
          )}
        </div>
      </div>

      {/* ---- Positions Table ---- */}
      <GlassCard delay={0.45} padding="p-4">
        <div className="flex items-center justify-between mb-4">
          <SectionLabel>Offene Positionen ({portfolio.positions.length})</SectionLabel>
          <NeonBadge color={executionMode === "live" ? "pink" : "cyan"}>
            {executionMode === "live" ? "LIVE" : "PAPER"}
          </NeonBadge>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                {["Ticker", "Menge", "Kaufkurs", "Aktuell", "Wert", "P&L %", "Gewicht"].map((h) => (
                  <th key={h} className="text-left py-2 pr-4 text-xs text-slate-600 uppercase tracking-wider font-semibold first:pl-0">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {portfolio.positions.map((pos, i) => {
                const pos2 = pos.unrealized_pnl >= 0;
                return (
                  <motion.tr
                    key={pos.ticker}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.5 + i * 0.05 }}
                    className="group"
                    style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                  >
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-6 h-6 rounded text-xs font-bold flex items-center justify-center"
                          style={{ background: `${DONUT_COLORS[i % DONUT_COLORS.length]}20`, color: DONUT_COLORS[i % DONUT_COLORS.length] }}
                        >
                          {pos.ticker.slice(0, 2)}
                        </div>
                        <span className="font-bold text-slate-200">{pos.ticker}</span>
                      </div>
                    </td>
                    <td className="pr-4 font-mono text-slate-400">{pos.quantity.toFixed(pos.asset_class === "crypto" ? 4 : 0)}</td>
                    <td className="pr-4 font-mono text-slate-400">${pos.avg_entry_price.toLocaleString()}</td>
                    <td className="pr-4 font-mono text-slate-300">${pos.current_price.toLocaleString()}</td>
                    <td className="pr-4 font-mono text-slate-300">${pos.market_value.toLocaleString()}</td>
                    <td className="pr-4">
                      <span
                        className="font-mono font-bold"
                        style={{
                          color: pos2 ? "#00FF88" : "#FF0080",
                          textShadow: pos2 ? "0 0 6px rgba(0,255,136,0.3)" : "0 0 6px rgba(255,0,128,0.3)",
                        }}
                      >
                        {pos2 ? "+" : ""}{(pos.unrealized_pnl_pct * 100).toFixed(2)}%
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-white/5 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${(pos.weight * 100).toFixed(0)}%`, background: DONUT_COLORS[i % DONUT_COLORS.length] }}
                          />
                        </div>
                        <span className="text-xs font-mono text-slate-500">{(pos.weight * 100).toFixed(0)}%</span>
                      </div>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {/* Explanation Modal */}
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
