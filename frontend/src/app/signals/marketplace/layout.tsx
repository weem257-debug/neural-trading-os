import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Signal Marketplace — Neural Trading OS",
  description:
    "Verified AI trading signals at €19/mo. Claude Sonnet 4.6 multi-agent consensus: Fundamental + Technical + Sentiment + Risk. Live track record — win rate, confidence, price targets.",
  openGraph: {
    title: "Signal Marketplace — Neural Trading OS",
    description:
      "€19/mo for 10 AI signals/day. TradingAgents multi-agent consensus with live track record. Win rate, price targets, stop-loss — all transparent.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Signal Marketplace — €19/mo",
    description: "10 verified AI trading signals/day. Claude Sonnet 4.6 multi-agent consensus. Live track record transparent.",
  },
};

export default function MarketplaceLayout({ children }: { children: React.ReactNode }) {
  return children;
}
