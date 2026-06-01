import type { MetadataRoute } from "next";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ??
  process.env.BACKEND_URL ??
  "http://localhost:8000";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://neuraltrading.io";

  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${base}/landing`,             lastModified: new Date(), changeFrequency: "weekly",  priority: 1.0 },
    { url: `${base}/pricing`,             lastModified: new Date(), changeFrequency: "monthly", priority: 0.9 },
    { url: `${base}/signals/marketplace`, lastModified: new Date(), changeFrequency: "daily",   priority: 0.9 },
    { url: `${base}/performance`,         lastModified: new Date(), changeFrequency: "daily",   priority: 0.85 },
    { url: `${base}/register`,            lastModified: new Date(), changeFrequency: "yearly",  priority: 0.8 },
    { url: `${base}/login`,               lastModified: new Date(), changeFrequency: "yearly",  priority: 0.3 },
    { url: `${base}/impressum`,           lastModified: new Date(), changeFrequency: "yearly",  priority: 0.2 },
    { url: `${base}/datenschutz`,         lastModified: new Date(), changeFrequency: "yearly",  priority: 0.2 },
    { url: `${base}/agb`,                 lastModified: new Date(), changeFrequency: "yearly",  priority: 0.2 },
  ];

  // Long-tail: include public signal-view pages so they get indexed.
  // Resilient — any failure falls back to the static entries only.
  let signalEntries: MetadataRoute.Sitemap = [];
  try {
    const res = await fetch(`${API_BASE}/api/signals/?limit=100`, {
      next: { revalidate: 3600 },
    });
    if (res.ok) {
      const signals = (await res.json()) as Array<{ id?: string; generated_at?: string }>;
      signalEntries = signals
        .filter((s) => typeof s.id === "string" && s.id.length > 0)
        .map((s) => ({
          url: `${base}/signals/view/${s.id}`,
          lastModified: s.generated_at ? new Date(s.generated_at) : new Date(),
          changeFrequency: "weekly" as const,
          priority: 0.6,
        }));
    }
  } catch {
    // fall through to static entries only
  }

  return [...staticEntries, ...signalEntries];
}
