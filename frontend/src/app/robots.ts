import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://neuraltrading.io";
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/landing",
          "/pricing",
          "/signals/marketplace",
          "/signals/view/",
          "/performance",
          "/register",
          "/login",
          "/impressum",
          "/datenschutz",
          "/agb",
        ],
        disallow: [
          "/invite/",
          "/dashboard",
          "/portfolio",
          "/signals",
          "/backtest",
          "/risk",
          "/execution",
          "/alerts",
          "/analysis",
          "/sentiment",
          "/settings",
          "/billing",
          "/p2p",
          "/account",
          "/brokers",
          "/learning",
          "/networth",
          "/portfolios",
          "/depot",
          "/forgot-password",
          "/reset-password",
          "/unsubscribe",
          "/admin",
          "/api/",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
