import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Sidebar } from "@/components/ui/Sidebar";
import { TickerBar } from "@/components/ui/TickerBar";
import { ParticleBackground } from "@/components/ui/ParticleBackground";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { ShortcutsProvider } from "@/components/ui/ShortcutsProvider";
import { Notifications } from "@/components/ui/Notifications";
import { AuthGuard } from "@/components/ui/AuthGuard";
import { UpgradeBanner } from "@/components/ui/UpgradeBanner";
import { I18nProvider } from "@/i18n/context";
import { PricesProvider } from "@/components/ui/PricesProvider";
import { CookieConsent } from "@/components/ui/CookieConsent";
import { OnboardingWizard } from "@/components/ui/OnboardingWizard";
import { TokenRefresher } from "@/components/ui/TokenRefresher";

const SITE_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://neuraltrading.io";

// viewport-fit=cover enables env(safe-area-inset-*) on iOS notch/Dynamic Island devices.
// Must be a separate export from metadata (Next.js 14+).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Neural Trading OS — KI-gestütztes Trading Dashboard",
  description:
    "KI-Trading Cockpit mit 9 Engines: Live Claude Sonnet 4.6 Signale, Echtzeit WebSocket-Kurse, Backtesting, Paper Trading und P2P-Portfolio-Tracking.",
  keywords: [
    "KI Trading", "algorithmisches Trading", "KI Handelssignale", "Trading Dashboard",
    "Claude AI Trading", "Backtesting", "Paper Trading", "TradingAgents",
    "Neural Trading", "Aktien Signale", "Krypto Signale",
  ],
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "NeuralOS",
  },
  // F-08: valid 1200x630 OG image (served by the app/opengraph-image route),
  // applied site-wide. Canonical URLs are set PER public route (not globally —
  // a global canonical would wrongly mark every page a duplicate of the homepage).
  openGraph: {
    title: "Neural Trading OS — KI-Trading Dashboard",
    description: "9 KI-Trading-Engines vereint: TradingAgents, Jesse, FinGPT, Qlib, Nautilus Trader und mehr. Live Claude Signale, Echtzeit WebSocket Dashboard.",
    type: "website",
    siteName: "Neural Trading OS",
    url: SITE_URL,
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Neural Trading OS — KI-Trading Dashboard",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Neural Trading OS — KI-Trading Dashboard",
    description: "9 KI-Engines, Live Claude Signale, WebSocket-Kurse, Backtesting. FastAPI + Next.js + PostgreSQL.",
    creator: "@weem257",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de" className="dark">
      <body className="bg-base text-slate-200 min-h-[100dvh]">
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

        {/* DSGVO Cookie-Consent-Banner */}
        <CookieConsent />

        {/* First-login onboarding wizard */}
        <OnboardingWizard />

        {/* Silent JWT auto-refresh (every 30 min, triggers 2h before expiry) */}
        <TokenRefresher />

        {/* i18n provider — wraps all children for DE/EN support */}
        <I18nProvider>
          <div
            className="relative z-10 flex h-[100dvh] overflow-hidden"
            style={{
              paddingTop: "env(safe-area-inset-top)",
              paddingBottom: "env(safe-area-inset-bottom)",
              paddingLeft: "env(safe-area-inset-left)",
              paddingRight: "env(safe-area-inset-right)",
            }}
          >
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
                    <UpgradeBanner />
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
