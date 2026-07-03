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
  /**
   * Container height. Accepts a pixel number (legacy default) or any CSS
   * length string (e.g. "50vh") for responsive sizing. When a CSS string is
   * used, `minHeight` is enforced so the widget can never collapse to near-0
   * height while the layout is still settling (e.g. before the viewport has
   * a final height on first paint).
   */
  height?: number | string;
  /** Minimum height in px, only applied when `height` is a CSS string. Defaults to 400. */
  minHeight?: number;
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

export function TradingViewWidget({ symbol, height = 420, minHeight = 400, className }: TradingViewWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !symbol) return;

    // React StrictMode (and any symbol switch) runs this effect as
    // mount → cleanup → mount. The TradingView embed loads its script
    // asynchronously and attaches an internal resize handler; if we append
    // the script synchronously on the throwaway first pass, that instance
    // keeps loading after cleanup wipes the container and later fires
    // `resizeCanvasElement` on an already-disposed widget → the console spam
    // "Object is disposed" AND a widget that measured its width during a
    // transient layout and stays stuck at ~half the container width.
    //
    // Fix: defer initialisation to the next animation frame and cancel it in
    // cleanup. StrictMode's discarded pass never appends the async script, so
    // exactly ONE widget is ever created — and it is created after the layout
    // has settled at full width. A ResizeObserver re-initialises the widget if
    // the container width later changes materially, so it can never remain narrow.
    let disposed = false;
    let rafId = 0;
    let currentWidth = 0;

    const buildWidget = () => {
      if (disposed || !container.isConnected) return;

      // Clear previous widget instance before (re-)initialising.
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
      currentWidth = container.clientWidth;
    };

    // Defer to the next frame so StrictMode's throwaway pass is cancelled
    // before it ever appends the script, and so the container has its final
    // width when TradingView's autosize measures it.
    rafId = requestAnimationFrame(buildWidget);

    // If the container width later changes by a meaningful amount (sidebar
    // toggle, viewport resize, late layout settle), rebuild once so the chart
    // fills the full width instead of staying stuck at its initial measurement.
    const ro = new ResizeObserver(() => {
      if (disposed) return;
      const w = container.clientWidth;
      if (w > 0 && Math.abs(w - currentWidth) > 24) {
        cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(buildWidget);
      }
    });
    ro.observe(container);

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      ro.disconnect();
      // Detaching the iframe removes the widget and its internal listeners.
      container.innerHTML = "";
    };
  }, [symbol]);

  return (
    <div
      ref={containerRef}
      className={`tradingview-widget-container ${className ?? ""}`}
      style={{
        height,
        minHeight: typeof height === "string" ? minHeight : undefined,
        width: "100%",
        minWidth: 0,
      }}
    />
  );
}
