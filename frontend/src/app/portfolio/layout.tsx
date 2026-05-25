import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Portfolio Tracker — Neural Trading OS",
  description:
    "Real-time AI-powered portfolio tracking: P&L, Sharpe ratio, drawdown analysis, position sizing and allocation — all in one unified trading dashboard.",
  openGraph: {
    title: "AI Portfolio Tracker — Neural Trading OS",
    description: "Track positions, P&L, Sharpe ratio and drawdown with real-time AI analysis.",
    type: "website",
  },
};

export default function PortfolioLayout({ children }: { children: React.ReactNode }) {
  return children;
}
