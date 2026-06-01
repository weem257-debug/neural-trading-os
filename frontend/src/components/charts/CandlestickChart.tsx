"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OHLCVBar {
  time: number;   // UNIX seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  sma20?: number | null;
  sma50?: number | null;
  ema12?: number | null;
}

interface CandlestickChartProps {
  /** Initial ticker to display */
  defaultTicker?: string;
  /** Controlled ticker — when provided, overrides internal selection when it changes */
  controlledTicker?: string;
  /** Height of the main chart area in pixels */
  height?: number;
}

const TICKERS = ["AAPL", "MSFT", "NVDA", "TSLA", "BTC-USD"] as const;
type Ticker = (typeof TICKERS)[number];

type IndicatorKey = "sma20" | "sma50" | "ema12";

interface IndicatorConfig {
  key: IndicatorKey;
  label: string;
  color: string;
}

const INDICATORS: IndicatorConfig[] = [
  { key: "sma20", label: "SMA20", color: "#00D4FF" },
  { key: "sma50", label: "SMA50", color: "#7B2FFF" },
  { key: "ema12", label: "EMA12", color: "#FFD700" },
];


// ---------------------------------------------------------------------------
// Pure JS indicator calculations (fallback when backend indicators missing)
// ---------------------------------------------------------------------------

function calcSMA(closes: number[], period: number): (number | null)[] {
  return closes.map((_, i) => {
    if (i < period - 1) return null;
    const slice = closes.slice(i - period + 1, i + 1);
    return slice.reduce((a, b) => a + b, 0) / period;
  });
}

function calcEMA(closes: number[], span: number): (number | null)[] {
  const k = 2 / (span + 1);
  const result: (number | null)[] = new Array(closes.length).fill(null);
  let ema: number | null = null;
  for (let i = 0; i < closes.length; i++) {
    if (i < span - 1) continue;
    if (ema === null) {
      const seed = closes.slice(0, span);
      ema = seed.reduce((a, b) => a + b, 0) / span;
    } else {
      ema = closes[i] * k + ema * (1 - k);
    }
    result[i] = Math.round(ema * 10000) / 10000;
  }
  return result;
}

