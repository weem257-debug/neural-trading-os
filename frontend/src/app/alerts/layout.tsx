import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Preis-Alerts — Neural Trading OS",
  description: "Echtzeit-Preis-Alerts für Aktien und Krypto konfigurieren — mit KI-gestützten Schwellenwert-Empfehlungen.",
  robots: { index: false, follow: false },
};

export default function AlertsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
