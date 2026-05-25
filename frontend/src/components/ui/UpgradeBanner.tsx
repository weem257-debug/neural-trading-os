"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X, Zap, ArrowRight } from "lucide-react";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";

const DISMISS_KEY = "upgrade_banner_dismissed_until";
const DISMISS_DAYS = 3;

const SKIP_PATHS = new Set(["/pricing", "/billing", "/login", "/landing", "/"]);

export function UpgradeBanner() {
  const pathname = usePathname();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());
  const [show, setShow] = useState(false);
  const [plan, setPlan] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || SKIP_PATHS.has(pathname)) return;

    const dismissedUntil = localStorage.getItem(DISMISS_KEY);
    if (dismissedUntil && Date.now() < Number(dismissedUntil)) return;

    api.billing.status().then((s) => {
      if (s?.plan === "free" || s?.plan == null) {
        setPlan(s?.plan ?? "free");
        setShow(true);
      }
    }).catch(() => {
      // billing not configured — show anyway for upsell
      setShow(true);
    });
  }, [isAuthenticated, pathname]);

  function dismiss() {
    const until = Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000;
    localStorage.setItem(DISMISS_KEY, String(until));
    setShow(false);
  }

  if (!show) return null;

  return (
    <div
      className="mb-4 flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl text-xs"
      style={{
        background: "linear-gradient(90deg, rgba(0,212,255,0.08) 0%, rgba(123,47,255,0.08) 100%)",
        border: "1px solid rgba(0,212,255,0.2)",
      }}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <Zap className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
        <span className="text-slate-300 font-medium">
          You&apos;re on the <span className="text-cyan-400">Free plan</span> — limited to 3 signals/day.
        </span>
        <Link
          href="/signals/marketplace"
          className="text-neon-green hover:underline font-semibold"
        >
          View track record
        </Link>
        <span className="text-slate-600">·</span>
        <Link
          href="/pricing"
          className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300 font-semibold"
        >
          Upgrade from €19/mo <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
      <button
        onClick={dismiss}
        className="shrink-0 text-slate-600 hover:text-slate-400 transition-colors"
        aria-label="Dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
