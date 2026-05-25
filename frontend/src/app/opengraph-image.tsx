import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Neural Trading OS — AI-Powered Trading Dashboard";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #080b14 0%, #0d1117 50%, #080b14 100%)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Grid background */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "linear-gradient(rgba(0,212,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(0,212,255,0.06) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />

        {/* Top glow */}
        <div
          style={{
            position: "absolute",
            top: "-100px",
            left: "50%",
            transform: "translateX(-50%)",
            width: "900px",
            height: "400px",
            background: "radial-gradient(ellipse, rgba(0,212,255,0.12) 0%, transparent 70%)",
            borderRadius: "50%",
          }}
        />

        {/* Badge */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            background: "rgba(0,212,255,0.1)",
            border: "1px solid rgba(0,212,255,0.3)",
            borderRadius: "100px",
            padding: "6px 16px",
            marginBottom: "24px",
          }}
        >
          <div
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: "#00FF88",
              boxShadow: "0 0 8px #00FF88",
            }}
          />
          <span style={{ color: "#00D4FF", fontSize: "14px", fontWeight: 600 }}>
            9 AI Engines · Live Claude Sonnet 4.6 Signals
          </span>
        </div>

        {/* Headline */}
        <div
          style={{
            fontSize: "72px",
            fontWeight: 800,
            color: "#f1f5f9",
            textAlign: "center",
            lineHeight: 1.1,
            letterSpacing: "-2px",
            marginBottom: "20px",
          }}
        >
          Neural Trading OS
        </div>

        {/* Subline */}
        <div
          style={{
            fontSize: "24px",
            color: "#64748b",
            textAlign: "center",
            maxWidth: "700px",
            marginBottom: "40px",
          }}
        >
          AI-Powered Trading Dashboard — FastAPI · Next.js · Claude Sonnet 4.6
        </div>

        {/* Stats row */}
        <div style={{ display: "flex", gap: "40px" }}>
          {[
            { value: "€19/mo", label: "Signal Marketplace" },
            { value: "10/day", label: "AI Signals" },
            { value: "9", label: "AI Engines" },
          ].map((stat) => (
            <div
              key={stat.label}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "12px",
                padding: "16px 28px",
              }}
            >
              <span style={{ fontSize: "28px", fontWeight: 700, color: "#00D4FF" }}>{stat.value}</span>
              <span style={{ fontSize: "13px", color: "#64748b", marginTop: "4px" }}>{stat.label}</span>
            </div>
          ))}
        </div>

        {/* Bottom URL */}
        <div
          style={{
            position: "absolute",
            bottom: "28px",
            color: "rgba(100,116,139,0.6)",
            fontSize: "13px",
            fontFamily: "monospace",
          }}
        >
          frontend-production-8a00.up.railway.app
        </div>
      </div>
    ),
    { ...size }
  );
}
