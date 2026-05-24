"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, RefreshCw, Eye } from "lucide-react";
import { api } from "@/lib/api";
import { useTradingStore } from "@/store/tradingStore";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface WatchlistEntry {
  ticker: string;
  price: number | null;
  change_pct: number | null;
  history: number[];
  error?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const DEFAULT_TICKERS = ["AAPL", "MSFT", "NVDA", "TSLA", "BTC-USD"];
const MAX_TICKERS = 10;
const REFRESH_INTERVAL_MS = 60_000; // WS ticks handle real-time; REST is fallback
const STORAGE_KEY = "watchlist_tickers";

// ---------------------------------------------------------------------------
// Sparkline — 7 data points, SVG micro-chart
// ---------------------------------------------------------------------------
function MiniSparkline({ data, positive }: { data: number[]; positive: boolean }) {
  if (data.length < 2) {
    return <div className="w-16 h-6 opacity-30 text-xs text-slate-500 flex items-center">—</div>;
  }

  const w = 64;
  const h = 24;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const pathD = `M ${pts.join(" L ")}`;
  const areaD = `M ${pts[0]} L ${pts.join(" L ")} L ${w},${h} L 0,${h} Z`;
  const color = positive ? "#00FF88" : "#FF0080";
  const gradId = `wl-grad-${positive ? "g" : "r"}`;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible flex-shrink-0">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#${gradId})`} />
      <path d={pathD} stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle
        cx={pts[pts.length - 1].split(",")[0]}
        cy={pts[pts.length - 1].split(",")[1]}
        r="2"
        fill={color}
        style={{ filter: `drop-shadow(0 0 3px ${color})` }}
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Individual row
// ---------------------------------------------------------------------------
function WatchlistRow({
  entry,
  onRemove,
}: {
  entry: WatchlistEntry;
  onRemove: (ticker: string) => void;
}) {
  const positive = (entry.change_pct ?? 0) >= 0;
  const color = positive ? "#00FF88" : "#FF0080";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -16 }}
      transition={{ duration: 0.2 }}
      className="group flex items-center gap-2 px-3 py-2 rounded-lg transition-colors"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.06)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.03)";
      }}
    >
      {/* Ticker badge */}
      <div
        className="w-10 h-7 rounded flex items-center justify-center text-xs font-bold flex-shrink-0"
        style={{ background: `${color}15`, color }}
      >
        {entry.ticker.length > 4 ? entry.ticker.slice(0, 3) : entry.ticker}
      </div>

      {/* Ticker name */}
      <span className="text-xs font-semibold text-slate-300 w-16 truncate flex-shrink-0">
        {entry.ticker}
      </span>

      {/* Price */}
      <div className="flex-1 min-w-0">
        {entry.error || entry.price === null ? (
          <span className="text-xs text-slate-600">N/A</span>
        ) : (
          <span className="text-xs font-mono font-bold text-slate-200">
            {entry.price >= 1000
              ? `$${entry.price.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
              : `$${entry.price.toFixed(2)}`}
          </span>
        )}
      </div>

      {/* Change % */}
      <div className="w-14 text-right flex-shrink-0">
        {entry.change_pct === null ? (
          <span className="text-xs text-slate-600">—</span>
        ) : (
          <span
            className="text-xs font-mono font-bold"
            style={{ color, textShadow: `0 0 6px ${color}40` }}
          >
            {positive ? "+" : ""}
            {entry.change_pct.toFixed(2)}%
          </span>
        )}
      </div>

      {/* Sparkline */}
      <MiniSparkline data={entry.history} positive={positive} />

      {/* Remove button — only visible on hover */}
      <button
        onClick={() => onRemove(entry.ticker)}
        className="opacity-0 group-hover:opacity-100 transition-opacity ml-1 flex-shrink-0 w-5 h-5 flex items-center justify-center rounded"
        style={{ color: "#FF0080" }}
        title={`Remove ${entry.ticker}`}
      >
        <X className="w-3 h-3" />
      </button>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Main Watchlist component
// ---------------------------------------------------------------------------
export function Watchlist() {
  const [tickers, setTickers] = useState<string[]>(DEFAULT_TICKERS);
  const [entries, setEntries] = useState<WatchlistEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [showInput, setShowInput] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const storePrices = useTradingStore((s) => s.prices);

  // Apply live store price updates (fed by PricesProvider via WS) to entries
  useEffect(() => {
    if (Object.keys(storePrices).length === 0) return;
    setEntries((prev) =>
      prev.map((e) => {
        const tick = storePrices[e.ticker];
        if (!tick) return e;
        return {
          ...e,
          price: tick.price,
          change_pct: tick.change_pct,
          history: [...e.history.slice(-29), tick.price],
          error: false,
        };
      })
    );
    setLastUpdated(new Date());
  }, [storePrices]);

  // Load tickers from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as string[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setTickers(parsed.slice(0, MAX_TICKERS));
        }
      }
    } catch {
      // ignore parse errors — keep defaults
    }
  }, []);

  // Persist tickers to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tickers));
    } catch {
      // ignore storage errors
    }
  }, [tickers]);

  // Focus input when shown
  useEffect(() => {
    if (showInput) inputRef.current?.focus();
  }, [showInput]);

  // Fetch prices from backend
  const fetchPrices = useCallback(async (tickerList: string[]) => {
    if (tickerList.length === 0) {
      setEntries([]);
      return;
    }
    setLoading(true);
    try {
      const data = await api.portfolio.prices(tickerList);

      const updated: WatchlistEntry[] = tickerList.map((t) => {
        const row = data[t];
        if (!row) {
          return { ticker: t, price: null, change_pct: null, history: [], error: true };
        }
        return {
          ticker: t,
          price: row.price,
          change_pct: row.change_pct,
          history: row.history ?? [],
          error: !!row.error,
        };
      });

      setEntries(updated);
      setLastUpdated(new Date());
    } catch {
      // Graceful degradation — keep previous entries, mark all as error
      setEntries((prev) =>
        prev.length > 0
          ? prev.map((e) => ({ ...e, error: true }))
          : tickerList.map((t) => ({ ticker: t, price: null, change_pct: null, history: [], error: true }))
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch + 30s auto-refresh
  useEffect(() => {
    fetchPrices(tickers);

    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => fetchPrices(tickers), REFRESH_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [tickers, fetchPrices]);

  // Add ticker
  const handleAddTicker = () => {
    const ticker = inputValue.trim().toUpperCase();
    if (!ticker) return;
    if (tickers.includes(ticker)) {
      setInputValue("");
      setShowInput(false);
      return;
    }
    if (tickers.length >= MAX_TICKERS) return;
    setTickers((prev) => [...prev, ticker]);
    setInputValue("");
    setShowInput(false);
  };

  // Remove ticker
  const handleRemove = (ticker: string) => {
    setTickers((prev) => prev.filter((t) => t !== ticker));
    setEntries((prev) => prev.filter((e) => e.ticker !== ticker));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleAddTicker();
    if (e.key === "Escape") {
      setShowInput(false);
      setInputValue("");
    }
  };

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: "linear-gradient(135deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))",
        border: "1px solid rgba(0,212,255,0.2)",
        backdropFilter: "blur(20px)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4" style={{ color: "#00D4FF" }} />
          <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "#00D4FF" }}>
            Watchlist
          </span>
          <span
            className="text-xs px-1.5 py-0.5 rounded font-mono"
            style={{ background: "rgba(0,212,255,0.1)", color: "#00D4FF", border: "1px solid rgba(0,212,255,0.25)" }}
          >
            {tickers.length}/{MAX_TICKERS}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Last updated */}
          {lastUpdated && (
            <span className="text-xs text-slate-600 font-mono hidden sm:block">
              {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          )}

          {/* Refresh */}
          <button
            onClick={() => fetchPrices(tickers)}
            disabled={loading}
            className="p-1.5 rounded transition-opacity disabled:opacity-40"
            style={{ color: "#00D4FF" }}
            title="Refresh now"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>

          {/* Add ticker */}
          {tickers.length < MAX_TICKERS && (
            <button
              onClick={() => setShowInput((v) => !v)}
              className="p-1.5 rounded transition-colors"
              style={{
                background: showInput ? "rgba(0,212,255,0.15)" : "transparent",
                color: "#00D4FF",
                border: "1px solid rgba(0,212,255,0.3)",
              }}
              title="Add ticker"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Add-ticker input */}
      <AnimatePresence>
        {showInput && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="px-4 py-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value.toUpperCase())}
                  onKeyDown={handleKeyDown}
                  placeholder="TICKER (e.g. AMZN)"
                  maxLength={10}
                  className="flex-1 bg-transparent text-xs font-mono text-slate-200 outline-none px-2 py-1.5 rounded"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(0,212,255,0.3)",
                    color: "#E2E8F0",
                  }}
                />
                <button
                  onClick={handleAddTicker}
                  className="px-3 py-1.5 rounded text-xs font-semibold"
                  style={{
                    background: "rgba(0,212,255,0.15)",
                    border: "1px solid rgba(0,212,255,0.4)",
                    color: "#00D4FF",
                  }}
                >
                  Add
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Ticker rows */}
      <div className="px-2 py-2 space-y-1">
        {entries.length === 0 && loading && (
          <div className="text-center py-4 text-xs text-slate-600 animate-pulse">
            Loading prices...
          </div>
        )}
        <AnimatePresence mode="popLayout">
          {entries.map((entry) => (
            <WatchlistRow key={entry.ticker} entry={entry} onRemove={handleRemove} />
          ))}
        </AnimatePresence>
      </div>

      {/* Footer — refresh countdown */}
      <div
        className="px-4 py-2 text-xs text-slate-700 font-mono text-center"
        style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
      >
        Auto-refresh every 30s
      </div>
    </div>
  );
}
