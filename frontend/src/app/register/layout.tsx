import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Registrieren — Neural Trading OS",
  description: "Kostenloses Konto erstellen. Sofortiger Zugang zu KI-Handelssignalen, Paper Trading und Portfolio-Tracking.",
  robots: { index: true, follow: true },
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
