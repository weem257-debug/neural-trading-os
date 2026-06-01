import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "KI-Handelssignale — Neural Trading OS",
  description:
    "Live Claude Sonnet 4.6 Handelssignale: KAUF/VERKAUF/HALTEN für Aktien und Krypto. Multi-Agenten-Konsens aus Fundamental-, Technisch-, Sentiment- und Risiko-Engines.",
  openGraph: {
    title: "Live KI-Handelssignale — Neural Trading OS",
    description: "10 Signale/Tag aus Claude Multi-Agenten-Konsens. Fundamental + Technisch + Sentiment + Risiko.",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "KI-Handelssignale — Neural Trading OS",
    description: "Live Claude Sonnet 4.6 Signale: KAUF/VERKAUF/HALTEN mit Konfidenzwerten und Kurszielen.",
  },
};

export default function SignalsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
