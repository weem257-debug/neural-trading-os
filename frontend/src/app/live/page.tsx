"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Radio, Plus, X, RefreshCw, AlertTriangle, WifiOff, SearchX,
  TrendingUp, TrendingDown, Minus, Activity, Gauge, Waves as WavesIcon,
  ShieldAlert, BarChart3, Info, Globe,
} from "lucide-react";
import { api } from "@/lib/api";
import type { LiveMarketAnalysis, MarketRegime, MarketSignalBias, MarketCategory } from "@/types";
import { GlassCard, SectionLabel, NeonBadge } from "@/components/ui/GlassCard";
import { SkeletonBlock, SkeletonCard, SkeletonChart } from "@/components/ui/Skeleton";
import { TradingViewWidget } from "@/components/trading/TradingViewWidget";
import { notify } from "@/store/notificationStore";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const DEFAULT_WATCHLIST = ["AAPL", "MSFT", "BTC-USD"];
const MAX_SYMBOLS = 15;

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------
function fmtNum(v: number | undefined | null, digits = 2): string {
  if (v === undefined || v === null || Number.isNaN(v)) return "—";
  return v.toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function fmtPrice(v: number | undefined | null): string {
  if (v === undefined || v === null || Number.isNaN(v)) return "—";
  return `$${fmtNum(v, v >= 1000 ? 0 : 2)}`;
}

function fmtVolume(v: number | undefined | null): string {
  if (v === undefined || v === null || Number.isNaN(v)) return "—";
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(v);
}

// ---------------------------------------------------------------------------
// Watchlist bar — add/remove symbols, select active symbol
// ---------------------------------------------------------------------------
function WatchlistBar({
  symbols,
  activeSymbol,
  loading,
  onSelect,
  onAdd,
  onRemove,
}: {
  symbols: string[];
  activeSymbol: string;
  loading: boolean;
  onSelect: (s: string) => void;
  onAdd: (s: string) => void;
  onRemove: (s: string) => void;
}) {
  const [showInput, setShowInput] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showInput) inputRef.current?.focus();
  }, [showInput]);

  const handleAdd = () => {
    const symbol = inputValue.trim().toUpperCase();
    if (!symbol) return;
    onAdd(symbol);
    setInputValue("");
    setShowInput(false);
  };

  return (
    <GlassCard padding="p-4">
      <div className="flex items-center justify-between mb-3">
        <SectionLabel>Watchlist</SectionLabel>
        <span
          className="text-xs px-2 py-0.5 rounded font-mono"
          style={{ background: "rgba(0,212,255,0.1)", color: "#00D4FF", border: "1px solid rgba(0,212,255,0.25)" }}
        >
          {symbols.length}/{MAX_SYMBOLS}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {loading && symbols.length === 0 && (
          <>
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonBlock key={i} height={32} width={80} rounded="rounded-xl" />
            ))}
          </>
        )}

        <AnimatePresence mode="popLayout">
          {symbols.map((s) => {
            const active = s === activeSymbol;
            return (
              <motion.div
                key={s}
                layout
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                className="group relative"
              >
                <button
                  onClick={() => onSelect(s)}
                  aria-current={active ? "true" : undefined}
                  aria-label={`${s} auswählen`}
                  className="flex items-center gap-1.5 pl-3 pr-7 py-1.5 rounded-xl text-xs font-bold font-mono transition-all"
                  style={{
                    background: active ? "rgba(0,212,255,0.18)" : "rgba(255,255,255,0.04)",
                    border: active ? "1px solid rgba(0,212,255,0.5)" : "1px solid rgba(255,255,255,0.08)",
                    color: active ? "#00D4FF" : "#94a3b8",
                    boxShadow: active ? "0 0 10px rgba(0,212,255,0.15)" : "none",
                  }}
                >
                  {s}
                </button>
                <button
                  onClick={() => onRemove(s)}
                  aria-label={`${s} aus Watchlist entfernen`}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ color: "#FF0080" }}
                >
                  <X className="w-3 h-3" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Add-symbol control */}
        {showInput ? (
          <div className="flex items-center gap-1.5">
            <input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
                if (e.key === "Escape") { setShowInput(false); setInputValue(""); }
              }}
              placeholder="z.B. NVDA, ETH-USD"
              maxLength={12}
              className="w-36 rounded-xl px-3 py-1.5 text-xs font-mono text-slate-200 placeholder-slate-600 outline-none"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(0,212,255,0.3)" }}
            />
            <button
              onClick={handleAdd}
              disabled={symbols.length >= MAX_SYMBOLS}
              className="px-2.5 py-1.5 rounded-xl text-xs font-bold disabled:opacity-40"
              style={{ background: "rgba(0,212,255,0.15)", border: "1px solid rgba(0,212,255,0.4)", color: "#00D4FF" }}
            >
              Add
            </button>
          </div>
        ) : (
          symbols.length < MAX_SYMBOLS && (
            <button
              onClick={() => setShowInput(true)}
              aria-label="Symbol zur Watchlist hinzufügen"
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px dashed rgba(255,255,255,0.15)", color: "#64748B" }}
            >
              <Plus className="w-3.5 h-3.5" /> Symbol
            </button>
          )
        )}
      </div>
    </GlassCard>
  );
}

