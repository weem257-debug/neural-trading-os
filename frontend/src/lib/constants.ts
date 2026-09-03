/**
 * Shared app-wide constants — no "use client", no client-only imports.
 * Imported from both server layouts/pages and client components.
 */

export const DEFAULT_SYMBOLS = ["AAPL", "MSFT", "NVDA", "TSLA", "BTC-USD"];

export const REFRESH_INTERVAL_MS = 60_000;

export const SITE_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://neuraltrading.io";
