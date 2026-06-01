import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Datenschutzerklärung — Neural Trading OS",
  description: "Datenschutzerklärung gemäß DSGVO für Neural Trading OS. Informationen zur Verarbeitung personenbezogener Daten.",
  robots: { index: true, follow: false },
};

export default function DatenschutzLayout({ children }: { children: React.ReactNode }) {
  return children;
}
