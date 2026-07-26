"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { api } from "@/lib/api";

interface EquityPoint {
  /** Pre-formatted short date from the backend, e.g. "Jul 24". */
  date: string;
  value: number;
}

const RANGES = [
  { days: 30, label: "1M" },
  { days: 90, label: "3M" },
  { days: 180, label: "6M" },
  { days: 365, label: "1J" },
] as const;

const ACCENT = "#4C8DF6";
const POSITIVE = "#3FB950";
const NEGATIVE = "#E5534B";

function formatCurrency(v: number): string {
  return `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

/**
 * Portfolio value over time.
 *
 * The dashboard had no time-series chart at all — only a donut and a few
 * sparklines — so nothing answered "how did my portfolio develop?". The same
 * chart existed inline on /portfolio; this component is the single shared
 * implementation both pages use.
 *
 * `enabled=false` renders the empty state instead of fetching: the
 * equity-curve endpoint reconstructs the *demo* portfolio's history, so with
 * the demo-data switch off there is nothing legitimate to show.
 */
export function EquityCurveChart({
  height = 240,
  enabled = true,
  defaultDays = 30,
}: {
  height?: number;
  enabled?: boolean;
  defaultDays?: number;
}) {
  const [days, setDays] = useState<number>(defaultDays);
  const [points, setPoints] = useState<EquityPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setPoints([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.portfolio
      .equityCurve(days)
      .then((rows) => {
        if (!cancelled) setPoints(rows ?? []);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Verlauf konnte nicht geladen werden");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [days, enabled]);

  const { changeAbs, changePct, trendColor } = useMemo(() => {
    if (points.length < 2) return { changeAbs: 0, changePct: 0, trendColor: ACCENT };
    const first = points[0].value;
    const last = points[points.length - 1].value;
    const abs = last - first;
    return {
      changeAbs: abs,
      changePct: first !== 0 ? (abs / first) * 100 : 0,
      trendColor: abs >= 0 ? POSITIVE : NEGATIVE,
    };
  }, [points]);

  // Zoom the y-axis to the actual value band — a zero-based axis flattens a
  // 3% move on a six-figure portfolio into a straight line.
  const yDomain = useMemo<[number, number] | undefined>(() => {
    if (points.length === 0) return undefined;
    const values = points.map((p) => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = (max - min || max * 0.01) * 0.15;
    return [min - pad, max + pad];
  }, [points]);

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-baseline gap-2">
          <p className="section-label">Portfolio-Verlauf</p>
          {enabled && points.length >= 2 && (
            <span className="text-xs font-mono" style={{ color: trendColor }}>
              {changeAbs >= 0 ? "+" : "−"}
              {formatCurrency(Math.abs(changeAbs))} ({changePct >= 0 ? "+" : ""}
              {changePct.toFixed(2)}%)
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => setDays(r.days)}
              disabled={!enabled}
              className="px-2.5 py-1 rounded-md text-xs font-medium transition-colors disabled:opacity-40"
              style={
                days === r.days
                  ? { background: "var(--accent-soft)", color: ACCENT, border: "1px solid rgba(76,141,246,0.35)" }
                  : { background: "transparent", color: "var(--text-dim)", border: "1px solid var(--border)" }
              }
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ height }} className="relative">
        {!enabled && (
          <div className="absolute inset-0 flex items-center justify-center text-center px-6">
            <p className="text-xs" style={{ color: "var(--text-dim)" }}>
              Verlauf ausgeblendet — er basiert auf dem Demo-Portfolio.
              <br />
              Demodaten einschalten oder ein echtes Depot verbinden.
            </p>
          </div>
        )}

        {enabled && loading && (
          <div
            className="absolute inset-0 rounded-md animate-pulse"
            style={{ background: "rgba(255,255,255,0.03)" }}
          />
        )}

        {enabled && !loading && error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-xs" style={{ color: NEGATIVE }}>{error}</p>
          </div>
        )}

        {enabled && !loading && !error && points.length > 0 && (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="equity-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={trendColor} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={trendColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fill: "#6E7681", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                minTickGap={32}
              />
              <YAxis
                domain={yDomain ?? ["auto", "auto"]}
                tick={{ fill: "#6E7681", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={62}
                tickFormatter={(v: number) => formatCurrency(v)}
              />
              <Tooltip
                contentStyle={{
                  background: "#131821",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: "8px",
                  color: "#E6EDF3",
                  fontSize: "12px",
                }}
                labelStyle={{ color: "#8B949E" }}
                formatter={(v: number) => [formatCurrency(v), "Portfoliowert"]}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={trendColor}
                strokeWidth={1.75}
                fill="url(#equity-fill)"
                dot={false}
                activeDot={{ r: 3, strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}

        {enabled && !loading && !error && points.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-xs" style={{ color: "var(--text-dim)" }}>Keine Verlaufsdaten vorhanden.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default EquityCurveChart;
