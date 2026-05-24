import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/ui/Sidebar";
import { TickerBar } from "@/components/ui/TickerBar";
import { ParticleBackground } from "@/components/ui/ParticleBackground";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { ShortcutsProvider } from "@/components/ui/ShortcutsProvider";
import { Notifications } from "@/components/ui/Notifications";
import { AuthGuard } from "@/components/ui/AuthGuard";
import { I18nProvider } from "@/i18n/context";
import { PricesProvider } from "@/components/ui/PricesProvider";

export const metadata: Metadata = {
  title: "Neural Trading OS — AI-Powered Trading Dashboard",
  description:
    "Unified AI trading cockpit: 9 engines, real-time signals, backtesting, paper trading. Built with Claude Sonnet 4.6.",
  keywords: [
    "AI trading",
    "algorithmic trading",
    "LLM trading",
    "trading dashboard",
    "backtesting",
    "paper trading",
  ],
  openGraph: {
    title: "Neural Trading OS",
    description: "AI-powered unified trading dashboard — 9 engines, one cockpit",
    type: "website",
    siteName: "Neural Trading OS",
  },
  twitter: {
    card: "summary_large_image",
    title: "Neural Trading OS",
    description: "AI-powered unified trading dashboard — 9 engines, one cockpit",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-base text-slate-200 min-h-screen overflow-hidden">
        {/* Neural grid background */}
        <div className="fixed inset-0 bg-neural-grid opacity-60 pointer-events-none z-0" />

        {/* Radial glow accents */}
        <div
          className="fixed inset-0 pointer-events-none z-0"
          style={{
            background:
              "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(0,212,255,0.08) 0%, transparent 60%), " +
              "radial-gradient(ellipse 60% 40% at 90% 90%, rgba(123,47,255,0.06) 0%, transparent 50%)",
          }}
        />

        {/* Particle background (client component) */}
        <ParticleBackground />

        {/* Global keyboard shortcuts + modal */}
        <ShortcutsProvider />

        {/* Live price bridge: WS "prices" channel → tradingStore.prices */}
        <PricesProvider />

        {/* Toast notification system */}
        <Notifications />

        {/* i18n provider — wraps all children for DE/EN support */}
        <I18nProvider>
          <div className="relative z-10 flex h-screen overflow-hidden">
            {/* Left Sidebar */}
            <ErrorBoundary>
              <Sidebar />
            </ErrorBoundary>

            {/* Main content area */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Live Ticker Bar */}
              <ErrorBoundary>
                <TickerBar />
              </ErrorBoundary>

              {/* Page content — each page wrapped individually */}
              <main className="flex-1 overflow-y-auto p-5">
                <ErrorBoundary>
                  <AuthGuard>
                    {children}
                  </AuthGuard>
                </ErrorBoundary>
              </main>
            </div>
          </div>
        </I18nProvider>
      </body>
    </html>
  );
}
