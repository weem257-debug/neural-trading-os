import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mein Konto — Neural Trading OS",
  description: "Kontoinformationen, Abonnement-Tier und Signal-Nutzung.",
  robots: { index: false, follow: false },
};

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return children;
}
