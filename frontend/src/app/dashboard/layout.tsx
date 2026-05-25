import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Trading Dashboard — Neural Trading OS",
  description:
    "AI-powered trading cockpit: live portfolio tracking, real-time signals, risk gauges, WebSocket prices and neural agent activity — all in one unified dashboard.",
  openGraph: {
    title: "AI Trading Dashboard — Neural Trading OS",
    description: "Unified cockpit for AI trading: live portfolio, signals, risk and WebSocket market data.",
    type: "website",
  },
  robots: { index: false, follow: false },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
