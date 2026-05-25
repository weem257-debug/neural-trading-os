import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing — Neural Trading OS",
  description:
    "Simple, transparent pricing for AI-powered trading. Basic €29/mo · Pro €99/mo · Institutional €299/mo. 9 AI engines, live Claude signals, real-time WebSocket dashboard. 14-day free trial.",
  openGraph: {
    title: "Pricing — Neural Trading OS",
    description:
      "Basic €29 · Pro €99 · Institutional €299. 9 AI trading engines, Claude Sonnet 4.6 signals, real-time WebSocket dashboard. 14-day free trial.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Pricing — Neural Trading OS",
    description: "Basic €29 · Pro €99 · Institutional €299. AI-powered trading cockpit with live Claude signals.",
  },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
