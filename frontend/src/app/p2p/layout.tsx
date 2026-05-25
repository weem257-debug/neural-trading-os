import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "P2P Portfolio Tracker — Neural Trading OS",
  description:
    "Aggregate P2P lending portfolio across Mintos, Bondora and PeerBerry. Track invested capital, interest earned, default rate and net annual return in real time.",
  openGraph: {
    title: "P2P Lending Portfolio — Neural Trading OS",
    description: "Aggregate Mintos, Bondora and PeerBerry in one dashboard. Real-time NAR, defaults and interest tracking.",
    type: "website",
  },
};

export default function P2PLayout({ children }: { children: React.ReactNode }) {
  return children;
}
