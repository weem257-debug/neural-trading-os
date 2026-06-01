import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "P2P-Portfolio — Neural Trading OS",
  description:
    "P2P-Lending-Portfolio aggregieren über Mintos, Bondora und PeerBerry. Investiertes Kapital, Zinsen, Ausfallrate und NAR in Echtzeit verfolgen.",
  openGraph: {
    title: "P2P-Lending-Portfolio — Neural Trading OS",
    description: "Mintos, Bondora und PeerBerry in einem Dashboard aggregieren. Echtzeit NAR, Ausfälle und Zinstracking.",
    type: "website",
  },
};

export default function P2PLayout({ children }: { children: React.ReactNode }) {
  return children;
}
