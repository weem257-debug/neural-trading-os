"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: ErrorPageProps) {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{
        background:
          "radial-gradient(ellipse 80% 60% at 50% 40%, rgba(255,0,60,0.06) 0%, transparent 70%), " +
          "linear-gradient(180deg, rgba(8,11,20,1) 0%, rgba(13,17,23,1) 100%)",
      }}
    >
      <div className="fixed inset-0 bg-neural-grid opacity-40 pointer-events-none" />
      <div
        className="fixed inset-x-0 h-px pointer-events-none"
        style={{
          background: "linear-gradient(90deg, transparent, rgba(255,0,60,0.6), transparent)",
          animation: "data-stream 3s linear infinite",
          top: "40%",
        }}
      />

      <div className="relative z-10 w-full max-w-lg">
        <div
          className="rounded-2xl p-8 text-center"
          style={{
            background:
              "linear-gradient(135deg, rgba(255,0,60,0.08) 0%, rgba(255,0,60,0.04) 50%, rgba(8,11,20,0.95) 100%)",
            border: "1px solid rgba(255,0,60,0.35)",
            boxShadow:
              "0 0 40px rgba(255,0,60,0.15), 0 0 80px rgba(255,0,60,0.06), inset 0 1px 0 rgba(255,255,255,0.05)",
            backdropFilter: "blur(24px)",
          }}
        >
          <div
            className="absolute top-0 right-0 w-40 h-40 pointer-events-none rounded-2xl overflow-hidden"
            style={{
              background: "radial-gradient(circle, rgba(255,0,60,0.12) 0%, transparent 70%)",
              transform: "translate(30%, -30%)",
            }}
          />

          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6"
            style={{
              background: "rgba(255,0,60,0.12)",
              border: "1px solid rgba(255,0,60,0.4)",
              boxShadow: "0 0 24px rgba(255,0,60,0.2), inset 0 0 12px rgba(255,0,60,0.05)",
            }}
          >
            <AlertTriangle
              className="w-10 h-10"
              style={{ color: "#FF003C", filter: "drop-shadow(0 0 8px rgba(255,0,60,0.8))" }}
            />
          </div>

          <div
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono font-bold mb-4 tracking-widest uppercase"
            style={{
              background: "rgba(255,0,60,0.1)",
              border: "1px solid rgba(255,0,60,0.3)",
              color: "#FF003C",
              textShadow: "0 0 8px rgba(255,0,60,0.8)",
            }}
          >
            <span
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{ background: "#FF003C", boxShadow: "0 0 6px #FF003C", animation: "pulse 1.2s ease-in-out infinite" }}
            />
            System Error Detected
          </div>

          <h1 className="text-2xl font-bold text-slate-100 mb-2">Neural Core Fault</h1>
          <p className="text-sm text-slate-400 mb-6">
            An unexpected exception interrupted the render cycle. The system state has been
            preserved — retrying will restore normal operation.
          </p>

          {error.message && (
            <div
              className="mb-6 p-4 rounded-xl text-left overflow-x-auto"
              style={{ background: "rgba(255,0,60,0.06)", border: "1px solid rgba(255,0,60,0.2)" }}
            >
              <p className="text-xs font-mono leading-relaxed" style={{ color: "rgba(255,0,60,0.9)" }}>
                <span className="text-slate-500">Error: </span>
                {error.message}
              </p>
              {error.digest && (
                <p className="text-xs font-mono mt-1" style={{ color: "rgba(255,100,100,0.6)" }}>
                  <span className="text-slate-600">Digest: </span>
                  {error.digest}
                </p>
              )}
            </div>
          )}

          <button
            onClick={reset}
            className="group inline-flex items-center gap-2.5 px-8 py-3 rounded-xl text-sm font-bold transition-all duration-200 w-full justify-center"
            style={{
              background: "linear-gradient(135deg, rgba(255,0,60,0.2), rgba(255,0,60,0.12))",
              border: "1px solid rgba(255,0,60,0.5)",
              color: "#FF003C",
              boxShadow: "0 0 20px rgba(255,0,60,0.15)",
              textShadow: "0 0 8px rgba(255,0,60,0.6)",
            }}
            onMouseEnter={(e) => {
              const t = e.currentTarget;
              t.style.background = "linear-gradient(135deg, rgba(255,0,60,0.28), rgba(255,0,60,0.18))";
              t.style.boxShadow = "0 0 30px rgba(255,0,60,0.25)";
            }}
            onMouseLeave={(e) => {
              const t = e.currentTarget;
              t.style.background = "linear-gradient(135deg, rgba(255,0,60,0.2), rgba(255,0,60,0.12))";
              t.style.boxShadow = "0 0 20px rgba(255,0,60,0.15)";
            }}
          >
            <RefreshCw className="w-4 h-4 transition-transform duration-300 group-hover:rotate-180" />
            Reinitialize System
          </button>

          <p className="text-xs text-slate-600 mt-4 font-mono">
            Neural Trading OS — If the error persists, clear browser cache.
          </p>
        </div>
      </div>
    </div>
  );
}
