"use client";

import { useEffect } from "react";
import { usePricesStream } from "@/hooks/useWebSocket";
import { useTradingStore } from "@/store/tradingStore";

/**
 * PricesProvider
 *
 * Invisible client component that bridges the WS "prices" channel to the
 * global Zustand tradingStore.  Mount it once in the root layout so every
 * page can read live prices via:
 *   const prices = useTradingStore((s) => s.prices);
 *
 * The backend broadcasts batch payloads:
 *   { timestamp, prices: { "AAPL": { price, change_pct, prev_close } } }
 *
 * We also handle the single-ticker convenience form used by broadcast_price():
 *   { type: "price", ticker, price, change_pct }
 */
export function PricesProvider() {
  const { lastEvent } = usePricesStream();
  const updatePrice = useTradingStore((s) => s.updatePrice);

  useEffect(() => {
    if (!lastEvent) return;

    // Batch format from _price_stream_loop in main.py
    const raw = lastEvent as unknown as {
      prices?: Record<string, { price: number; change_pct: number }>;
    };
    if (raw.prices) {
      Object.entries(raw.prices).forEach(([ticker, data]) => {
        updatePrice(ticker, data.price, data.change_pct);
      });
      return;
    }

    // Single-ticker format from broadcast_price()
    if (lastEvent.ticker && lastEvent.price !== undefined) {
      updatePrice(lastEvent.ticker, lastEvent.price, lastEvent.change_pct ?? 0);
    }
  }, [lastEvent, updatePrice]);

  return null;
}
