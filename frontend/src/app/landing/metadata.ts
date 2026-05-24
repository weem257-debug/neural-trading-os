import type { Metadata } from "next";

export const landingMetadata: Metadata = {
  title: "Neural Trading OS — AI-Powered Trading Dashboard",
  description:
    "Unified AI trading cockpit: 9 engines, real-time signals, backtesting, paper trading. Built with Claude Sonnet 4.6.",
  keywords: [
    "AI trading",
    "algorithmic trading",
    "LLM trading",
    "trading dashboard",
    "backtesting",
    "paper trading",
    "TradingAgents",
    "FinGPT",
    "Jesse",
    "Nautilus Trader",
    "quantitative trading",
  ],
  openGraph: {
    title: "Neural Trading OS — AI-Powered Trading Dashboard",
    description:
      "AI-powered unified trading dashboard — 9 engines, one cockpit. Real-time signals, backtesting, risk management.",
    type: "website",
    siteName: "Neural Trading OS",
  },
  twitter: {
    card: "summary_large_image",
    title: "Neural Trading OS",
    description:
      "AI-powered unified trading dashboard — 9 engines, one cockpit",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
};
