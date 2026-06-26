import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Aktienanalyse — Neural Trading OS",
  description:
    "KI-gestützte Aktienanalyse: Mehrere Aktien gleichzeitig auswerten mit Elliott-Wellen, Sentiment, Backtest und Risikobewertung. Öffentlich & ohne Login nutzbar.",
  robots: { index: true, follow: true },
};

export default function AktienanalyseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
