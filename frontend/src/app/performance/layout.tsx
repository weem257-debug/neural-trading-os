import type { Metadata } from "next";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://neuraltrading.io";

export const metadata: Metadata = {
  title: "KI-Signal Performance — Neural Trading OS",
  description:
    "Transparente Auswertung aller KI-generierten Handelssignale: Trefferquote, Durchschnittsrendite und beste Performer. Echte Daten — kein Marketing.",
  keywords: [
    "KI Trading Signale Performance",
    "Handelssignale Trefferquote",
    "Algorithmisches Trading Deutschland",
    "AI Trading Signals Backtesting",
    "Neural Trading Auswertung",
  ],
  alternates: { canonical: `${APP_URL}/performance` },
  openGraph: {
    title: "KI-Signal Performance — Neural Trading OS",
    description:
      "Trefferquote, Durchschnittsrendite und beste KI-Handelssignale. Live-Daten aus dem System.",
    type: "website",
    url: `${APP_URL}/performance`,
  },
  robots: { index: true, follow: true },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      "name": "Neural Trading OS",
      "applicationCategory": "FinanceApplication",
      "operatingSystem": "Web",
      "description":
        "KI-gestütztes Handelssystem mit Multi-Agenten-Konsens, Elliott-Wave-Analyse und Live-Performance-Tracking.",
      "url": APP_URL,
      "offers": {
        "@type": "Offer",
        "price": "0",
        "priceCurrency": "EUR",
        "description": "Kostenloser Free Plan mit 3 KI-Signalen täglich",
      },
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Wie wird die Trefferquote berechnet?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text":
              "Jedes KI-Signal wird 24 Stunden nach der Generierung gegen die tatsächliche Kursentwicklung ausgewertet. Signale mit positivem Return zählen als Treffer. Die Trefferquote ist der Anteil dieser Signale an allen ausgewerteten Signalen.",
          },
        },
        {
          "@type": "Question",
          "name": "Wie viele KI-Agenten analysieren ein Signal?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text":
              "9 spezialisierte KI-Modelle analysieren gleichzeitig: technische Indikatoren, Elliott-Wave-Muster, Sentiment-Daten, Fundamentaldaten und mehr. Claude Sonnet 4.6 aggregiert die Ergebnisse zu einem finalen Konsenssignal.",
          },
        },
        {
          "@type": "Question",
          "name": "Ist die gezeigte Performance garantiert?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text":
              "Nein. Die dargestellten Kennzahlen basieren auf historischen Auswertungen und stellen keine Anlageberatung dar. Vergangene Performance ist kein verlässlicher Indikator für zukünftige Ergebnisse (§ 85 WpHG).",
          },
        },
        {
          "@type": "Question",
          "name": "Kann ich die Signale kostenlos testen?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text":
              "Ja. Der Free Plan enthält 3 KI-Handelssignale täglich ohne Kreditkarte. Registrierung dauert unter 30 Sekunden.",
          },
        },
      ],
    },
  ],
};

export default function PerformanceLayout({ children }: { children: React.ReactNode }) {
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
