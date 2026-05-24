/**
 * Skeleton loading components — Cyber/Neon aesthetic.
 * Cyan shimmer on dark base, matching the Neural Trading OS design system.
 *
 * Usage:
 *   <SkeletonCard />           — stat/metric card placeholder
 *   <SkeletonTable rows={5} /> — positions table placeholder
 *   <SkeletonChart />          — chart area placeholder
 */

import React from "react";

/* ------------------------------------------------------------------ */
/* Base shimmer keyframe injected once                                  */
/* ------------------------------------------------------------------ */
const SHIMMER_STYLE = `
@keyframes skeleton-shimmer {
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(200%); }
}
.skeleton-shimmer::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(0, 212, 255, 0.08) 40%,
    rgba(0, 212, 255, 0.18) 50%,
    rgba(0, 212, 255, 0.08) 60%,
    transparent 100%
  );
  animation: skeleton-shimmer 2s ease-in-out infinite;
}
`;

function ShimmerStyleTag() {
  return <style dangerouslySetInnerHTML={{ __html: SHIMMER_STYLE }} />;
}

/* ------------------------------------------------------------------ */
/* Primitive: a single shimmer block                                    */
/* ------------------------------------------------------------------ */
interface SkeletonBlockProps {
  className?: string;
  style?: React.CSSProperties;
  height?: number | string;
  width?: number | string;
  rounded?: string;
}

export function SkeletonBlock({
  className = "",
  style,
  height = 16,
  width = "100%",
  rounded = "rounded-lg",
}: SkeletonBlockProps) {
  return (
    <div
      className={`skeleton-shimmer relative overflow-hidden ${rounded} ${className}`}
      style={{
        height,
        width,
        background: "rgba(0,212,255,0.04)",
        border: "1px solid rgba(0,212,255,0.07)",
        ...style,
      }}
    />
  );
}

/* ------------------------------------------------------------------ */
/* SkeletonCard — stat/metric card placeholder                          */
/* ------------------------------------------------------------------ */
export function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <>
      <ShimmerStyleTag />
      <div
        className={`rounded-2xl p-5 ${className}`}
        style={{
          background: "linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015))",
          border: "1px solid rgba(0,212,255,0.1)",
        }}
      >
        {/* Icon + label row */}
        <div className="flex items-center justify-between mb-4">
          <SkeletonBlock height={32} width={32} rounded="rounded-xl" />
          <SkeletonBlock height={20} width={60} />
        </div>

        {/* Value */}
        <SkeletonBlock height={36} width="70%" className="mb-2" />

        {/* Sub-label */}
        <SkeletonBlock height={12} width="50%" />

        {/* Trend indicator */}
        <div className="flex items-center gap-2 mt-4 pt-4" style={{ borderTop: "1px solid rgba(0,212,255,0.06)" }}>
          <SkeletonBlock height={8} width={8} rounded="rounded-full" />
          <SkeletonBlock height={10} width="40%" />
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* SkeletonTable — positions/orders table placeholder                   */
/* ------------------------------------------------------------------ */
interface SkeletonTableProps {
  rows?: number;
  columns?: number;
  className?: string;
}

export function SkeletonTable({ rows = 5, columns = 6, className = "" }: SkeletonTableProps) {
  const colWidths = ["w-20", "w-24", "w-16", "w-20", "w-20", "w-16"];

  return (
    <>
      <ShimmerStyleTag />
      <div
        className={`rounded-2xl overflow-hidden ${className}`}
        style={{
          border: "1px solid rgba(0,212,255,0.1)",
          background: "rgba(8,11,20,0.6)",
        }}
      >
        {/* Table header */}
        <div
          className="flex items-center gap-4 px-5 py-3"
          style={{ borderBottom: "1px solid rgba(0,212,255,0.08)", background: "rgba(0,212,255,0.03)" }}
        >
          {Array.from({ length: columns }).map((_, i) => (
            <SkeletonBlock
              key={i}
              height={10}
              width={i === 0 ? 80 : 60}
              style={{ opacity: 0.7 }}
            />
          ))}
        </div>

        {/* Table rows */}
        <div className="divide-y" style={{ borderColor: "rgba(0,212,255,0.05)" }}>
          {Array.from({ length: rows }).map((_, rowIdx) => (
            <div
              key={rowIdx}
              className="flex items-center gap-4 px-5 py-3.5"
              style={{
                opacity: 1 - rowIdx * 0.08,
              }}
            >
              {/* Ticker badge */}
              <SkeletonBlock height={32} width={40} rounded="rounded-xl" />

              {/* Rest of columns */}
              {Array.from({ length: columns - 1 }).map((_, colIdx) => (
                <SkeletonBlock
                  key={colIdx}
                  height={12}
                  width={colWidths[(colIdx + 1) % colWidths.length]}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* SkeletonChart — chart area placeholder                               */
/* ------------------------------------------------------------------ */
interface SkeletonChartProps {
  height?: number;
  className?: string;
  showLegend?: boolean;
}

export function SkeletonChart({ height = 240, className = "", showLegend = true }: SkeletonChartProps) {
  return (
    <>
      <ShimmerStyleTag />
      <div
        className={`rounded-2xl p-5 ${className}`}
        style={{
          background: "linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015))",
          border: "1px solid rgba(0,212,255,0.1)",
        }}
      >
        {/* Header row */}
        <div className="flex items-center justify-between mb-5">
          <div className="space-y-2">
            <SkeletonBlock height={14} width={120} />
            <SkeletonBlock height={10} width={80} />
          </div>
          {showLegend && (
            <div className="flex gap-3">
              {[60, 50, 44].map((w, i) => (
                <SkeletonBlock key={i} height={24} width={w} rounded="rounded-lg" />
              ))}
            </div>
          )}
        </div>

        {/* Chart body */}
        <div
          className="skeleton-shimmer relative overflow-hidden rounded-xl"
          style={{
            height,
            background: "rgba(0,212,255,0.03)",
            border: "1px solid rgba(0,212,255,0.07)",
          }}
        >
          {/* Fake y-axis lines */}
          {[20, 40, 60, 80].map((pct) => (
            <div
              key={pct}
              className="absolute left-0 right-0 h-px"
              style={{
                top: `${pct}%`,
                background: "rgba(0,212,255,0.06)",
              }}
            />
          ))}

          {/* Fake chart bars / area */}
          <div className="absolute bottom-0 left-0 right-0 flex items-end gap-1 px-3 pb-3">
            {Array.from({ length: 20 }).map((_, i) => {
              const h = 20 + ((i * 37 + 17) % 65);
              return (
                <div
                  key={i}
                  className="flex-1 rounded-t-sm"
                  style={{
                    height: `${h}%`,
                    background: "rgba(0,212,255,0.06)",
                    minWidth: 4,
                  }}
                />
              );
            })}
          </div>
        </div>

        {/* X-axis labels */}
        <div className="flex items-center justify-between mt-3 px-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonBlock key={i} height={8} width={32} />
          ))}
        </div>
      </div>
    </>
  );
}
