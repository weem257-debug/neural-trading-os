/**
 * Shared display config for trading-signal directions (BUY/SELL/HOLD/...).
 */

export const dirConfig = {
  STRONG_BUY:  { label: "Starker Kauf",    short: "S.BUY", color: "#3FB950", bg: "rgba(63,185,80,0.15)", border: "rgba(63,185,80,0.4)", glow: "rgba(63,185,80,0.3)" },
  BUY:         { label: "Kaufen",          short: "BUY",   color: "#3FB950", bg: "rgba(63,185,80,0.08)", border: "rgba(63,185,80,0.2)", glow: "rgba(63,185,80,0.15)" },
  HOLD:        { label: "Halten",          short: "HOLD",  color: "#D29922", bg: "rgba(210,153,34,0.08)", border: "rgba(210,153,34,0.25)", glow: "rgba(210,153,34,0.15)" },
  SELL:        { label: "Verkaufen",       short: "SELL",  color: "#E5534B", bg: "rgba(229,83,75,0.08)", border: "rgba(229,83,75,0.2)", glow: "rgba(229,83,75,0.15)" },
  STRONG_SELL: { label: "Starker Verkauf", short: "S.SELL",color: "#E5534B", bg: "rgba(229,83,75,0.15)", border: "rgba(229,83,75,0.4)", glow: "rgba(229,83,75,0.3)" },
};

/** German direction labels, e.g. BUY -> "Kaufen". */
export const DIR_LABELS_DE: Record<string, string> = {
  STRONG_BUY: "Starker Kauf", BUY: "Kaufen", HOLD: "Halten",
  SELL: "Verkaufen", STRONG_SELL: "Starker Verkauf",
};

/**
 * Look up a direction's German label.
 * Pass `{ upper: true }` when the input casing isn't guaranteed uppercase
 * (mirrors the pre-extraction call sites — dashboard looked up the raw key,
 * performance upper-cased first).
 */
export function dirLabel(d: string, opts?: { upper?: boolean }): string {
  const key = opts?.upper ? d.toUpperCase() : d;
  return DIR_LABELS_DE[key] ?? d;
}
