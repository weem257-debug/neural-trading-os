"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  return (
    <html lang="de">
      <body
        style={{
          margin: 0,
          fontFamily: "system-ui, sans-serif",
          background: "linear-gradient(180deg, #080B14 0%, #0D1117 100%)",
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "32rem",
            borderRadius: "1rem",
            padding: "2rem",
            textAlign: "center",
            background:
              "linear-gradient(135deg, rgba(255,0,60,0.08) 0%, rgba(255,0,60,0.04) 50%, rgba(8,11,20,0.95) 100%)",
            border: "1px solid rgba(255,0,60,0.35)",
            boxShadow: "0 0 40px rgba(255,0,60,0.12)",
            backdropFilter: "blur(24px)",
          }}
        >
          <div
            style={{
              width: "5rem",
              height: "5rem",
              borderRadius: "0.75rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 1.5rem",
              background: "rgba(255,0,60,0.12)",
              border: "1px solid rgba(255,0,60,0.4)",
            }}
          >
            <AlertTriangle style={{ width: "2.5rem", height: "2.5rem", color: "#FF003C" }} />
          </div>

          <h1 style={{ color: "#F1F5F9", fontSize: "1.5rem", fontWeight: "bold", marginBottom: "0.5rem" }}>
            Kritischer Systemfehler
          </h1>
          <p style={{ color: "#94A3B8", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
            Ein schwerwiegender Fehler ist im Root-Layout aufgetreten. Die Anwendung kann sich nicht automatisch erholen.
          </p>

          {error.message && (
            <div
              style={{
                background: "rgba(255,0,60,0.06)",
                border: "1px solid rgba(255,0,60,0.2)",
                borderRadius: "0.75rem",
                padding: "1rem",
                marginBottom: "1.5rem",
                textAlign: "left",
                overflowX: "auto",
              }}
            >
              <p style={{ fontFamily: "monospace", fontSize: "0.75rem", color: "rgba(255,0,60,0.9)" }}>
                <span style={{ color: "#475569" }}>Fehler: </span>
                {error.message}
              </p>
            </div>
          )}

          <button
            onClick={reset}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.625rem",
              padding: "0.75rem 2rem",
              borderRadius: "0.75rem",
              fontSize: "0.875rem",
              fontWeight: "bold",
              cursor: "pointer",
              width: "100%",
              justifyContent: "center",
              background: "linear-gradient(135deg, rgba(255,0,60,0.2), rgba(255,0,60,0.12))",
              border: "1px solid rgba(255,0,60,0.5)",
              color: "#FF003C",
            }}
          >
            <RefreshCw style={{ width: "1rem", height: "1rem" }} />
            Neu laden
          </button>
        </div>
      </body>
    </html>
  );
}
