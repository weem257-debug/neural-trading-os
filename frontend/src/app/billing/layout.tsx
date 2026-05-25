import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Billing & Subscription — Neural Trading OS",
  description:
    "Manage your Neural Trading OS subscription. Upgrade to Pro (€99/mo) for 50 AI signals/day, or add Signal Marketplace access at €19/mo.",
  robots: { index: false, follow: false },
};

export default function BillingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
