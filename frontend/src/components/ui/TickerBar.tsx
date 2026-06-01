"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { WSStatus } from "./WSStatus";
import { useTradingStore } from "@/store/tradingStore";
import { useAuthStore } from "@/store/authStore";

interface TickerItem {
  symbol: string;
  price: number;
  changePct: number;
}

// Fallback static prices shown before the first WS batch arrives.
// Keys match backend _PRICE_WATCHLIST; "BTC-USD" is aliased to "BTC" for display.
const SEED_TICKERS: TickerItem[] = [
  { symbol: "AAPL",  price: 189.43, changePct: 1.14 },
  { symbol: "TSLA",  price: 248.75, changePct: -2.09 },
  { symbol: "NVDA",  price: 875.20, changePct: 2.15 },
  { symbol: "MSFT",  price: 415.80, changePct: 0.78 },
  { symbol: "GOOGL", price: 174.55, changePct: -0.82 },
  { symbol: "META",  price: 562.30, changePct: 1.78 },
  { symbol: "AMZN",  price: 198.12, changePct: 2.35 },
  { symbol: "BTC",   price: 67420.00, changePct: 1.87 },
  { symbol: "AMD",   price: 168.45, changePct: -1.87 },
  { symbol: "NFLX",  price: 625.10, changePct: 0.53 },
];

// Backend stores BTC as "BTC-USD"; map to display symbol
const WS_KEY_TO_SYMBOL: Record<string, string> = {
  "BTC-USD": "BTC",
};

function fmt(price: number, symbol: string): string {
  if (symbol === "BTC") {
    return price.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }
  return price.toFixed(2);
}

export function TickerBar() {
  const pathname = usePathname();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());
  const storePrices = useTradingStore((s) => s.prices);

  // All hooks must be called unconditionally — early return comes after
  const tickers = useMemo<TickerItem[]>(() => {
    return SEED_TICKERS.map((seed) => {
      const wsKey = Object.entries(WS_KEY_TO_SYMBOL).find(([, v]) => v === seed.symbol)?.[0] ?? seed.symbol;
      const live = storePrices[wsKey] ?? storePrices[seed.symbol];
      if (live) {
        return { symbol: seed.symbol, price: live.price, changePct: live.change_pct };
      }
      return seed;
    });
  }, [storePrices]);

  const [seedTickers, setSeedTickers] = useState<TickerItem[]>(SEED_TICKERS);
  const hasLiveData = Object.keys(storePrices).length > 0;

  useEffect(() => {
    if (hasLiveData) return;
    const interval = setInterval(() => {
      setSeedTickers((prev) =>
        prev.map((t) => {
          const delta = (Math.random() - 0.5) * 0.002 * t.price;
          return {
            ...t,
            price: Math.max(0.01, t.price + delta),
            changePct: t.changePct + (Math.random() - 0.5) * 0.05,
          };
        })
      );
    }, 3000);
    return () => clearInterval(interval);
  }, [hasLiveData]);

  const NO_TICKERBAR = new Set(["/", "/landing", "/login", "/register", "/forgot-password", "/reset-password", "/impressum", "/datenschutz", "/agb"]);
  if (NO_TICKERBAR.has(pathname)) return null;

  // Full-screen standalone landing (invite funnel) never renders dashboard chrome.
  if (pathname.startsWith("/invite/")) return null;

  // Public share surface: hide dashboard ticker bar for anonymous visitors.
  if (!isAuthenticated && pathname.startsWith("/signals/view/")) return null;

  const displayed = hasLiveData ? tickers : seedTickers;

  // Duplicate for infinite scroll
  const doubled = [...displayed, ...displayed];

  return (
    <div
      className="relative flex-shrink-0 overflow-hidden"
      style={{
        height: "36px",
        background: "rgba(8,11,20,0.95)",
        borderBottom: "1px solid rgba(0,212,255,0.12)",
      }}
    >
      {/* Left fade */}
      <div
        className="absolute left-0 top-0 bottom-0 w-16 z-10 pointer-events-none"
        style={{ background: "linear-gradient(90deg, rgba(8,11,20,1), transparent)" }}
      />
      {/* Right fade */}
      <div
        className="absolute right-0 top-0 bottom-0 w-40 z-10 pointer-events-none"
        style={{ background: "linear-gradient(-90deg, rgba(8,11,20,1) 50%, transparent)" }}
      />

      {/* WSStatus indicator — right side */}
      <div className="absolute right-2 top-1/2 -translate-y-1/2 z-20">
        <WSStatus />
      </div>

      {/* LIVE label */}
      <div
        className="absolute left-3 top-1/2 -translate-y-1/2 z-20 flex items-center gap-1.5"
      >
        <div
          className="w-1.5 h-1.5 rounded-full"
          style={{
            background: hasLiveData ? "#00FF88" : "#888",
            boxShadow: hasLiveData ? "0 0 6px #00FF88" : "none",
            animation: hasLiveData ? "glow-pulse-green 1.5s ease-in-out infinite" : "none",
          }}
        />
        <span className="text-xs font-bold tracking-widest" style={{ color: hasLiveData ? "#00FF88" : "#888", fontSize: "9px" }}>
          {hasLiveData ? "LIVE" : "DEMO"}
        </span>
      </div>

      {/* Scrolling ticker */}
      <div className="ticker-container absolute inset-0 flex items-center pl-16">
        <div className="ticker-inner flex items-center gap-0">
          {doubled.map((t, i) => {
            const positive = t.changePct >= 0;
            return (
              <div
                key={`${t.symbol}-${i}`}
                className="flex items-center gap-2 px-4 text-xs font-mono whitespace-nowrap"
                style={{ borderRight: "1px solid rgba(255,255,255,0.05)" }}
              >
                <span className="font-bold text-slate-300">{t.symbol}</span>
                <span className="text-slate-400">${fmt(t.price, t.symbol)}</span>
                <span
                  className="font-semibold"
                  style={{
                    color: positive ? "#00FF88" : "#FF0080",
                    textShadow: positive
                      ? "0 0 6px rgba(0,255,136,0.4)"
                      : "0 0 6px rgba(255,0,128,0.4)",
                  }}
                >
                  {positive ? "+" : ""}
                  {t.changePct.toFixed(2)}%
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
