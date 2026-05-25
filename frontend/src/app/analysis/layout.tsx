import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Market Analysis — Neural Trading OS",
  description:
    "Deep AI market analysis: multi-timeframe technical patterns, earnings impact scoring, sector rotation signals and macro overlay — powered by Claude Sonnet 4.6.",
  openGraph: {
    title: "AI Market Analysis — Neural Trading OS",
    description: "Multi-timeframe technicals, earnings scoring, sector rotation and macro overlay.",
    type: "website",
  },
};

export default function AnalysisLayout({ children }: { children: React.ReactNode }) {
  return children;
}