// ---------------------------------------------------------------------------
// Market browser — pick a market category, then a symbol to analyze
// ---------------------------------------------------------------------------
function MarketBrowser({
  activeSymbol,
  watchlist,
  onSelect,
  onAddToWatchlist,
}: {
  activeSymbol: string;
  watchlist: string[];
  onSelect: (s: string) => void;
  onAddToWatchlist: (s: string) => void;
}) {
  const [markets, setMarkets] = useState<MarketCategory[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.analysis.markets();
        if (cancelled) return;
        setMarkets(data.markets);
        setActiveCategory(data.markets[0]?.id ?? "");
      } catch {
        // Endpoint not deployed yet — hide the browser instead of erroring.
        if (!cancelled) setMarkets([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <GlassCard padding="p-4">
        <div className="flex items-center gap-2 mb-3">
          <SectionLabel>Märkte</SectionLabel>
        </div>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonBlock key={i} height={30} width={92} rounded="rounded-xl" />
          ))}
        </div>
      </GlassCard>
    );
  }

  if (markets.length === 0) return null;

  const category = markets.find((m) => m.id === activeCategory) ?? markets[0];

  return (
    <GlassCard padding="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Globe className="w-3.5 h-3.5" style={{ color: "#7B2FFF" }} />
          <SectionLabel>Märkte</SectionLabel>
        </div>
        <span className="text-xs text-slate-600">Markt wählen → Symbol analysieren</span>
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-2 mb-3">
        {markets.map((m) => {
          const active = m.id === category.id;
          return (
            <button
              key={m.id}
              onClick={() => setActiveCategory(m.id)}
              aria-current={active ? "true" : undefined}
              className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
              style={{
                background: active ? "rgba(123,47,255,0.18)" : "rgba(255,255,255,0.04)",
                border: active ? "1px solid rgba(123,47,255,0.5)" : "1px solid rgba(255,255,255,0.08)",
                color: active ? "#B794FF" : "#94a3b8",
                boxShadow: active ? "0 0 10px rgba(123,47,255,0.15)" : "none",
              }}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      {/* Symbols of the active category */}
      <div className="flex flex-wrap gap-2">
        {category.symbols.map((s) => {
          const active = s.symbol === activeSymbol;
          const inWatchlist = watchlist.includes(s.symbol);
          return (
            <div key={s.symbol} className="group relative">
              <button
                onClick={() => onSelect(s.symbol)}
                aria-current={active ? "true" : undefined}
                aria-label={`${s.name} (${s.symbol}) analysieren`}
                className={`flex items-center gap-1.5 pl-3 py-1.5 rounded-xl text-xs transition-all ${inWatchlist ? "pr-3" : "pr-7"}`}
                style={{
                  background: active ? "rgba(0,212,255,0.18)" : "rgba(255,255,255,0.04)",
                  border: active ? "1px solid rgba(0,212,255,0.5)" : "1px solid rgba(255,255,255,0.08)",
                  color: active ? "#00D4FF" : "#94a3b8",
                }}
              >
                <span className="font-bold font-mono">{s.symbol}</span>
                <span className="text-slate-600">{s.name}</span>
              </button>
              {!inWatchlist && (
                <button
                  onClick={() => onAddToWatchlist(s.symbol)}
                  aria-label={`${s.symbol} zur Watchlist hinzufügen`}
                  title="Zur Watchlist hinzufügen"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ color: "#00FF88" }}
                >
                  <Plus className="w-3 h-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}

// ---------------------------------------------------------------------------
// Price header card
// ---------------------------------------------------------------------------
function PriceHeaderCard({ analysis }: { analysis: LiveMarketAnalysis }) {
  const { price } = analysis;
  const positive = price.change_pct >= 0;
  const color = positive ? "#00FF88" : "#FF0080";

  return (
    <GlassCard delay={0.05}>
      <div className="flex items-center justify-between mb-3">
        <SectionLabel>Kurs</SectionLabel>
        <span className="text-xs text-slate-600 font-mono">
          Stand: {new Date(analysis.as_of).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </span>
      </div>
      <div className="flex items-end gap-3 flex-wrap">
        <p className="text-3xl font-bold font-mono text-slate-100">{fmtPrice(price.last)}</p>
        <div className="flex items-center gap-1.5 pb-1" style={{ color }}>
          {positive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
          <span className="font-mono font-bold text-sm" style={{ textShadow: `0 0 8px ${color}50` }}>
            {positive ? "+" : ""}{fmtNum(price.change, 2)} ({positive ? "+" : ""}{fmtNum(price.change_pct, 2)}%)
          </span>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 mt-4 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div>
          <p className="text-xs text-slate-500 mb-0.5">Tageshoch</p>
          <p className="text-sm font-mono font-semibold text-slate-300">{fmtPrice(price.day_high)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-0.5">Tagestief</p>
          <p className="text-sm font-mono font-semibold text-slate-300">{fmtPrice(price.day_low)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-0.5">Volumen</p>
          <p className="text-sm font-mono font-semibold text-slate-300">{fmtVolume(price.volume)}</p>
        </div>
      </div>
    </GlassCard>
  );
}

// ---------------------------------------------------------------------------
// Regime badge
// ---------------------------------------------------------------------------
const REGIME_META: Record<MarketRegime, { label: string; color: string; icon: React.ElementType }> = {
  trending_up: { label: "AUFWÄRTSTREND", color: "#00FF88", icon: TrendingUp },
  trending_down: { label: "ABWÄRTSTREND", color: "#FF0080", icon: TrendingDown },
  ranging: { label: "SEITWÄRTS", color: "#00D4FF", icon: Minus },
  volatile: { label: "VOLATIL", color: "#FFD700", icon: Activity },
};

function RegimeBadge({ regime }: { regime: MarketRegime }) {
  const meta = REGIME_META[regime] ?? REGIME_META.ranging;
  const Icon = meta.icon;
  return (
    <span
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold"
      style={{ background: `${meta.color}18`, border: `1px solid ${meta.color}40`, color: meta.color, textShadow: `0 0 8px ${meta.color}50` }}
    >
      <Icon className="w-3.5 h-3.5" /> {meta.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Signal card — bias color-coded + score + reasons
// ---------------------------------------------------------------------------
const BIAS_META: Record<MarketSignalBias, { label: string; color: string; icon: React.ElementType }> = {
  bullish: { label: "BULLISH", color: "#00FF88", icon: TrendingUp },
  bearish: { label: "BEARISH", color: "#FF0080", icon: TrendingDown },
  neutral: { label: "NEUTRAL", color: "#94a3b8", icon: Minus },
};

function SignalCard({ analysis }: { analysis: LiveMarketAnalysis }) {
  const meta = BIAS_META[analysis.signal.bias] ?? BIAS_META.neutral;
  const Icon = meta.icon;
  const scorePct = Math.round(Math.min(Math.max(Math.abs(analysis.signal.score), 0), 1) * 100);

  return (
    <GlassCard delay={0.1}>
      <div className="flex items-center justify-between mb-3">
        <SectionLabel>KI-Signal</SectionLabel>
        <RegimeBadge regime={analysis.regime} />
      </div>
      <div className="flex items-center gap-3 mb-3">
        <span
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-black"
          style={{ background: `${meta.color}18`, border: `1px solid ${meta.color}40`, color: meta.color, textShadow: `0 0 10px ${meta.color}50` }}
        >
          <Icon className="w-4 h-4" /> {meta.label}
        </span>
        <div className="flex-1 min-w-24">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-slate-500">Score</span>
            <span className="font-mono font-bold" style={{ color: meta.color }}>{fmtNum(analysis.signal.score, 2)}</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${scorePct}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="h-full rounded-full"
              style={{ background: meta.color, boxShadow: `0 0 6px ${meta.color}60` }}
            />
          </div>
        </div>
      </div>
      {analysis.signal.reasons?.length > 0 ? (
        <ul className="space-y-1.5">
          {analysis.signal.reasons.map((r, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-slate-400">
              <span style={{ color: meta.color }}>·</span> {r}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-600">Keine Begründung verfügbar.</p>
      )}
    </GlassCard>
  );
}

// ---------------------------------------------------------------------------
// Indicator tiles
// ---------------------------------------------------------------------------
function IndicatorTile({
  icon: Icon, label, value, sub, color = "#00D4FF", delay = 0,
}: {
  icon: React.ElementType; label: string; value: string; sub?: string; color?: string; delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="rounded-xl p-4"
      style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))", border: `1px solid ${color}25` }}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: `${color}15` }}>
          <Icon className="w-3.5 h-3.5" style={{ color }} />
        </div>
        <p className="text-xs text-slate-500 uppercase tracking-wider">{label}</p>
      </div>
      <p className="text-lg font-bold font-mono" style={{ color, textShadow: `0 0 10px ${color}40` }}>{value}</p>
      {sub && <p className="text-xs text-slate-600 mt-0.5">{sub}</p>}
    </motion.div>
  );
}

function IndicatorGrid({ analysis }: { analysis: LiveMarketAnalysis }) {
  const { indicators } = analysis;
  const rsi = indicators.rsi_14;
  const rsiColor = rsi >= 70 ? "#FF0080" : rsi <= 30 ? "#00FF88" : "#00D4FF";
  const macdColor = indicators.macd.hist >= 0 ? "#00FF88" : "#FF0080";
  const bbColor = indicators.bollinger.pct_b >= 1 ? "#FF0080" : indicators.bollinger.pct_b <= 0 ? "#00FF88" : "#7B2FFF";

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <IndicatorTile icon={Gauge} label="RSI (14)" value={fmtNum(rsi, 1)} sub={rsi >= 70 ? "Überkauft" : rsi <= 30 ? "Überverkauft" : "Neutral"} color={rsiColor} delay={0.05} />
      <IndicatorTile
        icon={Activity}
        label="MACD"
        value={fmtNum(indicators.macd.macd, 3)}
        sub={`Signal ${fmtNum(indicators.macd.signal, 3)} · Hist ${fmtNum(indicators.macd.hist, 3)}`}
        color={macdColor}
        delay={0.08}
      />
      <IndicatorTile
        icon={WavesIcon}
        label="Bollinger %B"
        value={fmtNum(indicators.bollinger.pct_b, 2)}
        sub={`${fmtPrice(indicators.bollinger.lower)} – ${fmtPrice(indicators.bollinger.upper)}`}
        color={bbColor}
        delay={0.11}
      />
      <IndicatorTile icon={BarChart3} label="ATR (14)" value={fmtNum(indicators.atr_14, 2)} sub="Volatilität" color="#FFD700" delay={0.14} />
      <IndicatorTile icon={TrendingUp} label="SMA 20" value={fmtPrice(indicators.sma_20)} color="#00D4FF" delay={0.17} />
      <IndicatorTile icon={TrendingUp} label="SMA 50" value={fmtPrice(indicators.sma_50)} color="#7B2FFF" delay={0.2} />
      <IndicatorTile icon={TrendingUp} label="SMA 200" value={fmtPrice(indicators.sma_200)} color="#FF0080" delay={0.23} />
      <IndicatorTile icon={BarChart3} label="Ø Volumen (20)" value={fmtVolume(indicators.volume_avg_20)} color="#94a3b8" delay={0.26} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Regulatory notice — dezent, tolerant against unknown object shape
// ---------------------------------------------------------------------------
function RegulatoryNotice({ notice }: { notice: Record<string, unknown> | undefined | null }) {
  if (!notice || Object.keys(notice).length === 0) return null;

  const title = (notice.title as string) || "Regulatorischer Hinweis";
  const text =
    (notice.text as string) ||
    (notice.message as string) ||
    (notice.disclaimer as string) ||
    (notice.notice as string) ||
    null;

  return (
    <div
      className="rounded-xl p-3.5 flex items-start gap-2.5"
      style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: "#64748B" }} />
      <div>
        <p className="text-xs font-semibold text-slate-500 mb-0.5">{title}</p>
        {text ? (
          <p className="text-xs text-slate-600 leading-relaxed">{text}</p>
        ) : (
          <p className="text-xs text-slate-600 leading-relaxed">
            {Object.entries(notice)
              .filter(([k]) => k !== "title")
              .map(([k, v]) => `${k}: ${String(v)}`)
              .join(" · ")}
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error states
// ---------------------------------------------------------------------------
type AnalysisError = { kind: "not_found" | "network" | "other"; message: string };

function AnalysisErrorCard({ error, onRetry }: { error: AnalysisError; onRetry: () => void }) {
  const meta = {
    not_found: { icon: SearchX, title: "Symbol nicht gefunden", color: "#FF0080" },
    network: { icon: WifiOff, title: "Netzwerkfehler", color: "#FFD700" },
    other: { icon: AlertTriangle, title: "Analyse fehlgeschlagen", color: "#FFD700" },
  }[error.kind];
  const Icon = meta.icon;

  return (
    <GlassCard className="flex flex-col items-center justify-center py-12 text-center" delay={0.05}>
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center mb-3"
        style={{ background: `${meta.color}15`, border: `1px solid ${meta.color}35` }}
      >
        <Icon className="w-6 h-6" style={{ color: meta.color }} />
      </div>
      <p className="text-sm font-bold text-slate-200 mb-1">{meta.title}</p>
      <p className="text-xs text-slate-500 max-w-xs mb-4">{error.message}</p>
      <button
        onClick={onRetry}
        className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all"
        style={{ background: "rgba(0,212,255,0.12)", border: "1px solid rgba(0,212,255,0.35)", color: "#00D4FF" }}
      >
        <RefreshCw className="w-3.5 h-3.5" /> Erneut versuchen
      </button>
    </GlassCard>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function LiveAnalysisPage() {
  const [symbols, setSymbols] = useState<string[]>([]);
  const [activeSymbol, setActiveSymbol] = useState<string>("");
  const [watchlistLoading, setWatchlistLoading] = useState(true);
  const [watchlistIsFallback, setWatchlistIsFallback] = useState(false);

  const [analysis, setAnalysis] = useState<LiveMarketAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<AnalysisError | null>(null);

  // ---- Load watchlist on mount ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.analysis.watchlistGet();
        if (cancelled) return;
        const list = data.symbols?.length ? data.symbols : DEFAULT_WATCHLIST;
        setSymbols(list);
        setActiveSymbol(list[0]);
        setWatchlistIsFallback(false);
      } catch {
        if (cancelled) return;
        // Backend endpoint may not be ready yet — fall back to a sensible default
        // watchlist so the page stays usable. Nothing is persisted until the
        // user explicitly changes the list.
        setSymbols(DEFAULT_WATCHLIST);
        setActiveSymbol(DEFAULT_WATCHLIST[0]);
        setWatchlistIsFallback(true);
      } finally {
        if (!cancelled) setWatchlistLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ---- Persist watchlist changes ----
  const persistWatchlist = useCallback(async (next: string[]) => {
    try {
      await api.analysis.watchlistSet(next);
      setWatchlistIsFallback(false);
    } catch (e) {
      notify.error("Watchlist konnte nicht gespeichert werden", e instanceof Error ? e.message : undefined);
    }
  }, []);

  const handleAddSymbol = useCallback((symbol: string) => {
    setSymbols((prev) => {
      if (prev.includes(symbol) || prev.length >= MAX_SYMBOLS) return prev;
      const next = [...prev, symbol];
      persistWatchlist(next);
      return next;
    });
    setActiveSymbol(symbol);
  }, [persistWatchlist]);

  const handleRemoveSymbol = useCallback((symbol: string) => {
    setSymbols((prev) => {
      const next = prev.filter((s) => s !== symbol);
      persistWatchlist(next);
      if (activeSymbol === symbol) {
        setActiveSymbol(next[0] ?? "");
      }
      return next;
    });
  }, [activeSymbol, persistWatchlist]);

  // ---- Load live analysis whenever the active symbol changes ----
  const loadAnalysis = useCallback(async (symbol: string) => {
    if (!symbol) return;
    setAnalysisLoading(true);
    setAnalysisError(null);
    try {
      const data = await api.analysis.live(symbol);
      setAnalysis(data);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unbekannter Fehler";
      if (/\b404\b/.test(message)) {
        setAnalysisError({ kind: "not_found", message: `Für "${symbol}" liegen keine Live-Daten vor.` });
      } else if (/failed to fetch|networkerror|load failed/i.test(message)) {
        setAnalysisError({ kind: "network", message: "Backend nicht erreichbar. Bitte Verbindung prüfen." });
      } else {
        setAnalysisError({ kind: "other", message });
      }
      setAnalysis(null);
    } finally {
      setAnalysisLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeSymbol) loadAnalysis(activeSymbol);
  }, [activeSymbol, loadAnalysis]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <div className="flex items-center gap-3 mb-1">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: "rgba(0,212,255,0.15)", border: "1px solid rgba(0,212,255,0.3)" }}
          >
            <Radio className="w-4 h-4" style={{ color: "#00D4FF" }} />
          </div>
          <h1 className="text-2xl font-bold text-slate-100">Live-Markt-Analyse</h1>
          {activeSymbol && <NeonBadge color="cyan">{activeSymbol}</NeonBadge>}
          {watchlistIsFallback && (
            <span
              className="text-xs font-bold px-2.5 py-1 rounded-full"
              style={{ background: "rgba(100,116,139,0.12)", border: "1px solid rgba(100,116,139,0.3)", color: "#64748B" }}
            >
              LOKAL
            </span>
          )}
        </div>
        <p className="text-sm text-slate-500">
          Watchlist, Live-Indikatoren, Marktregime und KI-Signal — Chart via TradingView.
        </p>
      </motion.div>

      {/* Watchlist */}
      <WatchlistBar
        symbols={symbols}
        activeSymbol={activeSymbol}
        loading={watchlistLoading}
        onSelect={setActiveSymbol}
        onAdd={handleAddSymbol}
        onRemove={handleRemoveSymbol}
      />

      {/* Market browser — curated categories with selectable symbols */}
      <MarketBrowser
        activeSymbol={activeSymbol}
        watchlist={symbols}
        onSelect={setActiveSymbol}
        onAddToWatchlist={handleAddSymbol}
      />

      {!activeSymbol && !watchlistLoading && (
        <GlassCard className="flex flex-col items-center justify-center py-12 text-center">
          <ShieldAlert className="w-8 h-8 mb-2" style={{ color: "#64748B" }} />
          <p className="text-sm text-slate-400">Watchlist ist leer. Füge ein Symbol hinzu, um die Live-Analyse zu starten.</p>
        </GlassCard>
      )}

      {/* Analysis loading */}
      {analysisLoading && !analysis && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SkeletonCard />
            <SkeletonCard />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        </div>
      )}

      {/* Analysis error */}
      {analysisError && !analysisLoading && (
        <AnalysisErrorCard error={analysisError} onRetry={() => loadAnalysis(activeSymbol)} />
      )}

      {/* Analysis content */}
      {analysis && !analysisError && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <PriceHeaderCard analysis={analysis} />
            <SignalCard analysis={analysis} />
          </div>

          <GlassCard delay={0.02} padding="p-5">
            <div className="flex items-center justify-between mb-4">
              <SectionLabel>Indikatoren</SectionLabel>
              {analysisLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-600" />}
            </div>
            <IndicatorGrid analysis={analysis} />
          </GlassCard>

          <RegulatoryNotice notice={analysis.regulatory_notice} />
        </>
      )}

      {/* TradingView chart — independent of backend analysis data */}
      {activeSymbol && (
        <GlassCard delay={0.05} padding="p-4">
          <div className="flex items-center justify-between mb-3">
            <SectionLabel>Chart (TradingView)</SectionLabel>
            <span className="text-xs text-slate-600">Kursoptik via offizielles TradingView-Widget</span>
          </div>
          <TradingViewWidget symbol={activeSymbol} height={440} />
        </GlassCard>
      )}
    </div>
  );
}
