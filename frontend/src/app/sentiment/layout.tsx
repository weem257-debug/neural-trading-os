import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Market Sentiment Analysis — Neural Trading OS",
  description:
    "Live AI market sentiment: news NLP, social media scanning, fear & greed index and sector rotation signals — powered by Claude Sonnet 4.6.",
  openGraph: {
    title: "AI Sentiment Analysis — Neural Trading OS",
    description: "Real-time news NLP, social scanning and fear & greed index for smarter trading decisions.",
    type: "website",
  },
};

export default function SentimentLayout({ children }: { children: React.ReactNode }) {
  return children;
}
