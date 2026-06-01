import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Neural Trading OS",
    short_name: "NeuralTrade",
    description:
      "KI-gestütztes Trading-Dashboard — 9 Agenten, Claude-Signale, Echtzeit-WebSocket-Kurse und Multi-Broker-Depots.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#080b14",
    theme_color: "#00D4FF",
    orientation: "portrait-primary",
    categories: ["finance", "productivity"],
    icons: [
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Übersicht",
        url: "/dashboard",
        description: "Trading-Übersicht öffnen",
      },
      {
        name: "KI-Signale",
        url: "/signals",
        description: "KI-Handelssignale anzeigen",
      },
      {
        name: "Marktplatz",
        url: "/signals/marketplace",
        description: "Signal-Performance und Track Record",
      },
    ],
  };
}
