/**
 * Server-only API base URL — used by server components/route handlers that
 * fetch directly (sitemap, signal share pages) instead of going through the
 * browser-facing client in lib/api.ts.
 */

export const SERVER_API_BASE =
  process.env.NEXT_PUBLIC_API_URL ??
  process.env.BACKEND_URL ??
  "http://localhost:8000";
