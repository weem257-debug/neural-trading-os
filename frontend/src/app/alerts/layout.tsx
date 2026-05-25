import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Price Alerts — Neural Trading OS",
  description: "Configure real-time price alerts for stocks and crypto with AI-powered threshold recommendations.",
  robots: { index: false, follow: false },
};

export default function AlertsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
