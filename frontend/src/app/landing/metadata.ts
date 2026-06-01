import type { Metadata } from "next";

export const landingMetadata: Metadata = {
  title: "Neural Trading OS — KI-Trading Dashboard",
  description:
    "KI-Trading Cockpit mit 9 Engines: Echtzeit-Signale, Backtesting, Paper Trading. Entwickelt mit Claude Sonnet 4.6. Free Plan verfügbar.",
  keywords: [
    "KI Trading",
    "algorithmisches Trading",
    "KI Handelssignale",
    "Trading Dashboard",
    "Backtesting",
    "Paper Trading",
    "TradingAgents",
    "FinGPT",
    "Jesse",
    "Nautilus Trader",
    "quantitatives Trading",
  ],
  openGraph: {
    title: "Neural Trading OS — KI-Trading Dashboard",
    description:
      "KI-gestütztes Trading Dashboard — 9 Engines, ein Cockpit. Echtzeit-Signale, Backtesting, Risikomanagement.",
    type: "website",
    siteName: "Neural Trading OS",
  },
  twitter: {
    card: "summary_large_image",
    title: "Neural Trading OS",
    description:
      "KI-gestütztes Trading Dashboard — 9 Engines, ein Cockpit",
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
