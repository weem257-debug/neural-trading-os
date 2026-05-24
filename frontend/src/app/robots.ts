import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://neural-trading-os.com";
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/landing", "/login"],
        disallow: [
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
          "/api/",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
