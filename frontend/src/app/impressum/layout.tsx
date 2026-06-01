import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Impressum — Neural Trading OS",
  description: "Impressum und Anbieterkennzeichnung gemäß § 5 TMG für Neural Trading OS.",
  robots: { index: true, follow: false },
};

export default function ImpressumLayout({ children }: { children: React.ReactNode }) {
  return children;
}
