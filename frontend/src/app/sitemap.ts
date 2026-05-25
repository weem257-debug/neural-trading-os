import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ??
    "https://frontend-production-8a00.up.railway.app";

  return [
    { url: `${base}/landing`,                   lastModified: new Date(), changeFrequency: "weekly",  priority: 1.0 },
    { url: `${base}/pricing`,                   lastModified: new Date(), changeFrequency: "monthly", priority: 0.9 },
    { url: `${base}/signals/marketplace`,       lastModified: new Date(), changeFrequency: "daily",   priority: 0.9 },
    { url: `${base}/dashboard`,                 lastModified: new Date(), changeFrequency: "weekly",  priority: 0.8 },
    { url: `${base}/signals`,                   lastModified: new Date(), changeFrequency: "daily",   priority: 0.8 },
    { url: `${base}/portfolio`,                 lastModified: new Date(), changeFrequency: "weekly",  priority: 0.7 },
    { url: `${base}/risk`,                      lastModified: new Date(), changeFrequency: "weekly",  priority: 0.7 },
    { url: `${base}/backtest`,                  lastModified: new Date(), changeFrequency: "weekly",  priority: 0.6 },
    { url: `${base}/p2p`,                       lastModified: new Date(), changeFrequency: "weekly",  priority: 0.6 },
    { url: `${base}/sentiment`,                 lastModified: new Date(), changeFrequency: "daily",   priority: 0.6 },
    { url: `${base}/billing`,                   lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/login`,                     lastModified: new Date(), changeFrequency: "yearly",  priority: 0.3 },
  ];
}
