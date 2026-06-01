"use client";

import { useState, useCallback, useEffect, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Cpu, Lock, AlertTriangle, CheckCircle } from "lucide-react";
import { API_BASE } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { getPasswordStrength } from "@/lib/passwordStrength";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());

  useEffect(() => {
    if (isAuthenticated) router.replace("/dashboard");
  }, [isAuthenticated, router]);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pwStrength = useMemo(() => getPasswordStrength(password), [password]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      if (password !== confirm) {
        setError("Passwörter stimmen nicht überein");
        return;
      }
      if (!token) {
        setError("Ungültiger Reset-Link — bitte fordere einen neuen an");
        return;
      }

      setLoading(true);
      try {
        const resp = await fetch(`${API_BASE}/api/auth/reset-password`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, password }),
        });
        if (!resp.ok) {
          const d = await resp.json().catch(() => ({}));
          setError(d.detail ?? "Passwort-Reset fehlgeschlagen");
          setLoading(false);
          return;
        }
        setSuccess(true);
        setTimeout(() => router.push("/login"), 2500);
      } catch {
        setError("Verbindungsfehler — bitte erneut versuchen");
        setLoading(false);
      }
    },
    [password, confirm, token, router]
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
              NEUES PASSWORT SETZEN
            </p>
          </div>

          {!token && (
            <div
              className="flex items-center gap-2 px-4 py-3 rounded-lg mb-5"
              style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.4)" }}
            >
              <AlertTriangle className="w-4 h-4 flex-shrink-0 text-red-400" />
              <span className="text-sm" style={{ color: "#f87171" }}>
                Ungültiger Reset-Link.{" "}
                <a href="/forgot-password" className="underline">Neuen anfordern</a>
              </span>
            </div>
          )}

          {success && (
            <div
              className="flex items-start gap-3 px-4 py-4 rounded-lg"
              style={{ background: "rgba(0,255,136,0.08)", border: "1px solid rgba(0,255,136,0.3)" }}
            >
              <CheckCircle className="w-5 h-5 flex-shrink-0 text-green-400 mt-0.5" />
              <div>
                <p className="text-sm font-semibold" style={{ color: "#4ade80" }}>Passwort geändert!</p>
                <p className="text-xs mt-1" style={{ color: "rgba(100,116,139,0.7)" }}>Weiterleitung zur Anmeldung…</p>
              </div>
            </div>
          )}

          {!success && token && (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div
                  className="flex items-center gap-2 px-4 py-3 rounded-lg"
                  style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.4)" }}
                >
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 text-red-400" />
                  <span className="text-sm font-semibold" style={{ color: "#f87171" }}>{error}</span>
                </div>
              )}

              <div>
                <label htmlFor="rp-password" className="block text-xs font-semibold tracking-wider mb-1.5" style={{ color: "rgba(100,116,139,0.8)" }}>
                  NEUES PASSWORT
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "rgba(0,212,255,0.5)" }} />
                  <input
                    id="rp-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mindestens 8 Zeichen"
                    className="w-full pl-10 pr-10 py-2.5 rounded-lg text-sm text-slate-200 placeholder-slate-600 outline-none transition-all duration-200"
                    style={inputStyle}
                    onFocus={onFocus}
                    onBlur={onBlur}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    aria-label={showPassword ? "Passwort ausblenden" : "Passwort anzeigen"}
                    style={{ color: "rgba(100,116,139,0.6)" }}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {/* Password strength meter */}
                {password.length > 0 && (
                  <div className="mt-2">
                    <div className="flex gap-1 mb-1">
                      {[1, 2, 3, 4].map((seg) => (
                        <div
                          key={seg}
                          className="h-1 flex-1 rounded-full transition-all duration-300"
                          style={{ background: seg <= pwStrength.score ? pwStrength.color : "rgba(255,255,255,0.08)" }}
                        />
                      ))}
                    </div>
                    <p className="text-xs" style={{ color: pwStrength.color }}>{pwStrength.label}</p>
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="rp-confirm" className="block text-xs font-semibold tracking-wider mb-1.5" style={{ color: "rgba(100,116,139,0.8)" }}>
                  PASSWORT BESTÄTIGEN
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "rgba(0,212,255,0.5)" }} />
                  <input
                    id="rp-confirm"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Passwort wiederholen"
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg text-sm text-slate-200 placeholder-slate-600 outline-none transition-all duration-200"
                    style={inputStyle}
                    onFocus={onFocus}
                    onBlur={onBlur}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !password || !confirm}
                className="w-full py-3 rounded-lg text-sm font-bold tracking-widest transition-all duration-200 mt-2"
                style={{
                  background: loading ? "rgba(0,212,255,0.1)" : "linear-gradient(135deg, rgba(0,212,255,0.15), rgba(123,47,255,0.15))",
                  border: "1px solid rgba(0,212,255,0.4)",
                  color: loading ? "rgba(0,212,255,0.5)" : "#00D4FF",
                  boxShadow: loading ? "none" : "0 0 20px rgba(0,212,255,0.15)",
                  letterSpacing: "0.12em",
                  opacity: (!password || !confirm) ? 0.5 : 1,
                }}
              >
                {loading ? "WIRD GESPEICHERT…" : "PASSWORT SPEICHERN"}
              </button>
            </form>
          )}

          <p className="text-center text-xs mt-5" style={{ color: "rgba(100,116,139,0.4)" }}>
            <a href="/login" className="hover:underline transition-colors" style={{ color: "rgba(0,212,255,0.4)" }}>
              ← Zur Anmeldung
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
