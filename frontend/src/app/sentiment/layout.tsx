import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Marktstimmung — Neural Trading OS",
  description:
    "Live KI-Marktstimmung: News-NLP, Social-Media-Scanning, Fear-&-Greed-Index und Sektorrotationssignale — powered by Claude Sonnet 4.6.",
  openGraph: {
    title: "KI-Sentiment-Analyse — Neural Trading OS",
    description: "Echtzeit News-NLP, Social-Scanning und Fear-&-Greed-Index für bessere Handelsentscheidungen.",
    type: "website",
  },
};

export default function SentimentLayout({ children }: { children: React.ReactNode }) {
  return children;
}
