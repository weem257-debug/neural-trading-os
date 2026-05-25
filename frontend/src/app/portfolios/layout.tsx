import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Multi-Portfolio Overview — Neural Trading OS",
  description: "Manage and compare multiple trading portfolios with AI-powered allocation analysis and cross-portfolio risk assessment.",
  robots: { index: false, follow: false },
};

export default function PortfoliosLayout({ children }: { children: React.ReactNode }) {
  return children;
}
