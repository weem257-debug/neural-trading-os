import type { Metadata } from "next";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ??
  process.env.BACKEND_URL ??
  "http://localhost:8000";

const DIR_LABEL: Record<string, string> = {
  BUY: "KAUFEN",
  STRONG_BUY: "STARK KAUFEN",
  SELL: "VERKAUFEN",
  STRONG_SELL: "STARK VERKAUFEN",
  HOLD: "HALTEN",
};

const DIR_EMOJI: Record<string, string> = {
  BUY: "📈",
  STRONG_BUY: "🚀",
  SELL: "📉",
  STRONG_SELL: "⚠️",
  HOLD: "⏸️",
};

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://neuraltrading.io";

  try {
    const res = await fetch(
      `${API_BASE}/api/signals/by-id/${encodeURIComponent(params.id)}`,
      { next: { revalidate: 3600 } }
    );

    if (res.ok) {
      const signal = await res.json();
      if (signal && signal.id) {
        const ticker: string = signal.ticker ?? "Signal";
        const direction: string = signal.direction ?? "HOLD";
        const confidence: number | null =
          signal.confidence != null ? Math.round(signal.confidence * 100) : null;
        const dirLabel = DIR_LABEL[direction] ?? direction;
        const emoji = DIR_EMOJI[direction] ?? "📊";
        const confStr = confidence != null ? ` · ${confidence}% Konfidenz` : "";

        const title = `${emoji} ${ticker} ${dirLabel}${confStr} | Neural Trading OS`;
        const description =
          `KI-Signal für ${ticker}: ${dirLabel}${confStr}. ` +
          `Elliott-Wave-Analyse, Multi-Agent-Konsens — Neural Trading OS.`;

        return {
          title,
          description,
          openGraph: {
            type: "article",
            siteName: "Neural Trading OS",
            title,
            description,
            url: `${appUrl}/signals/view/${params.id}`,
          },
          twitter: {
            card: "summary_large_image",
            site: "@NeuralTradingOS",
            title,
            description,
          },
          robots: { index: true, follow: true },
        };
      }
    }
  } catch {
    // fall through to default
  }

  return {
    title: "KI-Handelssignal | Neural Trading OS",
    description:
      "KI-generiertes Handelssignal von Neural Trading OS — Elliott-Wave-Analyse, Multi-Agent-Konsens und technische Tiefenanalyse.",
    openGraph: {
      type: "article",
      siteName: "Neural Trading OS",
      title: "KI-Handelssignal | Neural Trading OS",
      description:
        "KI-generiertes Handelssignal — Elliott-Wave + Multi-Agent-Konsens. Kostenlos starten.",
    },
    twitter: {
      card: "summary_large_image",
      site: "@NeuralTradingOS",
      title: "KI-Handelssignal | Neural Trading OS",
      description:
        "KI-generiertes Handelssignal — Elliott-Wave + Multi-Agent-Konsens. Kostenlos starten.",
    },
    robots: { index: true, follow: true },
  };
}

export default function SignalViewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
