// @ts-check

const isMobileBuild = process.env.MOBILE_BUILD === "1";

// The native APK ships a static bundle, so the backend URL must be baked in at
// build time and point at the live backend (never localhost). `.env.local`
// takes precedence over shell env vars in Next, so for mobile builds we inject
// these through next.config `env` (which DOES override .env.local). Override per
// build via MOBILE_API_URL / MOBILE_WS_URL / MOBILE_APP_URL.
const RAILWAY_DEFAULT = "https://frontend-production-8a00.up.railway.app";
const mobileEnv = isMobileBuild
  ? {
      NEXT_PUBLIC_API_URL: process.env.MOBILE_API_URL || RAILWAY_DEFAULT,
      NEXT_PUBLIC_WS_URL:
        process.env.MOBILE_WS_URL ||
        RAILWAY_DEFAULT.replace(/^https:/, "wss:"),
      NEXT_PUBLIC_APP_URL: process.env.MOBILE_APP_URL || RAILWAY_DEFAULT,
      // Static export has no Next server: the API client must keep using the
      // absolute URL instead of the same-origin rewrite proxy.
      NEXT_PUBLIC_MOBILE_BUILD: "1",
    }
  : {};

const securityHeaders = [
  { key: "X-Frame-Options",               value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options",        value: "nosniff" },
  { key: "Referrer-Policy",               value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control",        value: "on" },
  { key: "Permissions-Policy",            value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security",     value: "max-age=63072000; includeSubDomains" },
  { key: "Cross-Origin-Opener-Policy",    value: "same-origin-allow-popups" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Keep the exact request path (incl. trailing slash) when proxying /api/* to
  // the backend. Without this, Next.js emits a 308 that strips the trailing
  // slash from collection endpoints the client calls WITH a slash (e.g.
  // /api/alerts/, /api/webhooks/, /api/portfolios/). The stripped path then
  // hits FastAPI's slash-redirect, which responds with an ABSOLUTE backend-host
  // 307 Location — bouncing the browser cross-origin off the same-origin proxy,
  // where the frontend-domain auth/CSRF cookies no longer apply → 401. Skipping
  // the redirect lets /api/alerts/ pass straight through to the matching backend
  // route (200, no redirect), preserving the same-origin cookie/CSRF flow.
  skipTrailingSlashRedirect: true,

  // Bake live backend URLs into the mobile bundle (overrides .env.local).
  ...(isMobileBuild ? { env: mobileEnv } : {}),

  // Web builds additionally pick up `*.web.tsx` routes (Edge-runtime OG images
  // that cannot be statically exported). The Capacitor mobile export omits the
  // `.web.tsx` extension so those routes are excluded from the APK bundle.
  pageExtensions: isMobileBuild
    ? ["tsx", "ts", "jsx", "js"]
    : ["web.tsx", "tsx", "ts", "jsx", "js"],

  // standalone for Railway / Docker; export for Capacitor mobile builds
  ...(isMobileBuild ? { output: "export", distDir: "out" } : { output: "standalone" }),

  ...(!isMobileBuild ? {
    async headers() {
      return [{ source: "/(.*)", headers: securityHeaders }];
    },
    async rewrites() {
      const backend = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      return [
        // Preserve a trailing slash when proxying so collection endpoints the
        // client calls WITH a slash (/api/alerts/, /api/webhooks/,
        // /api/portfolios/) reach the matching FastAPI route directly. The bare
        // `/api/:path*` rule drops the trailing slash, so the backend answers
        // with an ABSOLUTE-host 307 slash-redirect that bounces the browser
        // cross-origin off the same-origin proxy (auth/CSRF cookies then don't
        // apply → 401). Ordering matters: the slash rule must come first.
        {
          source: "/api/:path*/",
          destination: `${backend}/api/:path*/`,
        },
        {
          source: "/api/:path*",
          destination: `${backend}/api/:path*`,
        },
      ];
    },
  } : {}),
};

export default nextConfig;
