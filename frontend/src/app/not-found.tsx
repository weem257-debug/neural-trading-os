import Link from "next/link";
import { Search, Home, LayoutDashboard } from "lucide-react";

export default function NotFound() {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{
        background:
          "radial-gradient(ellipse 80% 60% at 50% 40%, rgba(0,212,255,0.04) 0%, transparent 70%), " +
          "linear-gradient(180deg, rgba(8,11,20,1) 0%, rgba(13,17,23,1) 100%)",
      }}
    >
      <div className="fixed inset-0 bg-neural-grid opacity-40 pointer-events-none" />
      <div
        className="fixed inset-x-0 h-px pointer-events-none"
        style={{
          background: "linear-gradient(90deg, transparent, rgba(0,212,255,0.4), transparent)",
          animation: "data-stream 4s linear infinite",
          top: "45%",
        }}
      />

      <div className="relative z-10 w-full max-w-lg text-center">
        <div
          className="rounded-2xl p-8"
          style={{
            background:
              "linear-gradient(135deg, rgba(0,212,255,0.06) 0%, rgba(0,212,255,0.03) 50%, rgba(8,11,20,0.95) 100%)",
            border: "1px solid rgba(0,212,255,0.2)",
            boxShadow:
              "0 0 40px rgba(0,212,255,0.08), 0 0 80px rgba(0,212,255,0.04), inset 0 1px 0 rgba(255,255,255,0.04)",
            backdropFilter: "blur(24px)",
          }}
        >
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6"
            style={{
              background: "rgba(0,212,255,0.08)",
              border: "1px solid rgba(0,212,255,0.3)",
              boxShadow: "0 0 24px rgba(0,212,255,0.12)",
            }}
          >
            <Search
              className="w-10 h-10"
              style={{ color: "#00D4FF", filter: "drop-shadow(0 0 6px rgba(0,212,255,0.6))" }}
            />
          </div>

          <p
            className="text-7xl font-bold font-mono mb-3"
            style={{ color: "rgba(0,212,255,0.15)", letterSpacing: "-0.05em" }}
          >
            404
          </p>

          <h1 className="text-2xl font-bold text-slate-100 mb-2">Seite nicht gefunden</h1>
          <p className="text-sm text-slate-400 mb-8">
            Diese Seite existiert nicht oder ist nicht mehr verfügbar. Entdecke stattdessen
            KI-Handelssignale — 3 Signale täglich, dauerhaft kostenlos.
          </p>

          <Link
            href="/landing"
            className="inline-flex items-center gap-2.5 px-8 py-3 rounded-xl text-sm font-bold transition-all duration-200"
            style={{
              background: "linear-gradient(135deg, rgba(0,212,255,0.15), rgba(0,212,255,0.08))",
              border: "1px solid rgba(0,212,255,0.35)",
              color: "#00D4FF",
              boxShadow: "0 0 20px rgba(0,212,255,0.1)",
              textShadow: "0 0 8px rgba(0,212,255,0.5)",
            }}
          >
            <Home className="w-4 h-4" />
            Zur Startseite
          </Link>

          <p className="text-xs text-slate-500 mt-5">
            Bereits Mitglied?{" "}
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1 font-semibold hover:underline"
              style={{ color: "rgba(0,212,255,0.8)" }}
            >
              <LayoutDashboard className="w-3 h-3" />
              Zum Dashboard
            </Link>
          </p>

          <p className="text-xs text-slate-600 mt-6 font-mono">Neural Trading OS — Signal verloren</p>
        </div>
      </div>
    </div>
  );
}
