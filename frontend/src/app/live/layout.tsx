import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Live-Markt-Analyse — Neural Trading OS",
  description:
    "Live-Marktanalyse in Echtzeit: Watchlist-Verwaltung, Preis- und Indikator-Kacheln (RSI, MACD, Bollinger, SMA, ATR), Regime-Erkennung, KI-Signal und TradingView-Chart.",
  openGraph: {
    title: "Live-Markt-Analyse — Neural Trading OS",
    description: "Watchlist, Live-Indikatoren, Marktregime und Signal in Echtzeit — mit TradingView-Chart.",
    type: "website",
  },
};

export default function LiveAnalysisLayout({ children }: { children: React.ReactNode }) {
  return children;
}
