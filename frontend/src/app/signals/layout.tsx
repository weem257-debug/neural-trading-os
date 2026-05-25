import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Trading Signals — Neural Trading OS",
  description:
    "Live Claude Sonnet 4.6 trading signals: BUY/SELL/HOLD for stocks and crypto. Multi-agent consensus from Fundamental, Technical, Sentiment and Risk engines.",
  openGraph: {
    title: "Live AI Trading Signals — Neural Trading OS",
    description: "10 signals/day from Claude multi-agent consensus. Fundamental + Technical + Sentiment + Risk engines.",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "AI Trading Signals — Neural Trading OS",
    description: "Live Claude Sonnet 4.6 signals: BUY/SELL/HOLD with confidence scores and price targets.",
  },
};

export default function SignalsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
