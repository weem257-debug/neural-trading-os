"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";
import { useTradingStore } from "@/store/tradingStore";
import type { OrderResponse, AnyOrder } from "@/types";
import {
  Zap, AlertTriangle, Loader2, CheckCircle,
  TrendingUp, TrendingDown, ChevronDown, Clock,
  Shield, BookOpen, Activity,
} from "lucide-react";
import { GlassCard, SectionLabel, NeonBadge } from "@/components/ui/GlassCard";
import { ExplanationModal, InfoButton } from "@/components/ui/ExplanationModal";
import type { ExplanationContent } from "@/components/ui/ExplanationModal";

/* ---- Order book helpers ---- */
interface BookRow { price: number; size: number; total: number }

function buildOrderBook(mid: number, levels = 5): { asks: BookRow[]; bids: BookRow[] } {
  const tick = mid >= 1000 ? 1.0 : mid >= 100 ? 0.05 : 0.01;
  const asks: BookRow[] = [];
  const bids: BookRow[] = [];
  let askTotal = 0;
  let bidTotal = 0;
  // Seed sizes with a deterministic but varying pattern based on price
  const seed = Math.abs(Math.sin(mid * 137.5)) * 1000;
  for (let i = 0; i < levels; i++) {
    const askSize = Math.round(500 + (seed * (i + 1) * 0.37) % 2000);
    const bidSize = Math.round(400 + (seed * (i + 1) * 0.53) % 2200);
    askTotal += askSize;
    bidTotal += bidSize;
    asks.push({ price: mid + tick * (i + 1), size: askSize, total: askTotal });
    bids.push({ price: mid - tick * (i + 1), size: bidSize, total: bidTotal });
  }
  return { asks, bids };
}

