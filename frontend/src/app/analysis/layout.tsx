import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Marktanalyse — Neural Trading OS",
  description:
    "Tiefe KI-Marktanalyse: Multi-Timeframe-Muster, Earnings-Impact-Scoring, Sektorrotations-Signale und Makro-Overlay — powered by Claude Sonnet 4.6.",
  openGraph: {
    title: "KI-Marktanalyse — Neural Trading OS",
    description: "Multi-Timeframe-Technicals, Earnings-Scoring, Sektorrotation und Makro-Overlay.",
    type: "website",
  },
};

export default function AnalysisLayout({ children }: { children: React.ReactNode }) {
  return children;
}
