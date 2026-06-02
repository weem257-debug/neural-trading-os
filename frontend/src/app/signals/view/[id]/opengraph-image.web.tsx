import { ImageResponse } from "next/og";

// `.web.tsx` extension: this OG route is web-only. The Capacitor mobile export
// (MOBILE_BUILD=1) drops `.web.tsx` from pageExtensions, so this Edge route
// never enters the static export. Edge stays for fast OG generation on web.
export const runtime = "edge";
export const alt = "KI-Handelssignal | Neural Trading OS";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const DIR: Record<string, { label: string; color: string }> = {
  BUY:         { label: "KAUFEN",       color: "#22c55e" },
  STRONG_BUY:  { label: "STARK KAUFEN", color: "#00ff88" },
  SELL:        { label: "VERKAUFEN",    color: "#ef4444" },
  STRONG_SELL: { label: "STARK VERK.",  color: "#ff2222" },
  HOLD:        { label: "HALTEN",       color: "#f59e0b" },
};

interface Signal {
  ticker: string;
  direction: string;
  confidence: number;
  reasoning: string;
  time_horizon: string | null;
}

export default async function Image({ params }: { params: { id: string } }) {
  const { id } = params;
  const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

  let signal: Signal | null = null;
  try {
    const res = await fetch(`${API}/api/signals/by-id/${encodeURIComponent(id)}`, {
      next: { revalidate: 300 },
    });
    if (res.ok) signal = (await res.json()) as Signal;
  } catch {}

  const dir = signal?.direction && signal.direction in DIR ? signal.direction : "HOLD";
  const cfg = DIR[dir];
  const confPct = signal ? Math.round(signal.confidence * 100) : 0;
  const snippet =
    signal?.reasoning
      ? signal.reasoning.slice(0, 110) + (signal.reasoning.length > 110 ? "…" : "")
      : "";

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "1200px",
          height: "630px",
          background: "#080b14",
          padding: "52px 64px",
          fontFamily: "system-ui, sans-serif",
          overflow: "hidden",
          position: "relative",
        }}
      >
        {/* Cyan radial glow */}
        <div
          style={{
            position: "absolute",
            top: "-120px",
            left: "-80px",
            width: "560px",
            height: "560px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(0,212,255,0.09) 0%, transparent 70%)",
            display: "flex",
          }}
        />

        {/* Branding */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "36px" }}>
          <div
            style={{
              width: "10px",
              height: "10px",
              borderRadius: "50%",
              background: "#00D4FF",
              boxShadow: "0 0 14px rgba(0,212,255,0.8)",
              display: "flex",
            }}
          />
          <span style={{ color: "#00D4FF", fontSize: "22px", fontWeight: 700 }}>Neural Trading OS</span>
          <span style={{ color: "#1e293b", fontSize: "22px", marginLeft: "4px" }}>·</span>
          <span style={{ color: "#475569", fontSize: "20px", marginLeft: "4px" }}>KI-Handelssignal</span>
        </div>

        {signal ? (
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            {/* Ticker + direction */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "24px",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span
                  style={{
                    color: "#f8fafc",
                    fontSize: "100px",
                    fontWeight: 800,
                    lineHeight: "1",
                    letterSpacing: "-3px",
                  }}
                >
                  {signal.ticker}
                </span>
                <span style={{ color: "#475569", fontSize: "22px", marginTop: "6px" }}>
                  {signal.time_horizon ?? "Kurzfristiger Horizont"}
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  padding: "18px 32px",
                  borderRadius: "14px",
                  border: `2px solid ${cfg.color}45`,
                  background: `${cfg.color}15`,
                }}
              >
                <span
                  style={{
                    color: cfg.color,
                    fontSize: "38px",
                    fontWeight: 800,
                    letterSpacing: "-0.5px",
                  }}
                >
                  {cfg.label}
                </span>
              </div>
            </div>

            {/* Confidence bar */}
            <div style={{ display: "flex", flexDirection: "column", marginBottom: "22px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: "10px",
                }}
              >
                <span style={{ color: "#64748b", fontSize: "18px" }}>KI-Konfidenz</span>
                <span
                  style={{
                    color:
                      confPct >= 75 ? "#22c55e" : confPct >= 55 ? "#f59e0b" : "#ef4444",
                    fontSize: "22px",
                    fontWeight: 700,
                  }}
                >
                  {confPct}%
                </span>
              </div>
              <div
                style={{
                  height: "10px",
                  background: "rgba(255,255,255,0.05)",
                  borderRadius: "5px",
                  display: "flex",
                }}
              >
                <div
                  style={{
                    width: `${confPct}%`,
                    background: cfg.color,
                    borderRadius: "5px",
                    display: "flex",
                  }}
                />
              </div>
            </div>

            {/* Reasoning snippet */}
            {snippet ? (
              <div
                style={{
                  display: "flex",
                  background: "rgba(0,212,255,0.05)",
                  border: "1px solid rgba(0,212,255,0.14)",
                  borderRadius: "12px",
                  padding: "16px 20px",
                }}
              >
                <span style={{ color: "#94a3b8", fontSize: "18px", lineHeight: "1.55" }}>
                  {snippet}
                </span>
              </div>
            ) : null}
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span style={{ color: "#1e293b", fontSize: "32px" }}>KI-Handelssignal</span>
          </div>
        )}

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: "24px",
            paddingTop: "18px",
            borderTop: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <span style={{ color: "#334155", fontSize: "16px" }}>
            {(process.env.NEXT_PUBLIC_APP_URL ?? "https://neuraltrading.io").replace(/^https?:\/\//, "")}
          </span>
          <span style={{ color: "#334155", fontSize: "16px" }}>
            3 kostenlose Signale täglich — Kostenlos registrieren
          </span>
        </div>
      </div>
    ),
    { ...size }
  );
}