/* ---- Order book component ---- */
function OrderBook({ ticker }: { ticker: string }) {
  const storePrices = useTradingStore((s) => s.prices);

  // Use live WS price when available; fall back to a sensible demo default
  const FALLBACK_PRICES: Record<string, number> = {
    AAPL: 189.43, MSFT: 415.80, NVDA: 875.20, TSLA: 248.75, "BTC-USD": 67420, BTC: 67420,
    AMZN: 198.12, GOOGL: 174.55, META: 562.30, AMD: 168.45, NFLX: 625.10, SPY: 578.90,
  };
  const liveEntry = storePrices[ticker];
  const mid = liveEntry?.price ?? FALLBACK_PRICES[ticker] ?? 100;

  const { asks, bids } = buildOrderBook(mid);
  const maxTotal = Math.max(...[...asks, ...bids].map((r) => r.total));
  const spread = (asks[0].price - bids[0].price);
  const spreadPct = ((spread / mid) * 100).toFixed(3);

  const priceStr = mid >= 1000
    ? mid.toLocaleString("en-US", { maximumFractionDigits: 0 })
    : mid.toFixed(2);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <SectionLabel>Order Book — {ticker}</SectionLabel>
        <span className="text-xs text-slate-500">
          Spread: <span className="font-mono text-slate-300">${spread.toFixed(2)}</span>
          <span className="text-slate-600 ml-1">({spreadPct}%)</span>
        </span>
      </div>

      {/* Asks (sell side) */}
      <div className="space-y-1 mb-2">
        {[...asks].reverse().map((row) => (
          <div key={row.price} className="relative flex items-center justify-between text-xs py-1 px-2 rounded overflow-hidden">
            <div
              className="absolute left-0 top-0 bottom-0"
              style={{ width: `${(row.total / maxTotal) * 100}%`, background: "rgba(255,0,128,0.08)" }}
            />
            <span className="font-mono font-bold relative" style={{ color: "#FF0080" }}>${row.price.toFixed(2)}</span>
            <span className="font-mono text-slate-400 relative">{row.size.toLocaleString()}</span>
            <span className="font-mono text-slate-600 relative">{row.total.toLocaleString()}</span>
          </div>
        ))}
      </div>

      {/* Last price / spread line */}
      <div className="flex items-center gap-2 py-2 px-2" style={{ borderTop: "1px solid rgba(255,255,255,0.06)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <Activity className="w-3.5 h-3.5 text-neon-green" />
        <span className="text-sm font-bold font-mono" style={{ color: "#00FF88" }}>${priceStr}</span>
        <NeonBadge color="green">{liveEntry ? "LIVE" : "DEMO"}</NeonBadge>
      </div>

      {/* Bids (buy side) */}
      <div className="space-y-1 mt-2">
        {bids.map((row) => (
          <div key={row.price} className="relative flex items-center justify-between text-xs py-1 px-2 rounded overflow-hidden">
            <div
              className="absolute left-0 top-0 bottom-0"
              style={{ width: `${(row.total / maxTotal) * 100}%`, background: "rgba(0,255,136,0.08)" }}
            />
            <span className="font-mono font-bold relative" style={{ color: "#00FF88" }}>${row.price.toFixed(2)}</span>
            <span className="font-mono text-slate-400 relative">{row.size.toLocaleString()}</span>
            <span className="font-mono text-slate-600 relative">{row.total.toLocaleString()}</span>
          </div>
        ))}
      </div>

      <div className="flex justify-between text-xs text-slate-600 mt-2 px-2">
        <span>Price</span><span>Size</span><span>Total</span>
      </div>
    </div>
  );
}

/* ---- Quantity slider ---- */
function QuantitySlider({ value, onChange, max = 100 }: { value: number; onChange: (v: number) => void; max?: number }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs text-slate-500">
        <span>Position Size</span>
        <span className="font-mono font-bold text-slate-300">{value} units ({pct.toFixed(0)}%)</span>
      </div>
      <div className="relative">
        <input
          type="range"
          min={0.0001}
          max={max}
          step={0.0001}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="w-full h-2 rounded-full appearance-none cursor-pointer"
          style={{
            background: `linear-gradient(90deg, #00D4FF ${pct}%, rgba(255,255,255,0.08) ${pct}%)`,
            accentColor: "#00D4FF",
          }}
        />
      </div>
      <div className="flex gap-2">
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <button
            key={f}
            onClick={() => onChange(Math.round(max * f * 10000) / 10000)}
            className="flex-1 py-1 rounded-lg text-xs font-semibold transition-all"
            style={{
              background: pct / 100 === f ? "rgba(0,212,255,0.15)" : "rgba(255,255,255,0.04)",
              border: pct / 100 === f ? "1px solid rgba(0,212,255,0.4)" : "1px solid rgba(255,255,255,0.08)",
              color: pct / 100 === f ? "#00D4FF" : "#64748B",
            }}
          >
            {(f * 100).toFixed(0)}%
          </button>
        ))}
      </div>
    </div>
  );
}

/* ============================================================ */
const EXPLAIN_EXECUTION: ExplanationContent = {
  title: "Order Execution",
  subtitle: "Paper Trading · nautilus_trader Engine",
  color: "green",
  theory:
    "Das Execution-System nutzt nautilus_trader — eine hochperformante Python-Trading-Engine mit Unterstützung für 15+ Broker. " +
    "Im Paper-Modus werden Orders simuliert ohne echtes Kapital einzusetzen. " +
    "Market Orders werden sofort zum aktuellen Preis ausgeführt; Limit Orders nur wenn der Marktpreis das Limit erreicht.",
  keyPoints: [
    "Market Order: Sofortausführung zum besten verfügbaren Preis — kein Preisgarantie",
    "Limit Order: Ausführung nur wenn Preis ≤ Limit (Buy) oder ≥ Limit (Sell)",
    "Stop Order: Wird Market Order sobald Stop-Preis erreicht — für Stop-Loss",
    "Stop-Limit: Kombination — erst Stop triggert, dann Limit-Order",
    "Paper Trading: Kein echtes Kapital — sicher zum Testen von Strategien",
    "Live Trading: Erfordert Broker-API-Key (Alpaca, Interactive Brokers, etc.)",
  ],
  practicalTip:
    "Für neue Strategien immer im Paper-Modus starten. " +
    "Niemals Market Orders bei illiquiden Assets — Slippage kann erheblich sein. " +
    "Stop-Loss bei jeder Position setzen: typisch 2–5% unter Einstieg für Swing Trades.",
};

