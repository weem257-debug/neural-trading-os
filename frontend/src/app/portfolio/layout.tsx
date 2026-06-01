import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Portfolio-Tracker — Neural Trading OS",
  description:
    "Echtzeit KI-Portfolio-Tracking: P&L, Sharpe-Ratio, Drawdown-Analyse, Positionsgrößen und Allokation — alles in einem Trading-Dashboard.",
  openGraph: {
    title: "KI-Portfolio-Tracker — Neural Trading OS",
    description: "Positionen, P&L, Sharpe-Ratio und Drawdown mit Echtzeit-KI-Analyse verfolgen.",
    type: "website",
  },
};

export default function PortfolioLayout({ children }: { children: React.ReactNode }) {
  return children;
}
