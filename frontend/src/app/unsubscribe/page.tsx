"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle, XCircle, Mail } from "lucide-react";
import { API_BASE } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { AuthCard } from "@/components/ui/AuthCard";

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
      <AuthCard subtitle="E-MAIL ABMELDUNG">
          <div className="flex flex-col items-center gap-4 text-center">
            {status === "loading" && (
              <>
                <svg
                  className="w-10 h-10 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                  style={{ color: "rgba(76,141,246,0.6)" }}
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
                    background: "rgba(63,185,80,0.1)",
                    border: "1px solid rgba(63,185,80,0.3)",
                  }}
                >
                  <CheckCircle className="w-8 h-8" style={{ color: "#3FB950" }} />
                </div>
                <div>
                  <p className="text-base font-bold text-slate-200 mb-1">Erfolgreich abgemeldet</p>
                  <p className="text-sm text-slate-500">{message}</p>
                </div>
                <div
                  className="w-full p-3 rounded-lg text-xs text-slate-500 mt-2"
                  style={{
                    background: "rgba(76,141,246,0.04)",
                    border: "1px solid rgba(76,141,246,0.1)",
                  }}
                >
                  <Mail className="w-3.5 h-3.5 inline mr-1.5" style={{ color: "rgba(76,141,246,0.5)" }} />
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
              style={{ color: "rgba(76,141,246,0.5)" }}
            >
              {isAuthenticated ? "← Zum Dashboard" : "← Zur Startseite"}
            </a>
          </div>
      </AuthCard>
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
