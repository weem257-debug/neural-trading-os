"use client";

/**
 * Stock board — one list of symbols, two interchangeable presentations.
 *
 * "cards"  a responsive tile grid: big price, colour-coded change, sparkline.
 *          Stays readable down to a phone viewport, which the dense table
 *          cannot.
 * "table"  a sortable table whose change column is painted as a heatmap, so a
 *          30-symbol list can be scanned in one pass.
 *
 * The choice lives in prefsStore (persisted, SSR-guarded), so it follows the
 * user across pages and reloads instead of resetting on every navigation.
 *
 * Prices come from GET /api/portfolio/prices and are then kept current by the
 * WebSocket ticks that PricesProvider pushes into tradingStore — the REST poll
 * is only the fallback for symbols the socket isn't ticking.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowDown, ArrowUp, LayoutGrid, List, Plus, RefreshCw, X, Zap } from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useTradingStore } from "@/store/tradingStore";
import { usePrefsStore, useStockView } from "@/store/prefsStore";
import { Sparkline, SPARK_DOWN, SPARK_UP } from "@/components/charts/Sparkline";
import { AccentTone, toneColor } from "@/components/ui/AccentPanel";
import { SectionLabel } from "@/components/ui/GlassCard";

const REFRESH_INTERVAL_MS = 60_000;

export interface StockEntry {
  ticker: string;
  price: number | null;
  change_pct: number | null;
  history: number[];
  error?: boolean;
}

type SortKey = "ticker" | "price" | "change";
type SortDir = "asc" | "desc";

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */
function fmtPrice(v: number | null): string {
  if (v === null || Number.isNaN(v)) return "—";
  return v >= 1000
    ? `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
    : `$${v.toFixed(2)}`;
}

function fmtChange(v: number | null): string {
  if (v === null || Number.isNaN(v)) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

/**
 * Background tint for the heatmap cell. Alpha saturates at ±5 % so a single
 * runaway mover can't wash out the rest of the column — beyond that the cell
 * is already unmistakably "strong", and keeping the ceiling low preserves the
 * contrast between +1 % and +3 %.
 */
function heatColor(change: number | null): string {
  if (change === null || Number.isNaN(change)) return "transparent";
  const magnitude = Math.min(Math.abs(change), 5) / 5;
  const alpha = 0.06 + magnitude * 0.26;
  return change >= 0 ? `rgba(63,185,80,${alpha.toFixed(3)})` : `rgba(229,83,75,${alpha.toFixed(3)})`;
}

/* ------------------------------------------------------------------ */
/* View toggle                                                         */
/* ------------------------------------------------------------------ */
function ViewToggle() {
  const view = useStockView();
  const setStockView = usePrefsStore((s) => s.setStockView);

  const options: Array<{ id: "cards" | "table"; icon: typeof LayoutGrid; label: string }> = [
    { id: "cards", icon: LayoutGrid, label: "Kachelansicht" },
    { id: "table", icon: List, label: "Tabellenansicht" },
  ];

  return (
    <div
      className="flex items-center gap-0.5 p-0.5 rounded-lg"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
      role="group"
      aria-label="Darstellung wählen"
    >
      {options.map(({ id, icon: Icon, label }) => {
        const active = view === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => setStockView(id)}
            aria-pressed={active}
            aria-label={label}
            title={label}
            className="p-1.5 rounded-md transition-colors"
            style={{
              background: active ? "rgba(76,141,246,0.18)" : "transparent",
              color: active ? "#4C8DF6" : "#64748B",
            }}
          >
            <Icon className="w-3.5 h-3.5" />
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Card view                                                           */
/* ------------------------------------------------------------------ */
function StockCard({
  entry,
  active,
  onSelect,
  onRemove,
}: {
  entry: StockEntry;
  active: boolean;
  onSelect?: (ticker: string) => void;
  onRemove?: (ticker: string) => void;
}) {
  const positive = (entry.change_pct ?? 0) >= 0;
  const tone: AccentTone = entry.change_pct === null ? "muted" : positive ? "positive" : "negative";
  const color = toneColor(tone);
  const selectable = !!onSelect;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.18 }}
      className="group relative rounded-lg overflow-hidden transition-colors"
      style={{
        background: active ? "var(--surface-hover)" : "var(--surface)",
        border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
      }}
    >
      {/* HKCM's signature: a thick bar down the left edge, coloured by the
          direction the numbers describe. */}
      <span
        aria-hidden="true"
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{ background: color }}
      />

      {selectable && (
        <button
          type="button"
          onClick={() => onSelect?.(entry.ticker)}
          aria-label={`${entry.ticker} im Chart anzeigen`}
          aria-current={active ? "true" : undefined}
          className="absolute inset-0 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
        />
      )}

      <div className="relative pointer-events-none pl-4 pr-3 py-3">
        {/* Ticker sits in the label position — light and small; the price is
            the bold value under it. Same weight contrast as the newsletter's
            "Bezeichnung: Wert" rows. */}
        <p
          className="text-xs font-semibold uppercase tracking-wider truncate"
          style={{ color: "var(--text-muted)" }}
        >
          {entry.ticker}
        </p>

        <div className="flex items-baseline justify-between gap-2 mt-1">
          <p className="text-xl font-bold font-mono leading-none" style={{ color: "var(--foreground)" }}>
            {entry.error ? "N/A" : fmtPrice(entry.price)}
          </p>
          <span className="text-sm font-bold font-mono" style={{ color }}>
            {fmtChange(entry.change_pct)}
          </span>
        </div>

        <Sparkline
          data={entry.history}
          positive={positive}
          width={140}
          height={32}
          className="w-full mt-2"
        />
      </div>

      {/* Actions — revealed on hover/focus, above the full-tile select button */}
      <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
        <Link
          href={`/signals?ticker=${encodeURIComponent(entry.ticker)}`}
          className="w-5 h-5 flex items-center justify-center rounded"
          style={{ color: "var(--violet)", background: "var(--base)" }}
          title={`${entry.ticker} analysieren`}
          aria-label={`${entry.ticker} analysieren`}
        >
          <Zap className="w-3 h-3" />
        </Link>
        {onRemove && (
          <button
            type="button"
            onClick={() => onRemove(entry.ticker)}
            className="w-5 h-5 flex items-center justify-center rounded"
            style={{ color: "var(--negative)", background: "var(--base)" }}
            title={`${entry.ticker} entfernen`}
            aria-label={`${entry.ticker} entfernen`}
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Table view                                                          */
/* ------------------------------------------------------------------ */
function StockTable({
  entries,
  activeSymbol,
  sortKey,
  sortDir,
  onSort,
  onSelect,
  onRemove,
}: {
  entries: StockEntry[];
  activeSymbol?: string;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
  onSelect?: (ticker: string) => void;
  onRemove?: (ticker: string) => void;
}) {
  const header = (key: SortKey, label: string, align: "left" | "right") => {
    const active = sortKey === key;
    return (
      <th
        scope="col"
        className={`px-3 py-2 text-xs font-semibold uppercase tracking-wider ${align === "right" ? "text-right" : "text-left"}`}
        aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
      >
        <button
          type="button"
          onClick={() => onSort(key)}
          className={`inline-flex items-center gap-1 transition-colors ${align === "right" ? "flex-row-reverse" : ""}`}
          style={{ color: active ? "#4C8DF6" : "#64748B" }}
        >
          {label}
          {active &&
            (sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
        </button>
      </th>
    );
  };

  return (
    // Wide tables scroll inside their own box so the page body never scrolls
    // sideways on a phone.
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse">
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            {header("ticker", "Symbol", "left")}
            {header("price", "Kurs", "right")}
            {header("change", "Änderung", "right")}
            <th scope="col" className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-right" style={{ color: "#64748B" }}>
              Verlauf
            </th>
            <th scope="col" className="px-3 py-2 w-16">
              <span className="sr-only">Aktionen</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const positive = (entry.change_pct ?? 0) >= 0;
            const active = entry.ticker === activeSymbol;
            return (
              <tr
                key={entry.ticker}
                className="group transition-colors"
                style={{
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                  background: active ? "rgba(76,141,246,0.08)" : "transparent",
                }}
              >
                <td className="px-3 py-2">
                  {onSelect ? (
                    <button
                      type="button"
                      onClick={() => onSelect(entry.ticker)}
                      aria-current={active ? "true" : undefined}
                      className="text-xs font-bold font-mono text-slate-200 hover:text-cyan-400 transition-colors"
                    >
                      {entry.ticker}
                    </button>
                  ) : (
                    <span className="text-xs font-bold font-mono text-slate-200">{entry.ticker}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right text-xs font-mono font-bold text-slate-200">
                  {entry.error ? <span className="text-slate-600">N/A</span> : fmtPrice(entry.price)}
                </td>
                <td className="px-3 py-2 text-right">
                  <span
                    className="inline-block w-full text-xs font-mono font-bold px-2 py-1 rounded"
                    style={{
                      background: heatColor(entry.change_pct),
                      color: entry.change_pct === null ? "#64748B" : positive ? SPARK_UP : SPARK_DOWN,
                    }}
                  >
                    {fmtChange(entry.change_pct)}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-end">
                    <Sparkline data={entry.history} positive={positive} width={72} height={22} strokeWidth={1.25} showDot={false} />
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                    <Link
                      href={`/signals?ticker=${encodeURIComponent(entry.ticker)}`}
                      className="w-5 h-5 flex items-center justify-center rounded"
                      style={{ color: "#A371F7" }}
                      title={`${entry.ticker} analysieren`}
                      aria-label={`${entry.ticker} analysieren`}
                    >
                      <Zap className="w-3 h-3" />
                    </Link>
                    {onRemove && (
                      <button
                        type="button"
                        onClick={() => onRemove(entry.ticker)}
                        className="w-5 h-5 flex items-center justify-center rounded"
                        style={{ color: SPARK_DOWN }}
                        title={`${entry.ticker} entfernen`}
                        aria-label={`${entry.ticker} entfernen`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main board                                                          */
/* ------------------------------------------------------------------ */
export function StockBoard({
  symbols,
  activeSymbol,
  onSelect,
  onAdd,
  onRemove,
  maxSymbols,
  title = "Aktien",
}: {
  symbols: string[];
  activeSymbol?: string;
  onSelect?: (ticker: string) => void;
  onAdd?: (ticker: string) => void;
  onRemove?: (ticker: string) => void;
  maxSymbols?: number;
  title?: string;
}) {
  const view = useStockView();
  const [entries, setEntries] = useState<StockEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("change");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [showInput, setShowInput] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const storePrices = useTradingStore((s) => s.prices);

  const fetchPrices = useCallback(async (list: string[]) => {
    if (list.length === 0) {
      setEntries([]);
      return;
    }
    setLoading(true);
    try {
      const data = await api.portfolio.prices(list);
      setEntries(
        list.map((t) => {
          const row = data[t];
          if (!row) return { ticker: t, price: null, change_pct: null, history: [], error: true };
          return {
            ticker: t,
            price: row.price,
            change_pct: row.change_pct,
            history: row.history ?? [],
            error: !!row.error,
          };
        })
      );
      setLastUpdated(new Date());
    } catch {
      // Keep whatever we already showed; only flag it as stale.
      setEntries((prev) =>
        prev.length > 0
          ? prev.map((e) => ({ ...e, error: true }))
          : list.map((t) => ({ ticker: t, price: null, change_pct: null, history: [], error: true }))
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // `symbols` is typically a fresh array on every parent render, so the effect
  // keys off its content instead of its identity — otherwise the interval is
  // torn down and rebuilt on each render and the REST poll never fires.
  const symbolKey = symbols.join(",");
  useEffect(() => {
    const list = symbolKey ? symbolKey.split(",") : [];
    fetchPrices(list);
    const id = setInterval(() => fetchPrices(list), REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [symbolKey, fetchPrices]);

  // Live WS ticks overwrite the polled values for the symbols they cover.
  useEffect(() => {
    if (Object.keys(storePrices).length === 0) return;
    setEntries((prev) => {
      let touched = false;
      const next = prev.map((e) => {
        const tick = storePrices[e.ticker];
        if (!tick) return e;
        touched = true;
        return {
          ...e,
          price: tick.price,
          change_pct: tick.change_pct,
          history: [...e.history.slice(-29), tick.price],
          error: false,
        };
      });
      return touched ? next : prev;
    });
  }, [storePrices]);

  useEffect(() => {
    if (showInput) inputRef.current?.focus();
  }, [showInput]);

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    // null sorts last in both directions — an unavailable price is never the
    // most interesting row.
    const num = (v: number | null) => (v === null || Number.isNaN(v) ? null : v);
    return [...entries].sort((a, b) => {
      if (sortKey === "ticker") return a.ticker.localeCompare(b.ticker) * dir;
      const av = num(sortKey === "price" ? a.price : a.change_pct);
      const bv = num(sortKey === "price" ? b.price : b.change_pct);
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return (av - bv) * dir;
    });
  }, [entries, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "ticker" ? "asc" : "desc");
    }
  };

  const handleAdd = () => {
    const ticker = inputValue.trim().toUpperCase();
    setInputValue("");
    setShowInput(false);
    if (!ticker || symbols.includes(ticker)) return;
    if (maxSymbols !== undefined && symbols.length >= maxSymbols) return;
    onAdd?.(ticker);
  };

  const atLimit = maxSymbols !== undefined && symbols.length >= maxSymbols;

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: "linear-gradient(135deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))",
        border: "1px solid rgba(76,141,246,0.2)",
        backdropFilter: "blur(20px)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between gap-3 px-4 py-3 flex-wrap"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className="flex items-center gap-2">
          <SectionLabel>{title}</SectionLabel>
          <span
            className="text-xs px-1.5 py-0.5 rounded font-mono"
            style={{ background: "rgba(76,141,246,0.1)", color: "#4C8DF6", border: "1px solid rgba(76,141,246,0.25)" }}
          >
            {maxSymbols !== undefined ? `${symbols.length}/${maxSymbols}` : symbols.length}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {lastUpdated && (
            <span className="text-xs text-slate-600 font-mono hidden sm:block">
              {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          )}
          <ViewToggle />
          <button
            type="button"
            onClick={() => fetchPrices(symbols)}
            disabled={loading}
            className="p-1.5 rounded transition-opacity disabled:opacity-40"
            style={{ color: "#4C8DF6" }}
            title="Jetzt aktualisieren"
            aria-label="Kurse jetzt aktualisieren"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
          {onAdd && !atLimit && (
            <button
              type="button"
              onClick={() => setShowInput((v) => !v)}
              className="p-1.5 rounded transition-colors"
              style={{
                background: showInput ? "rgba(76,141,246,0.15)" : "transparent",
                color: "#4C8DF6",
                border: "1px solid rgba(76,141,246,0.3)",
              }}
              title="Symbol hinzufügen"
              aria-label="Symbol hinzufügen"
              aria-expanded={showInput}
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Add input */}
      <AnimatePresence>
        {showInput && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="px-4 py-2 flex gap-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAdd();
                  if (e.key === "Escape") {
                    setShowInput(false);
                    setInputValue("");
                  }
                }}
                placeholder="SYMBOL (z.B. AMZN, SAP.DE, BTC-USD)"
                maxLength={12}
                aria-label="Symbol hinzufügen"
                className="flex-1 text-xs font-mono outline-none px-2 py-1.5 rounded"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(76,141,246,0.3)",
                  color: "#E2E8F0",
                }}
              />
              <button
                type="button"
                onClick={handleAdd}
                className="px-3 py-1.5 rounded text-xs font-semibold"
                style={{ background: "rgba(76,141,246,0.15)", border: "1px solid rgba(76,141,246,0.4)", color: "#4C8DF6" }}
              >
                Hinzufügen
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Body */}
      <div className={view === "cards" ? "p-3" : "py-1"}>
        {entries.length === 0 ? (
          <p className="text-center py-6 text-xs text-slate-600">
            {loading ? "Kurse werden geladen …" : "Keine Symbole. Füge eines hinzu, um zu starten."}
          </p>
        ) : view === "cards" ? (
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <AnimatePresence mode="popLayout">
              {sorted.map((entry) => (
                <StockCard
                  key={entry.ticker}
                  entry={entry}
                  active={entry.ticker === activeSymbol}
                  onSelect={onSelect}
                  onRemove={onRemove}
                />
              ))}
            </AnimatePresence>
          </div>
        ) : (
          <StockTable
            entries={sorted}
            activeSymbol={activeSymbol}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
            onSelect={onSelect}
            onRemove={onRemove}
          />
        )}
      </div>
    </div>
  );
}
