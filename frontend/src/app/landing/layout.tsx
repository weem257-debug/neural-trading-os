import type { Metadata } from "next";
import { landingMetadata } from "./metadata";

const SITE_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://neuraltrading.io";

export const metadata: Metadata = landingMetadata;

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      "@id": `${SITE_URL}/#software`,
      "name": "Neural Trading OS",
      "applicationCategory": "FinanceApplication",
      "operatingSystem": "Web, Android",
      "description":
        "KI-gestütztes Trading Dashboard mit 9 Engines: TradingAgents, Jesse, FinGPT, Qlib, Nautilus Trader und mehr. Live Claude Sonnet 4.6 Signale, Echtzeit WebSocket-Kurse, Backtesting und P2P-Portfolio-Tracking.",
      "url": SITE_URL,
      "offers": {
        "@type": "Offer",
        "price": "0",
        "priceCurrency": "EUR",
        "name": "Free Plan",
        "description": "3 KI-Signale täglich, Paper Trading, Portfolio-Tracking — kostenlos und dauerhaft.",
      },
      "featureList": [
        "KI-Handelssignale (Claude Sonnet 4.6)",
        "Multi-Agenten-Konsens (Fundamental, Technisch, Sentiment, Risiko)",
        "Echtzeit WebSocket-Kurse",
        "Paper Trading & Order-Ausführung",
        "Portfolio-Tracking (Aktien, Krypto, P2P)",
        "Strategie-Backtesting",
        "Telegram-Alerts",
        "Risikomanagement & VaR",
      ],
    },
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#org`,
      "name": "Neural Trading OS",
      "url": SITE_URL,
      "contactPoint": {
        "@type": "ContactPoint",
        "email": "support@neural-trading-os.de",
        "contactType": "Kundendienst",
        "availableLanguage": "Deutsch",
      },
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      "url": SITE_URL,
      "name": "Neural Trading OS",
      "publisher": { "@id": `${SITE_URL}/#org` },
      "inLanguage": "de-DE",
    },
    {
      "@type": "FAQPage",
      "@id": `${SITE_URL}/#faq`,
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Ist Neural Trading OS wirklich kostenlos?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Ja — der Free-Plan ist dauerhaft kostenlos. Du bekommst 3 KI-Signale pro Tag, Backtesting und das Portfolio-Dashboard ohne Kreditkarte. Upgrades auf Basic (€29/Monat) oder Pro (€99/Monat) schalten mehr Signale und erweiterte Features frei.",
          },
        },
        {
          "@type": "Question",
          "name": "Sind die Signale echte Handelsempfehlungen?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Nein. Die Signale sind KI-generierte Analyseergebnisse zu Informationszwecken — keine Anlageberatung im Sinne des WpHG. Jede Handelsentscheidung triffst du eigenverantwortlich.",
          },
        },
        {
          "@type": "Question",
          "name": "Welche Broker und Märkte werden unterstützt?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Aktien, ETFs, Krypto-Assets und Forex. Für Paper-Trading ist kein Broker nötig. Live-Trading verbindet sich mit Alpaca und gängigen Krypto-Exchanges. Deutsche Broker (Flatex, comdirect, Trade Republic) können als Datenbasis eingebunden werden.",
          },
        },
        {
          "@type": "Question",
          "name": "Wie funktioniert die KI-Analyse genau?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Mehrere spezialisierte KI-Agenten (Fundamental-, Technisch-, Sentiment- und Risikoanalyst) analysieren den Ticker unabhängig. Ein Supervisor-Agent aggregiert die Ergebnisse zu einem finalen Signal mit Konfidenzwert und Begründung.",
          },
        },
        {
          "@type": "Question",
          "name": "Sind meine Daten sicher?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Zugangsdaten werden verschlüsselt (bcrypt) gespeichert. API-Keys für Broker verbleiben lokal im Browser. Das System ist DSGVO-konform — du kannst dein Konto und alle Daten jederzeit löschen.",
          },
        },
        {
          "@type": "Question",
          "name": "Kann ich das System auf meinen eigenen Server deployen?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Ja. Neural Trading OS kann mit Docker auf eigener Infrastruktur betrieben werden. Backend (FastAPI) und Frontend (Next.js) sind vollständig selbst-hostbar.",
          },
        },
      ],
    },
  ],
};

export default function LandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {children}
    </>
  );
}
