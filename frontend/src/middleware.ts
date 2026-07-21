import { NextRequest, NextResponse } from "next/server";

/**
 * Edge middleware — security headers that must be computed per request.
 *
 * F-03 / F-25: nonce-based Content-Security-Policy for HTML routes. We DO NOT
 *   use `unsafe-inline`/`unsafe-eval` for script-src (that would defeat the XSS
 *   protection and re-open F-02). Next.js automatically stamps the same nonce
 *   onto its framework/bootstrap <script> tags when it finds a nonce in the CSP
 *   of the incoming request headers, and `strict-dynamic` lets those trusted
 *   scripts load the app chunks. Third-party scripts (Stripe) are loaded by a
 *   nonced Next loader, so strict-dynamic covers them too.
 *
 * F-05: the Railway default domain must not be indexed while the canonical
 *   marketing domain differs. We emit `X-Robots-Tag: noindex` for that host
 *   (a hard 301 is intentionally NOT done here because the Railway domain is the
 *   operational production URL users actually reach — redirecting it would break
 *   access until the custom domain is fully wired up).
 *
 * F-06: HTML documents are served `no-store` (auth pages) / `no-cache` so stale
 *   full-route-cache HTML can't be served for up to a year after a deploy.
 */

// Staged rollout (F-03 / F-25): default to Report-Only so the policy is
// observed in production WITHOUT breaking the app. Next.js statically
// pre-renders most routes, so their inline/framework <script> tags carry NO
// per-request nonce — an ENFORCING nonce+strict-dynamic policy would block them
// (white screen). Flip to enforce via CSP_MODE=enforce ONLY after HTML routes
// are switched to dynamic rendering (so Next stamps the nonce onto its scripts)
// and the Report-Only telemetry is clean. See audit follow-up TASK-CSP-ENFORCE.
const CSP_MODE = process.env.CSP_MODE ?? "report-only"; // "enforce" | "report-only"

// Hosts that should never be indexed by search engines (F-05).
const NOINDEX_HOSTS = new Set<string>([
  "frontend-production-8a00.up.railway.app",
]);

// Auth pages must never be cached by any shared/browser cache (F-06).
const NO_STORE_PATHS = new Set<string>([
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
]);

function buildCsp(nonce: string): string {
  // connect-src: same-origin API (Next rewrite proxy) + WSS + Stripe API.
  // The wss host is derived from the public WS URL if present.
  const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "";
  const wssHost = wsUrl.replace(/^ws:/, "wss:");
  const connectSrc = ["'self'", "https://api.stripe.com"];
  if (wssHost) connectSrc.push(wssHost);
  // Allow same-origin wss upgrade too (proxied WebSocket).
  connectSrc.push("wss:");

  const directives: string[] = [
    "default-src 'self'",
    // F-25 (VERBINDLICH): NO 'unsafe-inline' / 'unsafe-eval' for script-src.
    // Only the per-request nonce and scripts it transitively loads (via
    // 'strict-dynamic') may execute → genuine XSS protection. 'strict-dynamic'
    // is universally supported by evergreen browsers, so no unsafe fallback is
    // needed. 'self' is kept as a conventional (strict-dynamic-ignored) token.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    // style-src keeps 'unsafe-inline' — this is explicitly permitted by the
    // audit (F-03) and does not weaken script XSS protection.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https: blob:",
    "font-src 'self' data:",
    `connect-src ${connectSrc.join(" ")}`,
    "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
    "worker-src 'self' blob:",
    "child-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ];
  return directives.join("; ");
}

export function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce);

  // Forward the nonce to the app via request headers so the RSC layer can read
  // it, and so Next stamps its own scripts with it.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  const cspHeaderName =
    CSP_MODE === "report-only"
      ? "Content-Security-Policy-Report-Only"
      : "Content-Security-Policy";
  response.headers.set(cspHeaderName, csp);

  // F-05: noindex for the Railway default host.
  const host = request.headers.get("host") ?? "";
  if (NOINDEX_HOSTS.has(host)) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }

  // F-06: kill long-lived HTML caching. Auth pages → no-store; other HTML docs
  // → revalidate. Static assets are excluded via the matcher below and keep
  // their immutable caching.
  const path = request.nextUrl.pathname;
  if (NO_STORE_PATHS.has(path)) {
    response.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  } else {
    response.headers.set("Cache-Control", "private, no-cache, must-revalidate");
  }

  return response;
}

export const config = {
  // Run on all routes EXCEPT the same-origin API proxy (backend sets its own
  // headers), Next static/image assets (immutable-cached), and common static
  // files. This keeps the /api rewrite proxy and _next/static caching intact.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf)$).*)",
  ],
};
