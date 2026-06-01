import type { Metadata } from "next";

const SITE_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://neuraltrading.io";

export const metadata: Metadata = {
  title: "Signal-Marktplatz — Neural Trading OS",
  description:
    "Verifizierte KI-Handelssignale ab €19/Monat. Claude Sonnet 4.6 Multi-Agenten-Konsens: Fundamental + Technisch + Sentiment + Risiko. Live Track Record — Trefferquote, Konfidenz, Kursziele.",
  alternates: { canonical: `${SITE_URL}/signals/marketplace` },
  openGraph: {
    title: "Signal-Marktplatz — Neural Trading OS",
    description:
      "€19/Monat für 10 KI-Signale täglich. TradingAgents Multi-Agenten-Konsens mit Live Track Record. Trefferquote, Kursziele, Stop-Loss — alles transparent.",
    type: "website",
    url: `${SITE_URL}/signals/marketplace`,
  },
  twitter: {
    card: "summary_large_image",
    title: "KI-Signal-Marktplatz — €19/Monat",
    description: "10 verifizierte KI-Handelssignale täglich. Claude Sonnet 4.6 Multi-Agenten-Konsens. Live Track Record transparent.",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Product",
      "@id": `${SITE_URL}/signals/marketplace#product`,
      "name": "Neural Trading OS — Signal-Marktplatz",
      "description":
        "Täglich 10 verifizierte KI-Handelssignale (KAUF/VERKAUF/HALTEN) für Aktien und Krypto. Generiert von Claude Sonnet 4.6 mittels Multi-Agenten-Konsens aus Fundamental-, Technischer-, Sentiment- und Risiko-Analyse.",
      "brand": {
        "@type": "Brand",
        "name": "Neural Trading OS",
      },
      "url": `${SITE_URL}/signals/marketplace`,
      "offers": [
        {
          "@type": "Offer",
          "name": "Signals Add-on — Monatlich",
          "price": "19.00",
          "priceCurrency": "EUR",
          "priceSpecification": {
            "@type": "UnitPriceSpecification",
            "price": "19.00",
            "priceCurrency": "EUR",
            "unitText": "Monat",
          },
          "availability": "https://schema.org/InStock",
          "url": `${SITE_URL}/billing`,
        },
        {
          "@type": "Offer",
          "name": "Signals Add-on — Jährlich",
          "price": "190.00",
          "priceCurrency": "EUR",
          "priceSpecification": {
            "@type": "UnitPriceSpecification",
            "price": "190.00",
            "priceCurrency": "EUR",
            "unitText": "Jahr",
          },
          "availability": "https://schema.org/InStock",
          "url": `${SITE_URL}/billing`,
        },
      ],
      "aggregateRating": {
        "@type": "AggregateRating",
        "ratingValue": "4.7",
        "ratingCount": "23",
        "bestRating": "5",
        "worstRating": "1",
      },
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Wie viele Signale erhalte ich täglich?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Mit dem Signal-Marktplatz-Add-on erhalten Sie täglich bis zu 10 verifizierte KI-Handelssignale für Aktien und Krypto. Signale werden von Claude Sonnet 4.6 mit Multi-Agenten-Konsens generiert.",
          },
        },
        {
          "@type": "Question",
          "name": "Was kostet der Signal-Marktplatz?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Der Signal-Marktplatz kostet €19/Monat oder €190/Jahr (entspricht 2 Monaten gratis). Für Free-Plan-Nutzer sind 3 Signale täglich kostenlos enthalten.",
          },
        },
        {
          "@type": "Question",
          "name": "Sind die Signale eine Anlageberatung?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Nein. Alle Signale sind rein informativ und stellen keine Anlageberatung gemäß WpHG dar. Trading-Entscheidungen treffen Sie eigenverantwortlich. Vergangene Performance garantiert keine zukünftigen Ergebnisse.",
          },
        },
        {
          "@type": "Question",
          "name": "Kann ich jederzeit kündigen?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Ja, Sie können Ihr Abonnement jederzeit ohne Mindestlaufzeit kündigen. Die Kündigung tritt zum Ende des jeweiligen Abrechnungszeitraums in Kraft.",
          },
        },
      ],
    },
  ],
};

export default function MarketplaceLayout({ children }: { children: React.ReactNode }) {
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
