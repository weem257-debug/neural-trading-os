import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Settings — Neural Trading OS",
  description: "Configure your Neural Trading OS account, API keys, notification preferences and trading parameters.",
  robots: { index: false, follow: false },
};

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
