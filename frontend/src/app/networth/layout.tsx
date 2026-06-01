import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Vermögensübersicht — Neural Trading OS",
  description:
    "Unified Vermögens-Dashboard: Trading-Portfolio, P2P-Lending, Cash und Krypto — alles in Echtzeit aggregiert mit KI-gestützten Insights.",
  openGraph: {
    title: "Vermögensübersicht — Neural Trading OS",
    description: "Trading, P2P, Krypto und Cash in einer Echtzeit-Vermögensübersicht aggregieren.",
    type: "website",
  },
  robots: { index: false, follow: false },
};

export default function NetWorthLayout({ children }: { children: React.ReactNode }) {
  return children;
}
