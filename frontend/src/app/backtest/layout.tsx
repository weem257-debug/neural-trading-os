import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Strategie-Backtesting — Neural Trading OS",
  description:
    "KI-Handelsstrategien auf historischen Daten testen: Walk-Forward-Validierung, Monte-Carlo-Simulation, Sharpe/Sortino-Ratios und Drawdown-Analyse.",
  openGraph: {
    title: "KI Strategie-Backtesting — Neural Trading OS",
    description: "Walk-Forward-Validierung, Monte-Carlo-Simulation und Multi-Strategie-Vergleich für KI-Handelssignale.",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "KI-Backtesting — Neural Trading OS",
    description: "Walk-Forward-Validierung + Monte-Carlo-Simulation für KI-Handelsstrategien.",
  },
};

export default function BacktestLayout({ children }: { children: React.ReactNode }) {
  return children;
}
