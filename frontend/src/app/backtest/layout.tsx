import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Strategy Backtesting — Neural Trading OS",
  description:
    "Backtest AI trading strategies on historical data: walk-forward validation, Monte Carlo simulation, Sharpe/Sortino ratios and drawdown analytics.",
  openGraph: {
    title: "AI Strategy Backtesting — Neural Trading OS",
    description: "Walk-forward validation, Monte Carlo simulation and multi-strategy comparison for AI-generated trading signals.",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "AI Backtesting — Neural Trading OS",
    description: "Walk-forward validation + Monte Carlo simulation for AI trading strategies.",
  },
};

export default function BacktestLayout({ children }: { children: React.ReactNode }) {
  return children;
}
