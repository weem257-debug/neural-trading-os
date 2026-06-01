import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Broker-Depots verbinden — Neural Trading OS",
  description:
    "Alle Broker-Depots im Überblick — Bitpanda, Comdirect, DEGIRO, Flatex, Trade Republic, WH SelfInvest. Direkte Synchronisation via offizieller API, FinTS/HBCI und Community-Libs.",
  openGraph: {
    title: "Broker-Depots — Neural Trading OS",
    description:
      "Bitpanda, Comdirect, DEGIRO, Flatex, Trade Republic & mehr — alle Depots an einem Ort. KI-Analyse, Echtzeit-Kurse und Portfolio-Tracking.",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Broker-Depots — Neural Trading OS",
    description: "6+ Broker-Integrationen: Bitpanda, Comdirect, DEGIRO, Flatex, Trade Republic, WH SelfInvest.",
  },
};

export default function BrokersLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
