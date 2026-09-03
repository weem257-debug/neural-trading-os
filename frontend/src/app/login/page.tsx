"use client";

import { useState, useCallback, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Lock, User } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { API_BASE } from "@/lib/api";
import { safeRedirectPath } from "@/lib/safeRedirect";
import { AuthCard, AuthError } from "@/components/ui/AuthCard";
import { authInputStyle, authInputFocus, authInputBlur } from "@/components/ui/AuthInput";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const login = useAuthStore((s) => s.login);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());

  useEffect(() => {
    if (isAuthenticated) {
      const redirectTo =
        searchParams.get("next") ?? searchParams.get("from") ?? "/dashboard";
      router.replace(safeRedirectPath(redirectTo));
    }
  }, [isAuthenticated, router, searchParams]);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setLoading(true);

      try {
        const body = new URLSearchParams();
        body.append("username", username.trim());
        body.append("password", password);

        const resp = await fetch(`${API_BASE}/api/auth/token`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: body.toString(),
        });

        if (!resp.ok) {
          try {
            const errData = await resp.json();
            setError(errData.detail ?? "Falscher Benutzername oder Passwort");
          } catch {
            setError("Falscher Benutzername oder Passwort");
          }
          setLoading(false);
          return;
        }

        const data = await resp.json();
        const token: string = data.access_token;
        const expiresIn: number | undefined = data.expires_in;
        // Fetch role + tier from /me
        let role: string | undefined;
        let tier: string | undefined;
        try {
          const meResp = await fetch(`${API_BASE}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
          if (meResp.ok) { const me = await meResp.json(); role = me.role; tier = me.tier; }
        } catch { /* ignore */ }
        login(token, username.trim(), role, expiresIn, tier);
        router.push(safeRedirectPath(searchParams.get("next")));
      } catch {
        setError("Zugriff verweigert");
        setLoading(false);
      }
    },
    [username, password, login, router, searchParams]
  );

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      {/* Login Card */}
      <AuthCard subtitle="SICHERER ZUGANG">
          {/* Error Banner */}
          {error && (
            <AuthError pulse glow textClassName="text-sm font-semibold tracking-wider">
              {error}
            </AuthError>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username */}
            <div>
              <label
                htmlFor="username"
                className="block text-xs font-semibold tracking-wider mb-1.5"
                style={{ color: "rgba(100,116,139,0.8)" }}
              >
                USERNAME
              </label>
              <div className="relative">
                <User
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                  style={{ color: "rgba(76,141,246,0.5)" }}
                />
                <input
                  id="username"
                  type="text"
                  autoComplete="username"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Benutzername eingeben"
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg text-sm text-slate-200 placeholder-slate-600 outline-none transition-all duration-200"
                  style={authInputStyle}
                  onFocus={authInputFocus}
                  onBlur={authInputBlur}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="block text-xs font-semibold tracking-wider mb-1.5"
                style={{ color: "rgba(100,116,139,0.8)" }}
              >
                PASSWORD
              </label>
              <div className="relative">
                <Lock
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                  style={{ color: "rgba(76,141,246,0.5)" }}
                />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Passwort eingeben"
                  className="w-full pl-10 pr-10 py-2.5 rounded-lg text-sm text-slate-200 placeholder-slate-600 outline-none transition-all duration-200"
                  style={authInputStyle}
                  onFocus={authInputFocus}
                  onBlur={authInputBlur}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                  aria-label={showPassword ? "Passwort ausblenden" : "Passwort anzeigen"}
                  style={{ color: "rgba(100,116,139,0.6)" }}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || !username.trim() || !password}
              className="w-full py-3 rounded-lg text-sm font-bold tracking-widest transition-all duration-200 mt-2 relative overflow-hidden"
              style={{
                background: loading
                  ? "rgba(76,141,246,0.1)"
                  : "linear-gradient(135deg, rgba(76,141,246,0.15), rgba(163,113,247,0.15))",
                border: "1px solid rgba(76,141,246,0.4)",
                color: loading ? "rgba(76,141,246,0.5)" : "#4C8DF6",
                boxShadow: loading ? "none" : "0 0 20px rgba(76,141,246,0.15)",
                letterSpacing: "0.12em",
              }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg
                    className="w-4 h-4 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  ANMELDUNG LÄUFT...
                </span>
              ) : (
                "ANMELDEN"
              )}
            </button>
          </form>

          {/* Register link + forgot password */}
          <p className="text-center text-xs mt-4" style={{ color: "rgba(100,116,139,0.5)" }}>
            Noch kein Konto?{" "}
            <a
              href={(() => {
                try {
                  const next = searchParams.get("next") ?? "";
                  const planParam = new URLSearchParams(next.split("?")[1] ?? "").get("plan");
                  return planParam ? `/register?plan=${planParam}` : "/register";
                } catch { return "/register"; }
              })()}
              className="hover:underline transition-colors font-semibold"
              style={{ color: "rgba(76,141,246,0.7)" }}
            >
              Jetzt registrieren
            </a>
          </p>
          <p className="text-center text-xs mt-2" style={{ color: "rgba(100,116,139,0.4)" }}>
            <a href="/forgot-password" className="hover:underline transition-colors" style={{ color: "rgba(76,141,246,0.4)" }}>
              Passwort vergessen?
            </a>
          </p>

          {/* Back link */}
          <p className="text-center text-xs mt-2" style={{ color: "rgba(100,116,139,0.4)" }}>
            <a href="/landing" className="hover:underline transition-colors" style={{ color: "rgba(76,141,246,0.4)" }}>
              ← Zurück zur Startseite
            </a>
          </p>
      </AuthCard>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
