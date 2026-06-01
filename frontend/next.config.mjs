// @ts-check

const isMobileBuild = process.env.MOBILE_BUILD === "1";

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
