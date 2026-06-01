import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Neural Trading OS — KI-Trading Dashboard";
export const size = { width: 1200, height: 600 };
export const contentType = "image/png";

export default async function TwitterImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "600px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #080b14 0%, #0d1117 100%)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "linear-gradient(rgba(0,212,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,212,255,0.05) 1px, transparent 1px)",
            backgroundSize: "50px 50px",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "-80px",
            left: "50%",
            transform: "translateX(-50%)",
            width: "800px",
            height: "350px",
            background: "radial-gradient(ellipse, rgba(0,212,255,0.1) 0%, transparent 70%)",
            borderRadius: "50%",
          }}
        />

        <div style={{ fontSize: "64px", fontWeight: 800, color: "#f1f5f9", letterSpacing: "-2px", marginBottom: "12px" }}>
          Neural Trading OS
        </div>
        <div style={{ fontSize: "22px", color: "#00D4FF", marginBottom: "32px" }}>
          Live Claude Sonnet 4.6 · 9 AI Engines · €19/mo Signals
        </div>
        <div style={{ display: "flex", gap: "16px" }}>
          {["TradingAgents", "FinGPT", "Qlib", "Jesse", "Nautilus"].map((e) => (
            <div
              key={e}
              style={{
                background: "rgba(0,212,255,0.08)",
                border: "1px solid rgba(0,212,255,0.2)",
                borderRadius: "8px",
                padding: "8px 14px",
                color: "#64748b",
                fontSize: "13px",
              }}
            >
              {e}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}
