import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Trading Dashboard — Neural Trading OS",
  description:
    "KI-Trading Cockpit: Live Portfolio-Tracking, Echtzeit-Signale, Risikoanzeigen, WebSocket-Kurse und KI-Agenten-Aktivität — alles in einem Dashboard.",
  openGraph: {
    title: "KI-Trading Dashboard — Neural Trading OS",
    description: "Unified Cockpit für KI-Trading: Live Portfolio, Signale, Risiko und WebSocket Marktdaten.",
    type: "website",
  },
  robots: { index: false, follow: false },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
