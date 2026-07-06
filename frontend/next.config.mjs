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
      return [
        {
          source: "/api/:path*",
          destination: `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/:path*`,
        },
      ];
    },
  } : {}),
};

export default nextConfig;
