"use client";

/**
 * Official TradingView "Advanced Chart" embed widget.
 *
 * Loaded purely client-side via the official <script> embed
 * (https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js) —
 * no unofficial "TradingView API", no npm dependency. The widget is
 * re-initialised whenever the symbol changes by clearing the container
 * and re-appending a fresh script tag (TradingView's embed widgets do not
 * expose an imperative "update symbol" API for this embed variant).
 */
import { useEffect, useRef } from "react";

interface TradingViewWidgetProps {
  /** Our internal ticker, e.g. "AAPL", "MSFT", "BTC-USD" */
  symbol: string;
  height?: number;
  className?: string;
}

/**
 * Maps our internal ticker format to a TradingView-resolvable symbol.
 * Crypto pairs use the "-USD" suffix internally (e.g. BTC-USD); TradingView's
 * default crypto exchange feed expects "BTCUSD" (no dash). yfinance-style
 * index (^GDAXI), forex (EURUSD=X), futures (GC=F) and XETRA (.DE) symbols
 * are mapped to their TradingView exchange feeds. Equities are passed
 * through as-is — TradingView auto-resolves the primary listing exchange.
 */
const INDEX_SYMBOL_MAP: Record<string, string> = {
  "^GSPC": "SP:SPX",
  "^NDX": "NASDAQ:NDX",
  "^DJI": "DJ:DJI",
  "^GDAXI": "XETR:DAX",
  "^STOXX50E": "TVC:SX5E",
  "^N225": "TVC:NI225",
};

const FUTURES_SYMBOL_MAP: Record<string, string> = {
  "GC=F": "COMEX:GC1!",
  "SI=F": "COMEX:SI1!",
  "HG=F": "COMEX:HG1!",
  "CL=F": "NYMEX:CL1!",
  "NG=F": "NYMEX:NG1!",
};

function toTradingViewSymbol(ticker: string): string {
  const upper = ticker.trim().toUpperCase();
  if (INDEX_SYMBOL_MAP[upper]) {
    return INDEX_SYMBOL_MAP[upper];
  }
  if (FUTURES_SYMBOL_MAP[upper]) {
    return FUTURES_SYMBOL_MAP[upper];
  }
  if (upper.endsWith("=X")) {
    return `FX:${upper.slice(0, -2)}`;
  }
  if (upper.endsWith(".DE")) {
    return `XETR:${upper.slice(0, -3)}`;
  }
  if (upper.endsWith("-USD")) {
    return `BINANCE:${upper.replace("-USD", "USDT")}`;
  }
  if (upper.endsWith("-EUR")) {
    return `BINANCE:${upper.replace("-EUR", "EUR")}`;
  }
  return upper;
}

export function TradingViewWidget({ symbol, height = 420, className }: TradingViewWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !symbol) return;

    // Clear previous widget instance before re-initialising.
    container.innerHTML = "";

    const widgetDiv = document.createElement("div");
    widgetDiv.className = "tradingview-widget-container__widget";
    widgetDiv.style.height = "100%";
    widgetDiv.style.width = "100%";
    container.appendChild(widgetDiv);

    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.text = JSON.stringify({
      autosize: true,
      symbol: toTradingViewSymbol(symbol),
      interval: "D",
      timezone: "Etc/UTC",
      theme: "dark",
      style: "1",
      locale: "de_DE",
      enable_publishing: false,
      hide_top_toolbar: false,
      hide_legend: false,
      save_image: false,
      backgroundColor: "rgba(8, 11, 20, 1)",
      gridColor: "rgba(0, 212, 255, 0.06)",
      allow_symbol_change: true,
      support_host: "https://www.tradingview.com",
    });

    container.appendChild(script);

    return () => {
      container.innerHTML = "";
    };
  }, [symbol]);

  return (
    <div
      ref={containerRef}
      className={`tradingview-widget-container ${className ?? ""}`}
      style={{ height, width: "100%" }}
    />
  );
}
