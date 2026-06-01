import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AGB — Neural Trading OS",
  description: "Allgemeine Geschäftsbedingungen für Neural Trading OS. Nutzungsbedingungen, Haftungsausschluss und WpHG-Disclaimer.",
  robots: { index: true, follow: false },
};

export default function AgbLayout({ children }: { children: React.ReactNode }) {
  return children;
}
