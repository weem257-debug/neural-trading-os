import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Depot — Neural Trading OS",
  description: "Alle Depots an einem Ort: Multi-Portfolio-Übersicht, P2P-Kredite (Mintos, Bondora, PeerBerry), Broker-Depots und konsolidiertes Nettovermögen.",
  robots: { index: false, follow: false },
};

export default function DepotLayout({ children }: { children: React.ReactNode }) {
  return children;
}
