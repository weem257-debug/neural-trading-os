"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Cpu, Mail, AlertTriangle, CheckCircle } from "lucide-react";
import { API_BASE } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());

  useEffect(() => {
    if (isAuthenticated) router.replace("/dashboard");
  }, [isAuthenticated, router]);

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setLoading(true);
      try {
        const resp = await fetch(`${API_BASE}/api/auth/forgot-password`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim() }),
        });
        if (!resp.ok) {
          const d = await resp.json().catch(() => ({}));
          setError(d.detail ?? "Anfrage fehlgeschlagen");
          setLoading(false);
          return;
        }
        setSent(true);
      } catch {
        setError("Verbindungsfehler — bitte erneut versuchen");
      } finally {
        setLoading(false);
      }
    },
    [email]
  );

  const inputStyle = {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(0,212,255,0.15)",
  };
  const onFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.border = "1px solid rgba(0,212,255,0.5)";
    e.currentTarget.style.boxShadow = "0 0 12px rgba(0,212,255,0.1)";
  };
  const onBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.border = "1px solid rgba(0,212,255,0.15)";
    e.currentTarget.style.boxShadow = "none";
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <div
        className="w-full max-w-sm relative"
        style={{
          background: "rgba(8,11,20,0.85)",
          border: "1px solid rgba(0,212,255,0.25)",
          borderRadius: "1rem",
          backdropFilter: "blur(24px)",
          boxShadow:
            "0 0 60px rgba(0,212,255,0.08), 0 25px 50px rgba(0,0,0,0.6), inset 0 1px 0 rgba(0,212,255,0.1)",
        }}
      >
        <div
          className="absolute top-0 left-8 right-8 h-px rounded-full"
          style={{ background: "linear-gradient(90deg, transparent, rgba(0,212,255,0.6), transparent)" }}
        />

        <div className="px-8 py-10">
          <div className="flex flex-col items-center mb-8">
            <div
              className="w-14 h-14 rounded-xl flex items-center justify-center mb-4"
              style={{
                background: "linear-gradient(135deg, rgba(0,212,255,0.15), rgba(123,47,255,0.15))",
                border: "1px solid rgba(0,212,255,0.35)",
                boxShadow: "0 0 24px rgba(0,212,255,0.25)",
              }}
            >
              <Cpu className="w-7 h-7" style={{ color: "#00D4FF", filter: "drop-shadow(0 0 8px rgba(0,212,255,0.8))" }} />
            </div>
            <h1
              className="text-xl font-black tracking-widest"
              style={{ color: "#00D4FF", textShadow: "0 0 20px rgba(0,212,255,0.6), 0 0 40px rgba(0,212,255,0.3)", letterSpacing: "0.15em" }}
            >
              NEURAL TRADING OS
            </h1>
            <p className="text-xs mt-1 tracking-wider" style={{ color: "rgba(100,116,139,0.7)" }}>
              PASSWORT ZURÜCKSETZEN
            </p>
          </div>

          {sent ? (
            <div
              className="flex items-start gap-3 px-4 py-4 rounded-lg"
              style={{ background: "rgba(0,255,136,0.08)", border: "1px solid rgba(0,255,136,0.3)" }}
            >
              <CheckCircle className="w-5 h-5 flex-shrink-0 text-green-400 mt-0.5" />
              <div>
                <p className="text-sm font-semibold" style={{ color: "#4ade80" }}>
                  E-Mail gesendet
                </p>
                <p className="text-xs mt-1" style={{ color: "rgba(100,116,139,0.7)" }}>
                  Falls ein Konto mit dieser E-Mail existiert, haben wir einen Reset-Link gesendet. Bitte prüfe auch deinen Spam-Ordner.
                </p>
              </div>
            </div>
          ) : (
            <>
              {error && (
                <div
                  className="flex items-center gap-2 px-4 py-3 rounded-lg mb-5"
                  style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.4)" }}
                >
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 text-red-400" />
                  <span className="text-sm font-semibold" style={{ color: "#f87171" }}>{error}</span>
                </div>
              )}

              <p className="text-xs mb-5 leading-relaxed" style={{ color: "rgba(100,116,139,0.6)" }}>
                Gib deine E-Mail-Adresse ein. Wir senden dir einen Link zum Zurücksetzen deines Passworts.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="fp-email" className="block text-xs font-semibold tracking-wider mb-1.5" style={{ color: "rgba(100,116,139,0.8)" }}>
                    E-MAIL
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "rgba(0,212,255,0.5)" }} />
                    <input
                      id="fp-email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="deine@email.de"
                      className="w-full pl-10 pr-4 py-2.5 rounded-lg text-sm text-slate-200 placeholder-slate-600 outline-none transition-all duration-200"
                      style={inputStyle}
                      onFocus={onFocus}
                      onBlur={onBlur}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || !email.trim()}
                  className="w-full py-3 rounded-lg text-sm font-bold tracking-widest transition-all duration-200 mt-2"
                  style={{
                    background: loading ? "rgba(0,212,255,0.1)" : "linear-gradient(135deg, rgba(0,212,255,0.15), rgba(123,47,255,0.15))",
                    border: "1px solid rgba(0,212,255,0.4)",
                    color: loading ? "rgba(0,212,255,0.5)" : "#00D4FF",
                    boxShadow: loading ? "none" : "0 0 20px rgba(0,212,255,0.15)",
                    letterSpacing: "0.12em",
                    opacity: !email.trim() ? 0.5 : 1,
                  }}
                >
                  {loading ? "WIRD GESENDET…" : "RESET-LINK SENDEN"}
                </button>
              </form>
            </>
          )}

          <p className="text-center text-xs mt-5" style={{ color: "rgba(100,116,139,0.4)" }}>
            <a href="/login" className="hover:underline transition-colors" style={{ color: "rgba(0,212,255,0.5)" }}>
              ← Zurück zur Anmeldung
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
