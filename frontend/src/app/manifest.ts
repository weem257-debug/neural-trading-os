import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Neural Trading OS",
    short_name: "NeuralTrade",
    description:
      "AI-powered trading dashboard — 9 engines, Claude Sonnet 4.6 signals, real-time WebSocket prices.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#080b14",
    theme_color: "#00D4FF",
    orientation: "portrait-primary",
    categories: ["finance", "productivity"],
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
    shortcuts: [
      {
        name: "Dashboard",
        url: "/dashboard",
        description: "Open trading dashboard",
      },
      {
        name: "Signals",
        url: "/signals",
        description: "View AI trading signals",
      },
      {
        name: "Marketplace",
        url: "/signals/marketplace",
        description: "Signal track record",
      },
    ],
  };
}
