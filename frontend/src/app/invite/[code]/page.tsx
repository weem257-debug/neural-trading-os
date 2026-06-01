"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Cpu, TrendingUp, Brain, Shield, Zap, Gift, ArrowRight, CheckCircle } from "lucide-react";

const FEATURES = [
  { icon: Brain, text: "9 KI-Agenten analysieren parallel — technisch, fundamental, Sentiment" },
  { icon: TrendingUp, text: "3 kostenlose Handelssignale täglich (dauerhaft)" },
  { icon: Zap, text: "Live Elliott-Wave-Analyse + Multi-Broker-Depot-Übersicht" },
  { icon: Shield, text: "Paper Trading — kein echtes Kapital riskieren während du lernst" },
];

export default function InvitePage() {
  const { code } = useParams<{ code: string }>();

  const referrerName = useMemo(() => {
    if (!code) return null;
    try {
      const decoded = atob(decodeURIComponent(code));
      if (/^[a-zA-Z0-9_\-]{3,30}$/.test(decoded)) return decoded;
      return null;
    } catch {
      return null;
    }
  }, [code]);

  const registerUrl = `/register?ref=${encodeURIComponent(code ?? "")}`;

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
      style={{
        background: "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(0,212,255,0.07) 0%, transparent 70%), #060d1f",
      }}
    >
      {/* Grid overlay */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(0,212,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,212,255,0.04) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      <div className="relative z-10 w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
            style={{
              background: "linear-gradient(135deg, rgba(0,212,255,0.15), rgba(123,47,255,0.15))",
              border: "1px solid rgba(0,212,255,0.35)",
              boxShadow: "0 0 32px rgba(0,212,255,0.25)",
            }}
          >
            <Cpu className="w-8 h-8" style={{ color: "#00D4FF", filter: "drop-shadow(0 0 8px rgba(0,212,255,0.8))" }} />
          </div>
          <p className="text-xs tracking-widest font-semibold" style={{ color: "rgba(0,212,255,0.6)" }}>
            NEURAL TRADING OS
          </p>
        </div>

        {/* Invite card */}
        <div
          className="rounded-2xl p-8 mb-6"
          style={{
            background: "rgba(8,11,20,0.85)",
            border: "1px solid rgba(0,212,255,0.2)",
            backdropFilter: "blur(24px)",
            boxShadow: "0 0 60px rgba(0,212,255,0.06), 0 25px 50px rgba(0,0,0,0.5)",
          }}
        >
          {/* Invite badge */}
          <div className="flex items-center gap-2 mb-6">
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold"
              style={{
                background: "rgba(0,255,136,0.08)",
                border: "1px solid rgba(0,255,136,0.25)",
                color: "#4ade80",
              }}
            >
              <Gift className="w-3.5 h-3.5" />
              Persönliche Einladung
            </div>
          </div>

          {/* Headline */}
          {referrerName ? (
            <div className="mb-6">
              <h1 className="text-2xl font-black text-white mb-2">
                <span style={{ color: "#00D4FF" }}>{referrerName}</span> hat dich eingeladen
              </h1>
              <p className="text-sm" style={{ color: "rgba(100,116,139,0.8)" }}>
                Erstelle jetzt ein kostenloses Konto und erhalte sofort Zugang zu KI-generierten Handelssignalen.
              </p>
            </div>
          ) : (
            <div className="mb-6">
              <h1 className="text-2xl font-black text-white mb-2">
                Du wurdest eingeladen
              </h1>
              <p className="text-sm" style={{ color: "rgba(100,116,139,0.8)" }}>
                Erstelle jetzt ein kostenloses Konto und erhalte sofort Zugang zu KI-generierten Handelssignalen.
              </p>
            </div>
          )}

          {/* Features */}
          <ul className="space-y-3 mb-8">
            {FEATURES.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3">
                <div
                  className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center mt-0.5"
                  style={{ background: "rgba(0,212,255,0.08)", border: "1px solid rgba(0,212,255,0.15)" }}
                >
                  <Icon className="w-3.5 h-3.5" style={{ color: "#00D4FF" }} />
                </div>
                <span className="text-sm" style={{ color: "rgba(148,163,184,0.9)" }}>{text}</span>
              </li>
            ))}
          </ul>

          {/* CTA */}
          <Link
            href={registerUrl}
            className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl text-sm font-bold tracking-wide transition-all hover:brightness-110"
            style={{
              background: "linear-gradient(135deg, rgba(0,212,255,0.2), rgba(123,47,255,0.2))",
              border: "1px solid rgba(0,212,255,0.5)",
              color: "#00D4FF",
              boxShadow: "0 0 24px rgba(0,212,255,0.15)",
            }}
          >
            Kostenlos registrieren
            <ArrowRight className="w-4 h-4" />
          </Link>

          <p className="text-center text-xs mt-3" style={{ color: "rgba(100,116,139,0.5)" }}>
            Kein Abo, keine Kreditkarte — Free Plan dauerhaft kostenlos
          </p>
        </div>

        {/* Trust row */}
        <div className="flex items-center justify-center gap-4 flex-wrap">
          {["Free Plan inklusive", "Sofort starten", "DSGVO-konform"].map((item) => (
            <div key={item} className="flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5 text-green-400" />
              <span className="text-xs" style={{ color: "rgba(100,116,139,0.7)" }}>{item}</span>
            </div>
          ))}
        </div>

        {/* Bottom links */}
        <div className="flex items-center justify-center gap-4 mt-6">
          <Link href="/landing" className="text-xs hover:underline" style={{ color: "rgba(100,116,139,0.5)" }}>
            Mehr erfahren
          </Link>
          <span style={{ color: "rgba(100,116,139,0.3)" }}>·</span>
          <Link href="/login" className="text-xs hover:underline" style={{ color: "rgba(100,116,139,0.5)" }}>
            Bereits registriert?
          </Link>
        </div>
      </div>
    </div>
  );
}
