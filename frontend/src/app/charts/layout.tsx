import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Charts — Neural Trading OS",
  description:
    "Kurscharts für Aktien, Indizes, Krypto, Forex und Rohstoffe: TradingView-Chart mit Indikatoren und Zeichenwerkzeugen, Watchlist als Kacheln oder Tabelle, kuratierter Marktbrowser.",
  openGraph: {
    title: "Charts — Neural Trading OS",
    description: "Chart, Watchlist und Marktbrowser an einem Ort.",
    type: "website",
  },
};

export default function ChartsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
