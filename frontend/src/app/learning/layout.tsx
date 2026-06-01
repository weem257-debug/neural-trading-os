import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "KI-Lernzentrum — Neural Trading OS",
  description:
    "KI-kuratiertes Trading-Wissen: YouTube-Video-Insights, Trade-Retrospektiven und Musterlern-System — powered by Claude Sonnet 4.6.",
  openGraph: {
    title: "KI-Lernzentrum — Neural Trading OS",
    description: "YouTube-Insights + Trade-Retrospektiven, kuratiert von Claude AI.",
    type: "website",
  },
  robots: { index: false, follow: false },
};

export default function LearningLayout({ children }: { children: React.ReactNode }) {
  return children;
}
