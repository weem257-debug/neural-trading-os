"use client";

import { useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Cpu, Lock, User, AlertTriangle } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { API_BASE } from "@/lib/api";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const login = useAuthStore((s) => s.login);

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
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: body.toString(),
        });

        if (!resp.ok) {
          setError("Access Denied");
          setLoading(false);
          return;
        }

        const data = await resp.json();
        const token: string = data.access_token;
        login(token, username.trim());
        const next = searchParams.get("next");
        router.push(next && next.startsWith("/") ? next : "/dashboard");
      } catch {
        setError("Access Denied");
        setLoading(false);
      }
    },
    [username, password, login, router]
  );

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      {/* Login Card */}
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
        {/* Top accent line */}
        <div
          className="absolute top-0 left-8 right-8 h-px rounded-full"
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(0,212,255,0.6), transparent)",
          }}
        />

        <div className="px-8 py-10">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div
              className="w-14 h-14 rounded-xl flex items-center justify-center mb-4"
              style={{
                background:
                  "linear-gradient(135deg, rgba(0,212,255,0.15), rgba(123,47,255,0.15))",
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
            <p
              className="text-xs mt-1 tracking-wider"
              style={{ color: "rgba(100,116,139,0.7)" }}
            >
              SECURE ACCESS PORTAL
            </p>
          </div>

          {/* Error Banner */}
          {error && (
            <div
              className="flex items-center gap-2 px-4 py-3 rounded-lg mb-5 animate-pulse"
              style={{
                background: "rgba(239,68,68,0.1)",
                border: "1px solid rgba(239,68,68,0.4)",
                boxShadow: "0 0 16px rgba(239,68,68,0.15)",
              }}
            >
              <AlertTriangle className="w-4 h-4 flex-shrink-0 text-red-400" />
              <span
                className="text-sm font-semibold tracking-wider"
                style={{ color: "#f87171" }}
              >
                {error}
              </span>
            </div>
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
                  style={{ color: "rgba(0,212,255,0.5)" }}
                />
                <input
                  id="username"
                  type="text"
                  autoComplete="username"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter username"
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg text-sm text-slate-200 placeholder-slate-600 outline-none transition-all duration-200"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(0,212,255,0.15)",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.border = "1px solid rgba(0,212,255,0.5)";
                    e.currentTarget.style.boxShadow = "0 0 12px rgba(0,212,255,0.1)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.border = "1px solid rgba(0,212,255,0.15)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
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
                  style={{ color: "rgba(0,212,255,0.5)" }}
                />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  className="w-full pl-10 pr-10 py-2.5 rounded-lg text-sm text-slate-200 placeholder-slate-600 outline-none transition-all duration-200"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(0,212,255,0.15)",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.border = "1px solid rgba(0,212,255,0.5)";
                    e.currentTarget.style.boxShadow = "0 0 12px rgba(0,212,255,0.1)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.border = "1px solid rgba(0,212,255,0.15)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                  aria-label={showPassword ? "Hide password" : "Show password"}
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
                  ? "rgba(0,212,255,0.1)"
                  : "linear-gradient(135deg, rgba(0,212,255,0.15), rgba(123,47,255,0.15))",
                border: "1px solid rgba(0,212,255,0.4)",
                color: loading ? "rgba(0,212,255,0.5)" : "#00D4FF",
                boxShadow: loading ? "none" : "0 0 20px rgba(0,212,255,0.15)",
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
                  AUTHENTICATING...
                </span>
              ) : (
                "ACCESS SYSTEM"
              )}
            </button>
          </form>

          {/* Footer */}
          <p
            className="text-center text-xs mt-6 font-mono"
            style={{ color: "rgba(100,116,139,0.35)" }}
          >
            v0.7.0 — claude-sonnet-4-6
          </p>
        </div>
      </div>
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
