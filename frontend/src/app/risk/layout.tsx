import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Risk Management — Neural Trading OS",
  description:
    "AI-powered risk management: real-time drawdown monitoring, VaR calculation, position sizing, stop-loss automation and portfolio stress testing.",
  openGraph: {
    title: "AI Risk Management — Neural Trading OS",
    description: "Real-time drawdown, VaR, position sizing and stress testing for algorithmic trading.",
    type: "website",
  },
};

export default function RiskLayout({ children }: { children: React.ReactNode }) {
  return children;
}