export default function ExecutionPage() {
  const [mode, setMode] = useState<{ mode?: "paper" | "live"; live_trading_config?: boolean }>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [explainOpen, setExplainOpen] = useState(false);
  const [form, setForm] = useState({
    ticker: "AAPL",
    side: "buy" as "buy" | "sell",
    quantity: 10,
    order_type: "market" as "market" | "limit",
    limit_price: "",
    note: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [lastOrder, setLastOrder] = useState<OrderResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { recentOrders, addOrder, setRecentOrders } = useTradingStore();

  useEffect(() => {
    // Load execution mode and order history in parallel
    api.execution.mode().then(setMode).catch(() => {});
    api.execution.orders()
      .then((orders) => setRecentOrders(orders))
      .catch(() => {});
  }, [setRecentOrders]);

  async function handleOrder() {
    setSubmitting(true);
    setError(null);
    setLastOrder(null);
    setConfirmOpen(false);
    try {
      const req = {
        ticker: form.ticker.toUpperCase(),
        side: form.side,
        quantity: form.quantity,
        order_type: form.order_type,
        ...(form.order_type === "limit" && form.limit_price
          ? { limit_price: parseFloat(form.limit_price) }
          : {}),
        note: form.note || undefined,
      };
      const order = await api.execution.submitOrder(req);
      setLastOrder(order);
      addOrder(order);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Order failed");
    } finally {
      setSubmitting(false);
    }
  }

  const isLive = mode.mode === "live";
  const buyColor = "#00FF88";
  const sellColor = "#FF0080";
  const activeColor = form.side === "buy" ? buyColor : sellColor;

  return (
    <div className="space-y-5">
      {/* Header */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <div className="flex items-center gap-3 mb-1">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: `${activeColor}15`, border: `1px solid ${activeColor}30` }}
          >
            <Zap className="w-4 h-4" style={{ color: activeColor }} />
          </div>
          <h1 className="text-2xl font-bold text-slate-100">Execution</h1>
          <NeonBadge color={isLive ? "pink" : "cyan"}>
            {isLive ? "LIVE" : "PAPER"}
          </NeonBadge>
        </div>
        <p className="text-sm text-slate-500">
          Nautilus Trader · {isLive ? "Real funds at risk" : "Simulated trading mode"}
        </p>
      </motion.div>

      {/* Mode Banner */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl p-4 flex items-center gap-3"
        style={{
          background: isLive ? "rgba(255,0,128,0.08)" : "rgba(0,212,255,0.08)",
          border: `1px solid ${isLive ? "rgba(255,0,128,0.35)" : "rgba(0,212,255,0.35)"}`,
          boxShadow: `0 0 20px ${isLive ? "rgba(255,0,128,0.1)" : "rgba(0,212,255,0.1)"}`,
        }}
      >
        {isLive ? (
          <AlertTriangle className="w-5 h-5 flex-shrink-0" style={{ color: "#FF0080" }} />
        ) : (
          <Shield className="w-5 h-5 flex-shrink-0" style={{ color: "#00D4FF" }} />
        )}
        <div>
          <p className="font-bold text-sm" style={{ color: isLive ? "#FF0080" : "#00D4FF" }}>
            {isLive ? "LIVE TRADING — Real Capital at Risk" : "Paper Trading Mode — Simulation Active"}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {isLive
              ? "All orders execute with real funds. Use with caution."
              : "All orders are simulated. Set ENABLE_LIVE_TRADING=true to go live."}
          </p>
        </div>
        {isLive && (
          <div className="ml-auto text-xs font-bold px-3 py-1.5 rounded-lg animate-pulse"
            style={{ background: "rgba(255,0,128,0.15)", color: "#FF0080", border: "1px solid rgba(255,0,128,0.4)" }}>
            SIMULATION OFF
          </div>
        )}
      </motion.div>

      <div className="grid grid-cols-12 gap-4">
        {/* Order Form — 7 cols */}
        <div className="col-span-7">
          <GlassCard
            variant={form.side === "buy" ? "green" : "pink"}
            delay={0.1}
          >
            <div className="flex items-center justify-between">
              <SectionLabel>Order Ticket</SectionLabel>
              <InfoButton onClick={() => setExplainOpen(true)} color="green" className="-mt-2" />
            </div>

            {/* Buy / Sell toggle */}
            <div className="flex gap-2 mt-3 mb-4">
              {(["buy", "sell"] as const).map((s) => {
                const c = s === "buy" ? buyColor : sellColor;
                const active = form.side === s;
                return (
                  <button
                    key={s}
                    onClick={() => setForm((f) => ({ ...f, side: s }))}
                    className="flex-1 py-3 rounded-xl text-sm font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2"
                    style={{
                      background: active ? `${c}20` : "rgba(255,255,255,0.04)",
                      border: `1px solid ${active ? c : "rgba(255,255,255,0.08)"}`,
                      color: active ? c : "#334155",
                      boxShadow: active ? `0 0 20px ${c}30` : "none",
                    }}
                  >
                    {s === "buy" ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                    {s.toUpperCase()}
                  </button>
                );
              })}
            </div>

            {/* Ticker + order type row */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="text-xs text-slate-500 mb-1.5 block">Ticker Symbol</label>
                <input
                  value={form.ticker}
                  onChange={(e) => setForm((f) => ({ ...f, ticker: e.target.value.toUpperCase() }))}
                  className="w-full rounded-xl px-4 py-2.5 text-sm font-mono text-slate-200 outline-none uppercase"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: `1px solid ${activeColor}25`,
                  }}
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1.5 block">Order Type</label>
                <div className="relative">
                  <select
                    value={form.order_type}
                    onChange={(e) => setForm((f) => ({ ...f, order_type: e.target.value as "market" | "limit" }))}
                    className="w-full rounded-xl px-4 py-2.5 text-sm text-slate-200 outline-none appearance-none cursor-pointer"
                    style={{
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    <option value="market" style={{ background: "#0D1117" }}>Market</option>
                    <option value="limit"  style={{ background: "#0D1117" }}>Limit</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Limit price if needed */}
            {form.order_type === "limit" && (
              <div className="mb-4">
                <label className="text-xs text-slate-500 mb-1.5 block">Limit Price ($)</label>
                <input
                  type="number"
                  value={form.limit_price}
                  onChange={(e) => setForm((f) => ({ ...f, limit_price: e.target.value }))}
                  placeholder="0.00"
                  className="w-full rounded-xl px-4 py-2.5 text-sm font-mono text-slate-200 outline-none"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                />
              </div>
            )}

            {/* Quantity Slider */}
            <div className="mb-4">
              <QuantitySlider
                value={form.quantity}
                onChange={(v) => setForm((f) => ({ ...f, quantity: v }))}
                max={100}
              />
            </div>

            {/* Note */}
            <div className="mb-4">
              <label className="text-xs text-slate-500 mb-1.5 block">Note (optional)</label>
              <input
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="Signal from: NVDA technical breakout..."
                className="w-full rounded-xl px-4 py-2.5 text-sm text-slate-300 outline-none placeholder-slate-700"
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.07)",
                }}
              />
            </div>

            {/* Order summary */}
            <div
              className="rounded-xl p-3 mb-4 space-y-2"
              style={{ background: `${activeColor}06`, border: `1px solid ${activeColor}15` }}
            >
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Order Summary</p>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div><p className="text-xs text-slate-600">Ticker</p><p className="font-mono font-bold text-slate-200">{form.ticker}</p></div>
                <div><p className="text-xs text-slate-600">Qty</p><p className="font-mono font-bold text-slate-200">{form.quantity}</p></div>
                <div><p className="text-xs text-slate-600">Type</p><p className="font-mono font-bold text-slate-200">{form.order_type.toUpperCase()}</p></div>
              </div>
            </div>

            {/* Submit — always shows confirmation dialog (paper or live) */}
            <button
              onClick={() => setConfirmOpen(true)}
              disabled={submitting}
              className="w-full py-3.5 rounded-xl text-sm font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              style={{
                background: `linear-gradient(135deg, ${activeColor}25, ${activeColor}15)`,
                border: `1px solid ${activeColor}50`,
                color: activeColor,
                boxShadow: `0 0 25px ${activeColor}25`,
              }}
            >
              {submitting ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Submitting...</>
              ) : (
                <><Zap className="w-4 h-4" /> {form.side === "buy" ? "Buy" : "Sell"} {form.ticker}</>
              )}
            </button>

            {/* Success */}
            <AnimatePresence>
              {lastOrder && (() => {
                const rejected = lastOrder.status === "rejected";
                const color = rejected ? "#FF0080" : "#00FF88";
                const bg   = rejected ? "rgba(255,0,128,0.1)"  : "rgba(0,255,136,0.1)";
                const bdr  = rejected ? "rgba(255,0,128,0.3)"  : "rgba(0,255,136,0.3)";
                const Icon = rejected ? AlertTriangle : CheckCircle;
                return (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="mt-3 p-3 rounded-xl flex items-center gap-3"
                    style={{ background: bg, border: `1px solid ${bdr}` }}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" style={{ color }} />
                    <div className="text-sm">
                      <span className="font-bold capitalize" style={{ color }}>
                        Order {lastOrder.status}
                      </span>
                      <span className="text-slate-400 ml-2 font-mono">#{lastOrder.order_id.slice(0, 8)}</span>
                      {lastOrder.filled_price && !rejected && (
                        <span className="ml-2 font-mono" style={{ color }}>@ ${lastOrder.filled_price}</span>
                      )}
                      {rejected && lastOrder.reject_reason && (
                        <span className="ml-2 text-slate-400">— {lastOrder.reject_reason.replace(/_/g, " ")}</span>
                      )}
                    </div>
                  </motion.div>
                );
              })()}
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mt-3 p-3 rounded-xl flex items-center gap-2"
                  style={{ background: "rgba(255,0,128,0.1)", border: "1px solid rgba(255,0,128,0.3)" }}
                >
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: "#FF0080" }} />
                  <p className="text-sm" style={{ color: "#FF0080" }}>{error}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </GlassCard>
        </div>

        {/* Order Book + Recent — 5 cols */}
        <div className="col-span-5 space-y-4">
          <GlassCard delay={0.15}>
            <OrderBook ticker={form.ticker} />
          </GlassCard>

          <GlassCard delay={0.2}>
            <div className="flex items-center gap-2 mb-3">
              <BookOpen className="w-4 h-4 text-cyan-400" />
              <SectionLabel>Recent Orders ({recentOrders.length})</SectionLabel>
            </div>
            {!recentOrders.length ? (
              <p className="text-sm text-slate-600 text-center py-6">No orders placed yet</p>
            ) : (
              <div className="space-y-2">
                {recentOrders.slice(0, 10).map((o) => {
                  const c = o.side === "buy" ? "#00FF88" : "#FF0080";
                  const ts = "timestamp" in o ? o.timestamp : o.created_at;
                  const timeLabel = ts ? new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
                  return (
                    <div
                      key={o.order_id}
                      className="flex items-center justify-between p-2.5 rounded-xl text-sm"
                      style={{ background: `${c}06`, border: `1px solid ${c}15` }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-bold text-xs px-2 py-0.5 rounded font-mono flex-shrink-0" style={{ background: `${c}15`, color: c }}>
                          {o.side.toUpperCase()}
                        </span>
                        <span className="font-bold text-slate-200">{o.ticker}</span>
                        <span className="text-slate-500 text-xs">{o.quantity} × {o.order_type}</span>
                        {o.status === "rejected" && o.reject_reason && (
                          <span className="text-xs text-slate-600 truncate" title={o.reject_reason}>
                            ({o.reject_reason.replace(/_/g, " ")})
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {timeLabel && (
                          <span className="flex items-center gap-1 text-xs text-slate-600">
                            <Clock className="w-3 h-3" />{timeLabel}
                          </span>
                        )}
                        <span className="text-xs font-bold px-2 py-0.5 rounded"
                          style={{
                            background: o.status === "filled"
                              ? "rgba(0,255,136,0.1)"
                              : o.status === "rejected"
                                ? "rgba(255,0,128,0.1)"
                                : "rgba(100,116,139,0.1)",
                            color: o.status === "filled"
                              ? "#00FF88"
                              : o.status === "rejected"
                                ? "#FF0080"
                                : "#64748B",
                          }}
                        >
                          {o.status.toUpperCase()}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </GlassCard>
        </div>
      </div>

      {/* Order Confirmation Dialog — shown for both Paper and Live mode */}
      <AnimatePresence>
        {confirmOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(8px)" }}
            onClick={() => setConfirmOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="rounded-2xl p-6 max-w-sm w-full mx-4"
              style={{
                background: "rgba(8,11,20,0.98)",
                border: `1px solid ${isLive ? "rgba(255,0,128,0.5)" : "rgba(0,212,255,0.4)"}`,
                boxShadow: `0 0 40px ${isLive ? "rgba(255,0,128,0.2)" : "rgba(0,212,255,0.15)"}`,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <AlertTriangle className="w-6 h-6" style={{ color: isLive ? "#FF0080" : "#00D4FF" }} />
                <h3 className="text-lg font-bold" style={{ color: isLive ? "#FF0080" : "#00D4FF" }}>
                  {isLive ? "Confirm Live Order" : "Confirm Order"}
                </h3>
              </div>

              {/* Contextual confirmation message per spec: "Sicher? Buy 10x AAPL @ ~$189" */}
              <div
                className="rounded-xl p-4 mb-4"
                style={{
                  background: isLive ? "rgba(255,0,128,0.06)" : "rgba(0,212,255,0.06)",
                  border: `1px solid ${isLive ? "rgba(255,0,128,0.2)" : "rgba(0,212,255,0.2)"}`,
                }}
              >
                <p className="text-sm font-bold text-slate-200 font-mono">
                  {form.side === "buy" ? "Buy" : "Sell"} {form.quantity}x{" "}
                  <span style={{ color: isLive ? "#FF0080" : "#00D4FF" }}>{form.ticker.toUpperCase()}</span>
                  {form.order_type === "limit" && form.limit_price
                    ? ` @ $${parseFloat(form.limit_price).toFixed(2)}`
                    : " @ market price"}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {isLive
                    ? "Real capital at risk — this cannot be undone."
                    : "Paper mode — simulated order, no real funds."}
                </p>
              </div>

              <p className="text-slate-400 text-sm mb-6">
                {isLive
                  ? "This will execute with real funds immediately."
                  : "Are you sure you want to submit this simulated order?"}
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmOpen(false)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all hover:bg-white/10"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#64748B" }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleOrder}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all"
                  style={{
                    background: isLive ? "rgba(255,0,128,0.2)" : "rgba(0,212,255,0.2)",
                    border: `1px solid ${isLive ? "rgba(255,0,128,0.5)" : "rgba(0,212,255,0.4)"}`,
                    color: isLive ? "#FF0080" : "#00D4FF",
                  }}
                >
                  Confirm
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ExplanationModal
        open={explainOpen}
        onClose={() => setExplainOpen(false)}
        content={EXPLAIN_EXECUTION}
      />
    </div>
  );
}
