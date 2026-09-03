"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Mail, CheckCircle } from "lucide-react";
import { API_BASE } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { AuthCard, AuthError } from "@/components/ui/AuthCard";
import {
  authInputStyle as inputStyle,
  authInputFocus as onFocus,
  authInputBlur as onBlur,
} from "@/components/ui/AuthInput";

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

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <AuthCard subtitle="PASSWORT ZURÜCKSETZEN">
          {sent ? (
            <div
              className="flex items-start gap-3 px-4 py-4 rounded-lg"
              style={{ background: "rgba(63,185,80,0.08)", border: "1px solid rgba(63,185,80,0.3)" }}
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
              {error && <AuthError>{error}</AuthError>}

              <p className="text-xs mb-5 leading-relaxed" style={{ color: "rgba(100,116,139,0.6)" }}>
                Gib deine E-Mail-Adresse ein. Wir senden dir einen Link zum Zurücksetzen deines Passworts.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="fp-email" className="block text-xs font-semibold tracking-wider mb-1.5" style={{ color: "rgba(100,116,139,0.8)" }}>
                    E-MAIL
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "rgba(76,141,246,0.5)" }} />
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
                    background: loading ? "rgba(76,141,246,0.1)" : "linear-gradient(135deg, rgba(76,141,246,0.15), rgba(163,113,247,0.15))",
                    border: "1px solid rgba(76,141,246,0.4)",
                    color: loading ? "rgba(76,141,246,0.5)" : "#4C8DF6",
                    boxShadow: loading ? "none" : "0 0 20px rgba(76,141,246,0.15)",
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
            <a href="/login" className="hover:underline transition-colors" style={{ color: "rgba(76,141,246,0.5)" }}>
              ← Zurück zur Anmeldung
            </a>
          </p>
      </AuthCard>
    </div>
  );
}
