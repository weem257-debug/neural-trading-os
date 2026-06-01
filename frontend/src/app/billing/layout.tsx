import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Abonnement & Abrechnung — Neural Trading OS",
  description:
    "Neural Trading OS Abonnement verwalten. Upgrade auf Pro (€99/Monat) für 50 KI-Signale täglich, oder Signal-Marktplatz-Zugang ab €19/Monat.",
  robots: { index: false, follow: false },
};

export default function BillingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
