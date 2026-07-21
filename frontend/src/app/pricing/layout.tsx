import type { Metadata } from "next";

const SITE_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://neuraltrading.io";

export const metadata: Metadata = {
  alternates: { canonical: "/pricing" }, // F-08: self-referential canonical
  title: "Preise — Neural Trading OS",
  description:
    "Transparente Preise für KI-gestütztes Trading. Basic €29/mo · Pro €99/mo · Institutional €299/mo. 9 KI-Engines, Live Claude-Signale, Echtzeit-WebSocket-Dashboard. Kostenlos starten.",
  openGraph: {
    title: "Preise — Neural Trading OS",
    description:
      "Basic €29 · Pro €99 · Institutional €299. 9 KI-Trading-Engines, Claude Sonnet 4.6 Signale, Echtzeit-WebSocket-Dashboard. Free Plan verfügbar.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Preise — Neural Trading OS",
    description: "Basic €29 · Pro €99 · Institutional €299. KI-Trading-Cockpit mit Live Claude-Signalen. Free Plan verfügbar.",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      "@id": `${SITE_URL}/pricing#software`,
      "name": "Neural Trading OS",
      "applicationCategory": "FinanceApplication",
      "url": `${SITE_URL}/pricing`,
      "offers": [
        {
          "@type": "Offer",
          "name": "Free Plan",
          "price": "0",
          "priceCurrency": "EUR",
          "description": "3 KI-Signale täglich, Paper Trading, Portfolio-Tracking — dauerhaft kostenlos.",
          "availability": "https://schema.org/InStock",
          "url": `${SITE_URL}/login`,
        },
        {
          "@type": "Offer",
          "name": "Basic Plan",
          "price": "29.00",
          "priceCurrency": "EUR",
          "priceSpecification": {
            "@type": "UnitPriceSpecification",
            "price": "29.00",
            "priceCurrency": "EUR",
            "unitText": "Monat",
          },
          "description": "10 KI-Signale täglich, Backtesting, Broker-Integration.",
          "availability": "https://schema.org/InStock",
          "url": `${SITE_URL}/billing`,
        },
        {
          "@type": "Offer",
          "name": "Pro Plan",
          "price": "99.00",
          "priceCurrency": "EUR",
          "priceSpecification": {
            "@type": "UnitPriceSpecification",
            "price": "99.00",
            "priceCurrency": "EUR",
            "unitText": "Monat",
          },
          "description": "50 KI-Signale täglich, alle Broker, P2P-Tracking, Telegram-Alerts.",
          "availability": "https://schema.org/InStock",
          "url": `${SITE_URL}/billing`,
        },
      ],
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Gibt es eine kostenlose Testversion?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Nein, wir bieten keinen zeitlich begrenzten Test an. Stattdessen gibt es einen dauerhaft kostenlosen Free Plan mit 3 KI-Signalen täglich, Paper Trading und Portfolio-Tracking — ohne Kreditkarte und ohne Zeitlimit.",
          },
        },
        {
          "@type": "Question",
          "name": "Kann ich jederzeit kündigen?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Ja. Keine Mindestlaufzeit, keine Kündigungsgebühren. Sie können Ihr Abonnement jederzeit im Billing-Bereich kündigen. Die Kündigung wird zum Ende des aktuellen Abrechnungszeitraums wirksam.",
          },
        },
        {
          "@type": "Question",
          "name": "Sind die Signale eine Anlageberatung?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Nein. Alle KI-generierten Signale sind rein informativer Natur und stellen keine Anlageberatung nach WpHG dar. Investitionsentscheidungen treffen Sie eigenverantwortlich. Vergangene Signalperformance ist kein Indikator für zukünftige Ergebnisse.",
          },
        },
        {
          "@type": "Question",
          "name": "Was ist im Free Plan enthalten?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Der Free Plan enthält 3 KI-Handelssignale pro Tag, Paper-Trading-Modus, Portfolio-Tracking, Echtzeit WebSocket-Kurse und Zugang zum Signal-Marktplatz (Lesezugriff). Kein Ablaufdatum, keine Kreditkarte erforderlich.",
          },
        },
        {
          "@type": "Question",
          "name": "Wie werden die Signale generiert?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Alle Signale werden von Claude Sonnet 4.6 (Anthropic) mittels Multi-Agenten-Konsens generiert. 5 spezialisierte KI-Agenten (Fundamental-, Technisch-, Sentiment-, Makro-, Risiko-Agent) analysieren unabhängig voneinander und stimmen über das finale Signal ab.",
          },
        },
      ],
    },
  ],
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
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
