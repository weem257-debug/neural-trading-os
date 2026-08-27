"use client";

/**
 * Micro line chart for a price history — no axes, no labels, no interaction.
 *
 * Extracted from Watchlist.tsx so the dashboard watchlist and the /charts
 * stock board draw the exact same shape. The gradient id is derived from the
 * colour so two sparklines of the same direction share one <defs> entry
 * instead of colliding on a hardcoded id (multiple identical ids in one
 * document make every later sparkline reference the first one's gradient).
 */

export const SPARK_UP = "#3FB950";
export const SPARK_DOWN = "#E5534B";

export function Sparkline({
  data,
  positive,
  width = 64,
  height = 24,
  strokeWidth = 1.5,
  showDot = true,
  className,
}: {
  data: number[];
  positive: boolean;
  width?: number;
  height?: number;
  strokeWidth?: number;
  showDot?: boolean;
  className?: string;
}) {
  if (data.length < 2) {
    return (
      <div
        className={`opacity-30 text-xs text-slate-500 flex items-center justify-center flex-shrink-0 ${className ?? ""}`}
        style={{ width, height }}
        aria-hidden="true"
      >
        —
      </div>
    );
  }

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const pad = Math.min(2, height / 8);

  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - pad * 2) - pad;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const pathD = `M ${pts.join(" L ")}`;
  const areaD = `M ${pts[0]} L ${pts.join(" L ")} L ${width},${height} L 0,${height} Z`;
  const color = positive ? SPARK_UP : SPARK_DOWN;
  const gradId = `spark-${positive ? "up" : "down"}`;
  const [lastX, lastY] = pts[pts.length - 1].split(",");

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={`overflow-visible flex-shrink-0 ${className ?? ""}`}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#${gradId})`} />
      <path
        d={pathD}
        stroke={color}
        strokeWidth={strokeWidth}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {showDot && (
        <circle
          cx={lastX}
          cy={lastY}
          r={strokeWidth + 0.5}
          fill={color}
          style={{ filter: `drop-shadow(0 0 3px ${color})` }}
        />
      )}
    </svg>
  );
}
