import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Risikomanagement — Neural Trading OS",
  description:
    "KI-gestütztes Risikomanagement: Echtzeit-Drawdown-Monitoring, VaR-Berechnung, Positionsgrößen, Stop-Loss-Automation und Portfolio-Stress-Tests.",
  openGraph: {
    title: "KI-Risikomanagement — Neural Trading OS",
    description: "Echtzeit-Drawdown, VaR, Positionsgrößen und Stress-Tests für algorithmisches Trading.",
    type: "website",
  },
};

export default function RiskLayout({ children }: { children: React.ReactNode }) {
  return children;
}
