import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ??
    "https://frontend-production-8a00.up.railway.app";
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/landing",
          "/pricing",
          "/signals/marketplace",
          "/login",
        ],
        disallow: [
          "/dashboard",
          "/portfolio",
          "/signals$",
          "/backtest",
          "/risk",
          "/execution",
          "/alerts",
          "/analysis",
          "/sentiment",
          "/settings",
          "/billing",
          "/p2p",
          "/api/",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
