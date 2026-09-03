/**
 * Shared formatting helpers used across trading and depot components.
 */

/** `$1,234` for >= 1000, `$12.34` below — used for stock/ticker prices. */
export function formatPrice(v: number | null): string {
  if (v === null || Number.isNaN(v)) return "—";
  return v >= 1000
    ? `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
    : `$${v.toFixed(2)}`;
}

/** Whole-euro currency formatting (de-DE), e.g. `1.234 €`. */
export function formatEur(n: number, currency = "EUR"): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(n);
}
