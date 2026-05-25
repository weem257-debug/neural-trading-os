import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Net Worth Tracker — Neural Trading OS",
  description:
    "Unified net worth dashboard: trading portfolio, P2P lending, cash and crypto — all aggregated in real time with AI-powered insights.",
  openGraph: {
    title: "Net Worth Tracker — Neural Trading OS",
    description: "Aggregate trading, P2P, crypto and cash into one real-time net worth view.",
    type: "website",
  },
  robots: { index: false, follow: false },
};

export default function NetWorthLayout({ children }: { children: React.ReactNode }) {
  return children;
}
