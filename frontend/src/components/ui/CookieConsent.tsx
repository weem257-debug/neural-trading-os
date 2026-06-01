"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const STORAGE_KEY = "cookie_consent_accepted";

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) setVisible(true);
  }, []);

  function accept() {
    localStorage.setItem(STORAGE_KEY, "all");
    setVisible(false);
  }

  function decline() {
    localStorage.setItem(STORAGE_KEY, "necessary");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 md:p-6 bg-slate-900/95 backdrop-blur border-t border-slate-700 shadow-2xl">
      <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <p className="flex-1 text-sm text-slate-300 leading-relaxed">
          Wir nutzen technisch notwendige Cookies für Authentifizierung sowie Cookies von{" "}
          <span className="text-white font-medium">Stripe</span> zur Zahlungsabwicklung.
          Weitere Informationen in unserer{" "}
          <Link href="/datenschutz" className="text-cyan-400 hover:underline">
            Datenschutzerklärung
          </Link>
          .
        </p>
        <div className="flex gap-3 flex-shrink-0">
          <button
            onClick={decline}
            className="px-4 py-2 text-xs rounded-lg border border-slate-600 text-slate-400 hover:text-slate-200 hover:border-slate-500 transition-colors"
          >
            Nur notwendige
          </button>
          <button
            onClick={accept}
            className="px-4 py-2 text-xs rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-semibold transition-colors"
          >
            Akzeptieren
          </button>
        </div>
      </div>
    </div>
  );
}
