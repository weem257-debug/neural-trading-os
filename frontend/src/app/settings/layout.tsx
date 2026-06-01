import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Einstellungen — Neural Trading OS",
  description: "Neural Trading OS Account, API-Keys, Benachrichtigungseinstellungen und Trading-Parameter konfigurieren.",
  robots: { index: false, follow: false },
};

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
