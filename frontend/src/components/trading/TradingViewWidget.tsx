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
 * default crypto exchange feed expects "BTCUSD" (no dash). Equities are passed
 * through as-is — TradingView auto-resolves the primary listing exchange.
 */
function toTradingViewSymbol(ticker: string): string {
  const upper = ticker.trim().toUpperCase();
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
