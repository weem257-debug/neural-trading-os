import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Multi-Portfolio-Übersicht — Neural Trading OS",
  description: "Mehrere Trading-Portfolios verwalten und vergleichen — mit KI-gestützter Allokationsanalyse und portfolio-übergreifender Risikobewertung.",
  robots: { index: false, follow: false },
};

export default function PortfoliosLayout({ children }: { children: React.ReactNode }) {
  return children;
}
