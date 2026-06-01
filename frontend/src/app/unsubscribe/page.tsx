"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle, XCircle, Cpu, Mail } from "lucide-react";
import { API_BASE } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";

function UnsubscribeContent() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());

  useEffect(() => {
    const username = searchParams.get("username");
    const token = searchParams.get("token");

    if (!username || !token) {
      setStatus("error");
      setMessage("Ungültiger Abmelde-Link. Bitte nutze den Link aus der E-Mail.");
      return;
    }

    fetch(`${API_BASE}/api/auth/unsubscribe?username=${encodeURIComponent(username)}&token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (res.ok) {
          setStatus("success");
          setMessage("Du wurdest erfolgreich von allen Marketing-E-Mails abgemeldet.");
        } else {
          const data = await res.json().catch(() => ({}));
          setStatus("error");
          setMessage(data.detail ?? "Der Abmelde-Link ist ungültig oder abgelaufen.");
        }
      })
      .catch(() => {
        setStatus("error");
        setMessage("Verbindungsfehler. Bitte versuche es später erneut.");
      });
  }, [searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
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
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(0,212,255,0.6), transparent)",
          }}
        />

        <div className="px-8 py-10">
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
              E-MAIL ABMELDUNG
            </p>
          </div>

          <div className="flex flex-col items-center gap-4 text-center">
            {status === "loading" && (
              <>
                <svg
                  className="w-10 h-10 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                  style={{ color: "rgba(0,212,255,0.6)" }}
                >
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <p className="text-sm text-slate-400">Abmeldung wird verarbeitet…</p>
              </>
            )}

            {status === "success" && (
              <>
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center"
                  style={{
                    background: "rgba(0,255,136,0.1)",
                    border: "1px solid rgba(0,255,136,0.3)",
                  }}
                >
                  <CheckCircle className="w-8 h-8" style={{ color: "#00FF88" }} />
                </div>
                <div>
                  <p className="text-base font-bold text-slate-200 mb-1">Erfolgreich abgemeldet</p>
                  <p className="text-sm text-slate-500">{message}</p>
                </div>
                <div
                  className="w-full p-3 rounded-lg text-xs text-slate-500 mt-2"
                  style={{
                    background: "rgba(0,212,255,0.04)",
                    border: "1px solid rgba(0,212,255,0.1)",
                  }}
                >
                  <Mail className="w-3.5 h-3.5 inline mr-1.5" style={{ color: "rgba(0,212,255,0.5)" }} />
                  Du erhältst weiterhin transaktionale E-Mails (z.B. Sicherheitshinweise, Rechnungen).
                </div>
              </>
            )}

            {status === "error" && (
              <>
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center"
                  style={{
                    background: "rgba(239,68,68,0.1)",
                    border: "1px solid rgba(239,68,68,0.3)",
                  }}
                >
                  <XCircle className="w-8 h-8 text-red-400" />
                </div>
                <div>
                  <p className="text-base font-bold text-slate-200 mb-1">Abmeldung fehlgeschlagen</p>
                  <p className="text-sm text-slate-500">{message}</p>
                </div>
              </>
            )}

            <a
              href={isAuthenticated ? "/dashboard" : "/landing"}
              className="mt-4 text-xs hover:underline transition-colors"
              style={{ color: "rgba(0,212,255,0.5)" }}
            >
              {isAuthenticated ? "← Zum Dashboard" : "← Zur Startseite"}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function UnsubscribePage() {
  return (
    <Suspense>
      <UnsubscribeContent />
    </Suspense>
  );
}
