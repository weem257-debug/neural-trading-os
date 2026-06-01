"use client";

import { useState, useCallback, useEffect, useMemo, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Cpu, Lock, User, Mail, AlertTriangle, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { API_BASE, api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { getPasswordStrength } from "@/lib/passwordStrength";

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const login = useAuthStore((s) => s.login);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());

  useEffect(() => {
    if (isAuthenticated) {
      const plan = searchParams.get("plan");
      router.replace(plan ? `/billing?plan=${plan}` : "/dashboard");
    }
  }, [isAuthenticated, router, searchParams]);

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [dsgvo, setDsgvo] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [refCode] = useState(() => searchParams.get("ref") ?? "");
  const [planCode] = useState(() => searchParams.get("plan") ?? "");
  const [emailTouched, setEmailTouched] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");
  const usernameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pwStrength = useMemo(() => getPasswordStrength(password), [password]);
  const emailValid = useMemo(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()), [email]);
  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;
  const usernameFormatValid = useMemo(
    () => username.trim().length === 0 || /^[a-zA-Z0-9_\-]+$/.test(username.trim()),
    [username]
  );
  const inviterName = useMemo(() => {
    if (!refCode) return null;
    try {
      const decoded = atob(decodeURIComponent(refCode));
      return /^[a-zA-Z0-9_\-]{3,30}$/.test(decoded) ? decoded : null;
    } catch { return null; }
  }, [refCode]);

  useEffect(() => {
    if (refCode) localStorage.setItem("neural_pending_ref", refCode);
  }, [refCode]);

  useEffect(() => {
    if (usernameTimerRef.current) clearTimeout(usernameTimerRef.current);
    const trimmed = username.trim();
    if (trimmed.length < 3 || !/^[a-zA-Z0-9_\-]+$/.test(trimmed)) { setUsernameStatus("idle"); return; }
    setUsernameStatus("checking");
    usernameTimerRef.current = setTimeout(async () => {
      try {
        const res = await api.auth.checkUsername(trimmed);
        setUsernameStatus(res.available ? "available" : "taken");
      } catch {
        setUsernameStatus("idle");
      }
    }, 500);
    return () => { if (usernameTimerRef.current) clearTimeout(usernameTimerRef.current); };
  }, [username]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      if (password !== confirmPassword) {
        setError("Passwörter stimmen nicht überein");
        return;
      }
      if (!dsgvo) {
        setError("Bitte stimme den Datenschutzbestimmungen zu");
        return;
      }

      setLoading(true);
      try {
        const resp = await fetch(`${API_BASE}/api/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: username.trim(), email: email.trim(), password, gdpr_consent: dsgvo, ...(refCode ? { referred_by: refCode } : {}) }),
        });

        if (!resp.ok) {
          const errData = await resp.json().catch(() => ({}));
          const msg: string = errData.detail ?? "Registrierung fehlgeschlagen";
          if (Array.isArray(msg)) {
            setError((msg as { msg: string }[])[0]?.msg ?? "Ungültige Eingabe");
          } else {
            setError(msg);
          }
          setLoading(false);
          return;
        }

        if (refCode) {
          localStorage.setItem("neural_registered_via_ref", refCode);
          localStorage.removeItem("neural_pending_ref");
        }

        // Auto-login after successful registration
        try {
          const form = new URLSearchParams();
          form.append("username", username.trim());
          form.append("password", password);
          const tokenResp = await fetch(`${API_BASE}/api/auth/token`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: form.toString(),
          });
          if (tokenResp.ok) {
            const tokenData = await tokenResp.json();
            let role: string | undefined;
            let tier: string | undefined;
            try {
              const meResp = await fetch(`${API_BASE}/api/auth/me`, {
                headers: { Authorization: `Bearer ${tokenData.access_token}` },
              });
              if (meResp.ok) { const me = await meResp.json(); role = me.role; tier = me.tier; }
            } catch { /* ignore */ }
            login(tokenData.access_token, username.trim(), role, tokenData.expires_in, tier);
            router.push(planCode ? `/billing?plan=${planCode}` : "/dashboard");
            return;
          }
        } catch { /* auto-login failed — fall back to manual login */ }

        setSuccess(true);
        setTimeout(() => router.push("/login"), 2000);
      } catch {
        setError("Verbindungsfehler — bitte erneut versuchen");
        setLoading(false);
      }
    },
    [username, email, password, confirmPassword, dsgvo, refCode, planCode, router, login]
  );

  const inputStyle = {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(0,212,255,0.15)",
  };
  const inputFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.border = "1px solid rgba(0,212,255,0.5)";
    e.currentTarget.style.boxShadow = "0 0 12px rgba(0,212,255,0.1)";
  };
  const inputBlur = (e: React.FocusEvent<HTMLInputElement>) => {
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
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div
              className="w-14 h-14 rounded-xl flex items-center justify-center mb-4"
              style={{
                background: "linear-gradient(135deg, rgba(0,212,255,0.15), rgba(123,47,255,0.15))",
                border: "1px solid rgba(0,212,255,0.35)",
                boxShadow: "0 0 24px rgba(0,212,255,0.25)",
              }}
            >
              <Cpu
                className="w-7 h-7"
                style={{ color: "#00D4FF", filter: "drop-shadow(0 0 8px rgba(0,212,255,0.8))" }}
              />
            </div>
            <h1
              className="text-xl font-black tracking-widest"
              style={{
                color: "#00D4FF",
                textShadow: "0 0 20px rgba(0,212,255,0.6), 0 0 40px rgba(0,212,255,0.3)",
                letterSpacing: "0.15em",
              }}
            >
              NEURAL TRADING OS
            </h1>
            <p className="text-xs mt-1 tracking-wider" style={{ color: "rgba(100,116,139,0.7)" }}>
              KOSTENLOSES KONTO ERSTELLEN
            </p>
          </div>

          {/* Plan badge */}
          {planCode && !success && (
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-lg mb-3 text-xs"
              style={{ background: "rgba(0,212,255,0.06)", border: "1px solid rgba(0,212,255,0.2)", color: "#67e8f9" }}
            >
              <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
              Nach Registrierung direkt zum&nbsp;<strong style={{ color: "#00D4FF", textTransform: "capitalize" }}>{planCode}-Plan</strong>&nbsp;weiter
            </div>
          )}

          {/* Referral badge */}
          {refCode && !success && (
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-lg mb-5 text-xs"
              style={{ background: "rgba(0,255,136,0.06)", border: "1px solid rgba(0,255,136,0.2)", color: "#4ade80" }}
            >
              <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
              {inviterName
                ? <><strong style={{ color: "#86efac" }}>{inviterName}</strong>&nbsp;hat dich eingeladen — willkommen in der Community!</>
                : "Einladungslink erkannt — willkommen in der Community!"
              }
            </div>
          )}

          {/* Success */}
          {success && (
            <div
              className="flex items-center gap-2 px-4 py-3 rounded-lg mb-5"
              style={{ background: "rgba(0,255,136,0.1)", border: "1px solid rgba(0,255,136,0.4)" }}
            >
              <CheckCircle className="w-4 h-4 flex-shrink-0 text-green-400" />
              <span className="text-sm font-semibold" style={{ color: "#4ade80" }}>
                Konto erstellt! Weiterleitung zur Anmeldung…
              </span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div
              className="flex items-center gap-2 px-4 py-3 rounded-lg mb-5"
              style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.4)" }}
            >
              <AlertTriangle className="w-4 h-4 flex-shrink-0 text-red-400" />
              <span className="text-sm font-semibold" style={{ color: "#f87171" }}>
                {error}
              </span>
            </div>
          )}

          {!success && (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Username */}
              <div>
                <label htmlFor="reg-username" className="block text-xs font-semibold tracking-wider mb-1.5" style={{ color: "rgba(100,116,139,0.8)" }}>
                  BENUTZERNAME
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "rgba(0,212,255,0.5)" }} />
                  <input
                    id="reg-username"
                    type="text"
                    autoComplete="username"
                    required
                    minLength={3}
                    maxLength={30}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="3–30 Zeichen: A-Z, 0-9, _, -"
                    className="w-full pl-10 pr-9 py-2.5 rounded-lg text-sm text-slate-200 placeholder-slate-600 outline-none transition-all duration-200"
                    style={inputStyle}
                    onFocus={inputFocus}
                    onBlur={inputBlur}
                  />
                  {username.length >= 3 && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {usernameStatus === "checking" && <Loader2 className="w-4 h-4 animate-spin text-slate-500" />}
                      {usernameStatus === "available" && <CheckCircle className="w-4 h-4 text-green-400" />}
                      {usernameStatus === "taken" && <XCircle className="w-4 h-4 text-red-400" />}
                    </div>
                  )}
                </div>
                {!usernameFormatValid && username.length > 0 && (
                  <p className="text-xs mt-1" style={{ color: "#f87171" }}>Nur Buchstaben, Ziffern, _ und - erlaubt</p>
                )}
                {usernameFormatValid && usernameStatus === "taken" && (
                  <p className="text-xs mt-1" style={{ color: "#f87171" }}>Benutzername bereits vergeben</p>
                )}
                {usernameFormatValid && usernameStatus === "available" && (
                  <p className="text-xs mt-1" style={{ color: "#4ade80" }}>Benutzername verfügbar</p>
                )}
              </div>

              {/* Email */}
              <div>
                <label htmlFor="reg-email" className="block text-xs font-semibold tracking-wider mb-1.5" style={{ color: "rgba(100,116,139,0.8)" }}>
                  E-MAIL
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "rgba(0,212,255,0.5)" }} />
                  <input
                    id="reg-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onBlur={(e) => { setEmailTouched(true); inputBlur(e); }}
                    placeholder="deine@email.de"
                    className="w-full pl-10 pr-9 py-2.5 rounded-lg text-sm text-slate-200 placeholder-slate-600 outline-none transition-all duration-200"
                    style={inputStyle}
                    onFocus={inputFocus}
                  />
                  {emailTouched && email.length > 0 && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {emailValid
                        ? <CheckCircle className="w-4 h-4 text-green-400" />
                        : <XCircle className="w-4 h-4 text-red-400" />}
                    </div>
                  )}
                </div>
                {emailTouched && email.length > 0 && !emailValid && (
                  <p className="text-xs mt-1" style={{ color: "#f87171" }}>Ungültige E-Mail-Adresse</p>
                )}
              </div>

              {/* Password */}
              <div>
                <label htmlFor="reg-password" className="block text-xs font-semibold tracking-wider mb-1.5" style={{ color: "rgba(100,116,139,0.8)" }}>
                  PASSWORT
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "rgba(0,212,255,0.5)" }} />
                  <input
                    id="reg-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mindestens 8 Zeichen"
                    className="w-full pl-10 pr-10 py-2.5 rounded-lg text-sm text-slate-200 placeholder-slate-600 outline-none transition-all duration-200"
                    style={inputStyle}
                    onFocus={inputFocus}
                    onBlur={inputBlur}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
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
                          style={{
                            background: seg <= pwStrength.score ? pwStrength.color : "rgba(255,255,255,0.08)",
                          }}
                        />
                      ))}
                    </div>
                    <p className="text-xs" style={{ color: pwStrength.color }}>{pwStrength.label}</p>
                  </div>
                )}
              </div>

              {/* Confirm Password */}
              <div>
                <label htmlFor="reg-confirm" className="block text-xs font-semibold tracking-wider mb-1.5" style={{ color: "rgba(100,116,139,0.8)" }}>
                  PASSWORT BESTÄTIGEN
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "rgba(0,212,255,0.5)" }} />
                  <input
                    id="reg-confirm"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Passwort wiederholen"
                    className="w-full pl-10 pr-9 py-2.5 rounded-lg text-sm text-slate-200 placeholder-slate-600 outline-none transition-all duration-200"
                    style={inputStyle}
                    onFocus={inputFocus}
                    onBlur={inputBlur}
                  />
                  {confirmPassword.length > 0 && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {passwordsMatch
                        ? <CheckCircle className="w-4 h-4 text-green-400" />
                        : <XCircle className="w-4 h-4 text-red-400" />}
                    </div>
                  )}
                </div>
                {confirmPassword.length > 0 && !passwordsMatch && (
                  <p className="text-xs mt-1" style={{ color: "#f87171" }}>Passwörter stimmen nicht überein</p>
                )}
              </div>

              {/* DSGVO Consent */}
              <label className="flex items-start gap-3 cursor-pointer group">
                <div className="relative flex-shrink-0 mt-0.5">
                  <input
                    type="checkbox"
                    checked={dsgvo}
                    onChange={(e) => setDsgvo(e.target.checked)}
                    className="sr-only"
                  />
                  <div
                    className="w-4 h-4 rounded transition-all"
                    style={{
                      background: dsgvo ? "rgba(0,212,255,0.3)" : "rgba(255,255,255,0.04)",
                      border: dsgvo ? "1px solid rgba(0,212,255,0.7)" : "1px solid rgba(0,212,255,0.2)",
                      boxShadow: dsgvo ? "0 0 8px rgba(0,212,255,0.3)" : "none",
                    }}
                  >
                    {dsgvo && (
                      <svg className="w-3 h-3 m-0.5" fill="none" viewBox="0 0 12 12">
                        <path d="M2 6l3 3 5-5" stroke="#00D4FF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                </div>
                <span className="text-xs leading-relaxed" style={{ color: "rgba(100,116,139,0.7)" }}>
                  Ich habe die{" "}
                  <a href="/datenschutz" className="underline" style={{ color: "rgba(0,212,255,0.6)" }} target="_blank" rel="noopener noreferrer">Datenschutzerklärung</a>
                  {" "}gelesen und stimme der Verarbeitung meiner Daten zu.
                </span>
              </label>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading || !username.trim() || !usernameFormatValid || usernameStatus === "taken" || usernameStatus === "checking" || !emailValid || !password || password.length < 8 || password !== confirmPassword || !dsgvo}
                className="w-full py-3 rounded-lg text-sm font-bold tracking-widest transition-all duration-200 mt-2"
                style={{
                  background: loading
                    ? "rgba(0,212,255,0.1)"
                    : "linear-gradient(135deg, rgba(0,212,255,0.15), rgba(123,47,255,0.15))",
                  border: "1px solid rgba(0,212,255,0.4)",
                  color: loading ? "rgba(0,212,255,0.5)" : "#00D4FF",
                  boxShadow: loading ? "none" : "0 0 20px rgba(0,212,255,0.15)",
                  letterSpacing: "0.12em",
                  opacity: (!username.trim() || !usernameFormatValid || usernameStatus === "taken" || usernameStatus === "checking" || !emailValid || !password || password.length < 8 || password !== confirmPassword || !dsgvo) ? 0.5 : 1,
                }}
              >
                {loading ? "KONTO WIRD ERSTELLT…" : "KONTO ERSTELLEN"}
              </button>
            </form>
          )}

          {/* Plan info */}
          <div
            className="mt-4 p-3 rounded-lg"
            style={{ background: "rgba(0,212,255,0.04)", border: "1px solid rgba(0,212,255,0.1)" }}
          >
            <p className="text-center text-xs font-mono" style={{ color: "rgba(100,116,139,0.6)" }}>
              Free Plan:{" "}
              <span style={{ color: "rgba(0,212,255,0.7)" }}>3 KI-Signale/Tag</span>
              {" · "}
              <span style={{ color: "rgba(0,212,255,0.7)" }}>Paper Trading</span>
              {" · "}
              <span style={{ color: "rgba(0,212,255,0.7)" }}>dauerhaft kostenlos</span>
            </p>
          </div>

          {/* Login link */}
          <p className="text-center text-xs mt-4" style={{ color: "rgba(100,116,139,0.5)" }}>
            Bereits registriert?{" "}
            <a href="/login" className="hover:underline transition-colors font-semibold" style={{ color: "rgba(0,212,255,0.7)" }}>
              Anmelden
            </a>
          </p>

          <p className="text-center text-xs mt-2" style={{ color: "rgba(100,116,139,0.4)" }}>
            <a href="/landing" className="hover:underline transition-colors" style={{ color: "rgba(0,212,255,0.4)" }}>
              ← Zur Startseite
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