function computeIndicators(
  bars: OHLCVBar[],
  active: Set<IndicatorKey>
): Record<IndicatorKey, (number | null)[]> {
  const closes = bars.map((b) => b.close);
  return {
    sma20: active.has("sma20") ? calcSMA(closes, 20) : [],
    sma50: active.has("sma50") ? calcSMA(closes, 50) : [],
    ema12: active.has("ema12") ? calcEMA(closes, 12) : [],
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CandlestickChart({
  defaultTicker = "AAPL",
  controlledTicker,
  height = 340,
}: CandlestickChartProps) {
  const containerRef    = useRef<HTMLDivElement>(null);
  const chartRef        = useRef<unknown>(null);
  const candleSeriesRef = useRef<unknown>(null);
  const volumeSeriesRef = useRef<unknown>(null);
  const lineSeriesRefs  = useRef<Partial<Record<IndicatorKey, unknown>>>({});

  const [activeTicker, setActiveTicker] = useState<string>(defaultTicker);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [lastClose, setLastClose]       = useState<number | null>(null);
  const [lastChange, setLastChange]     = useState<number | null>(null);
  const [activeIndicators, setActiveIndicators] = useState<Set<IndicatorKey>>(new Set());
  // Store latest bars so indicator toggles can re-render without refetch
  const barsRef = useRef<OHLCVBar[]>([]);

  // Sync with externally controlled ticker
  useEffect(() => {
    if (controlledTicker && controlledTicker.trim().length > 0) {
      const upper = controlledTicker.trim().toUpperCase();
      if (upper !== activeTicker) setActiveTicker(upper);
    }
  // activeTicker intentionally excluded — we only want to react to external changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlledTicker]);

  // ------------------------------------------------------------------
  // Create chart once
  // ------------------------------------------------------------------
  useEffect(() => {
    let chart: unknown;
    let mounted = true;

    (async () => {
      const { createChart, ColorType, CrosshairMode } = await import("lightweight-charts");

      if (!containerRef.current || !mounted) return;

      chart = createChart(containerRef.current, {
        width:  containerRef.current.clientWidth,
        height,
        layout: {
          background: { type: ColorType.Solid, color: "#080B14" },
          textColor: "#64748B",
        },
        grid: {
          vertLines:   { color: "rgba(255,255,255,0.04)" },
          horzLines:   { color: "rgba(255,255,255,0.04)" },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: { color: "#00D4FF40", labelBackgroundColor: "#0D1117" },
          horzLine: { color: "#00D4FF40", labelBackgroundColor: "#0D1117" },
        },
        rightPriceScale: {
          borderColor: "rgba(255,255,255,0.08)",
        },
        timeScale: {
          borderColor:    "rgba(255,255,255,0.08)",
          timeVisible:    true,
          secondsVisible: false,
        },
        handleScroll: true,
        handleScale:  true,
      });

      // @ts-expect-error lightweight-charts overloaded types
      const candleSeries = chart.addCandlestickSeries({
        upColor:         "#00FF88",
        downColor:       "#FF0080",
        borderUpColor:   "#00D4FF",
        borderDownColor: "#FF0080",
        wickUpColor:     "#00FF8880",
        wickDownColor:   "#FF008080",
      });

      // @ts-expect-error lightweight-charts overloaded types
      const volSeries = chart.addHistogramSeries({
        color:        "#00D4FF20",
        priceFormat:  { type: "volume" },
        priceScaleId: "volume",
        scaleMargins: { top: 0.85, bottom: 0 },
      });

      candleSeriesRef.current = candleSeries;
      volumeSeriesRef.current = volSeries;
      chartRef.current        = chart;

      const ro = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry && chart) {
          // @ts-expect-error lightweight-charts
          chart.applyOptions({ width: entry.contentRect.width });
        }
      });
      ro.observe(containerRef.current!);
    })();

    return () => {
      mounted = false;
      if (chart) {
        // @ts-expect-error lightweight-charts
        chart.remove();
      }
      chartRef.current        = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      lineSeriesRefs.current  = {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height]);

  // ------------------------------------------------------------------
  // Render indicator lines onto chart (pure client-side calculation)
  // ------------------------------------------------------------------
  const renderIndicators = useCallback(
    (bars: OHLCVBar[], indicators: Set<IndicatorKey>) => {
      if (!chartRef.current) return;
      const computed = computeIndicators(bars, indicators);

      for (const { key, color } of INDICATORS) {
        const existingSeries = lineSeriesRefs.current[key];
        const values = computed[key];

        if (!indicators.has(key)) {
          // Remove series if indicator disabled
          if (existingSeries) {
            try {
              // @ts-expect-error lightweight-charts
              chartRef.current.removeSeries(existingSeries);
            } catch {
              // ignore
            }
            delete lineSeriesRefs.current[key];
          }
          continue;
        }

        // Ensure series exists
        let series = existingSeries;
        if (!series) {
          // @ts-expect-error lightweight-charts
          series = chartRef.current.addLineSeries({
            color,
            lineWidth: 1.5,
            priceLineVisible: false,
            lastValueVisible: true,
            crosshairMarkerVisible: false,
          });
          lineSeriesRefs.current[key] = series;
        }

        // Set data — filter out null values
        const lineData = bars
          .map((b, i) => {
            const v = values[i];
            return v !== null && v !== undefined
              ? { time: b.time as unknown as import("lightweight-charts").Time, value: v }
              : null;
          })
          .filter(Boolean) as { time: import("lightweight-charts").Time; value: number }[];

        // @ts-expect-error lightweight-charts
        series.setData(lineData);
      }
    },
    []
  );

  // ------------------------------------------------------------------
  // Toggle indicator
  // ------------------------------------------------------------------
  const toggleIndicator = useCallback(
    (key: IndicatorKey) => {
      setActiveIndicators((prev) => {
        const next = new Set(prev);
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.add(key);
        }
        // Re-render with current bars
        if (barsRef.current.length > 0) {
          setTimeout(() => renderIndicators(barsRef.current, next), 0);
        }
        return next;
      });
    },
    [renderIndicators]
  );

  // ------------------------------------------------------------------
  // Load OHLCV data
  // ------------------------------------------------------------------
  const loadCandles = useCallback(
    async (ticker: string, indicators?: Set<IndicatorKey>) => {
      if (!candleSeriesRef.current || !volumeSeriesRef.current) return;

      const activeInds = indicators ?? activeIndicators;

      setLoading(true);
      setError(null);

      try {
        const indParam = [...activeInds];
        const bars: OHLCVBar[] = await api.portfolio.candles(ticker, "1mo", "1d", indParam);

        if (!bars || bars.length === 0) {
          setError("Keine Daten für diesen Ticker verfügbar.");
          return;
        }

        bars.sort((a, b) => a.time - b.time);
        barsRef.current = bars;

        const candleData = bars.map((b) => ({
          time:  b.time as unknown as import("lightweight-charts").Time,
          open:  b.open,
          high:  b.high,
          low:   b.low,
          close: b.close,
        }));

        const volumeData = bars.map((b) => ({
          time:  b.time as unknown as import("lightweight-charts").Time,
          value: b.volume,
          color: b.close >= b.open ? "#00FF8825" : "#FF008025",
        }));

        // @ts-expect-error lightweight-charts
        candleSeriesRef.current.setData(candleData);
        // @ts-expect-error lightweight-charts
        volumeSeriesRef.current.setData(volumeData);
        // @ts-expect-error lightweight-charts
        chartRef.current?.timeScale().fitContent();

        // Render indicators (client-side calculation from OHLCV)
        renderIndicators(bars, activeInds);

        if (bars.length >= 2) {
          const last = bars[bars.length - 1];
          const prev = bars[bars.length - 2];
          setLastClose(last.close);
          setLastChange(((last.close - prev.close) / prev.close) * 100);
        } else if (bars.length === 1) {
          setLastClose(bars[0].close);
          setLastChange(0);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Candlestick-Daten konnten nicht geladen werden");
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [renderIndicators]
  );

  useEffect(() => {
    const t = setTimeout(() => loadCandles(activeTicker), 200);
    return () => clearTimeout(t);
  }, [activeTicker, loadCandles]);

  const positive = (lastChange ?? 0) >= 0;

  return (
    <div
      className="flex flex-col rounded-xl overflow-hidden"
      style={{
        background: "#080B14",
        border:     "1px solid rgba(0,212,255,0.15)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 flex-wrap gap-2"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        {/* Ticker switcher */}
        <div className="flex items-center gap-2 flex-wrap">
          {TICKERS.map((t) => (
            <button
              key={t}
              onClick={() => setActiveTicker(t)}
              className="px-3 py-1 rounded-lg text-xs font-bold font-mono transition-all"
              style={
                t === activeTicker
                  ? {
                      background: "rgba(0,212,255,0.15)",
                      border:     "1px solid rgba(0,212,255,0.4)",
                      color:      "#00D4FF",
                      boxShadow:  "0 0 10px rgba(0,212,255,0.2)",
                    }
                  : {
                      background: "rgba(255,255,255,0.04)",
                      border:     "1px solid rgba(255,255,255,0.08)",
                      color:      "#475569",
                    }
              }
            >
              {t}
            </button>
          ))}

          {/* Divider */}
          <div className="w-px h-4 bg-white/10" />

          {/* Indicator toggles */}
          {INDICATORS.map(({ key, label, color }) => {
            const on = activeIndicators.has(key);
            return (
              <button
                key={key}
                onClick={() => toggleIndicator(key)}
                className="px-2.5 py-1 rounded-lg text-xs font-bold font-mono transition-all"
                style={
                  on
                    ? {
                        background: `${color}20`,
                        border:     `1px solid ${color}60`,
                        color,
                        boxShadow:  `0 0 8px ${color}30`,
                      }
                    : {
                        background: "rgba(255,255,255,0.03)",
                        border:     "1px solid rgba(255,255,255,0.06)",
                        color:      "#334155",
                      }
                }
                title={`${label} ein-/ausblenden`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Price indicator + refresh */}
        <div className="flex items-center gap-4">
          {lastClose !== null && (
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold font-mono text-slate-100">
                ${lastClose.toFixed(lastClose > 1000 ? 0 : 2)}
              </span>
              {lastChange !== null && (
                <span
                  className="text-sm font-mono font-bold px-2 py-0.5 rounded"
                  style={{
                    color:      positive ? "#00FF88" : "#FF0080",
                    background: positive ? "rgba(0,255,136,0.1)" : "rgba(255,0,128,0.1)",
                  }}
                >
                  {positive ? "+" : ""}
                  {lastChange.toFixed(2)}%
                </span>
              )}
            </div>
          )}

          <button
            onClick={() => loadCandles(activeTicker)}
            disabled={loading}
            className="p-1.5 rounded-lg transition-all disabled:opacity-40"
            style={{
              background: "rgba(255,255,255,0.04)",
              border:     "1px solid rgba(255,255,255,0.08)",
            }}
            title="Chart aktualisieren"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 text-slate-500 ${loading ? "animate-spin" : ""}`}
            />
          </button>
        </div>
      </div>

      {/* Chart area */}
      <div className="relative" style={{ height }}>
        {loading && (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center"
            style={{ background: "rgba(8,11,20,0.7)" }}
          >
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: "#00D4FF" }} />
          </div>
        )}

        {error && !loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center">
            <div className="text-center">
              <p className="text-sm text-red-400 mb-2">{error}</p>
              <button onClick={() => loadCandles(activeTicker)} className="text-xs text-cyan-400 underline">
                Retry
              </button>
            </div>
          </div>
        )}

        <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      </div>

      {/* Footer legend */}
      <div
        className="flex items-center gap-4 px-4 py-2 text-xs text-slate-600 flex-wrap"
        style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
      >
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-2 rounded-sm inline-block" style={{ background: "#00FF88" }} />
          Up candle
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-2 rounded-sm inline-block" style={{ background: "#FF0080" }} />
          Down candle
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-2 rounded-sm inline-block" style={{ background: "#00D4FF20" }} />
          Volume
        </span>
        {/* Active indicator legend */}
        {INDICATORS.filter(({ key }) => activeIndicators.has(key)).map(({ key, label, color }) => (
          <span key={key} className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 inline-block rounded-full" style={{ background: color }} />
            <span style={{ color }}>{label}</span>
          </span>
        ))}
        <span className="ml-auto opacity-60">1mo · 1d · lightweight-charts</span>
      </div>
    </div>
  );
}
