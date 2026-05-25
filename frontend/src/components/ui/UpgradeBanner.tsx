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

interface UsageInfo {
  signals_used_today: number;
  signals_limit: number;
}

export function UpgradeBanner() {
  const pathname = usePathname();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());
  const [show, setShow] = useState(false);
  const [usage, setUsage] = useState<UsageInfo | null>(null);

  useEffect(() => {
    if (!isAuthenticated || SKIP_PATHS.has(pathname)) return;

    const dismissedUntil = localStorage.getItem(DISMISS_KEY);
    if (dismissedUntil && Date.now() < Number(dismissedUntil)) return;

    api.billing.usage().then((u) => {
      if (u?.signals_limit > 0 && u?.signals_limit <= 10) {
        setUsage({ signals_used_today: u.signals_used_today, signals_limit: u.signals_limit });
        setShow(true);
      }
    }).catch(() => {
      setShow(true);
    });
  }, [isAuthenticated, pathname]);

  function dismiss() {
    const until = Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000;
    localStorage.setItem(DISMISS_KEY, String(until));
    setShow(false);
  }

  if (!show) return null;

  const isNearLimit = usage && usage.signals_used_today >= usage.signals_limit - 1;

  return (
    <div
      className="mb-4 flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl text-xs"
      style={{
        background: isNearLimit
          ? "linear-gradient(90deg, rgba(255,0,128,0.08) 0%, rgba(123,47,255,0.08) 100%)"
          : "linear-gradient(90deg, rgba(0,212,255,0.08) 0%, rgba(123,47,255,0.08) 100%)",
        border: `1px solid ${isNearLimit ? "rgba(255,0,128,0.25)" : "rgba(0,212,255,0.2)"}`,
      }}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <Zap className={`w-3.5 h-3.5 shrink-0 ${isNearLimit ? "text-neon-pink" : "text-cyan-400"}`} />
        <span className="text-slate-300 font-medium">
          {usage ? (
            <>
              <span className={isNearLimit ? "text-neon-pink" : "text-cyan-400"}>
                {usage.signals_used_today}/{usage.signals_limit} signals used today
              </span>
              {" "}— Free plan limit.
            </>
          ) : (
            <>You&apos;re on the <span className="text-cyan-400">Free plan</span> — limited to 3 signals/day.</>
          )}
        </span>
        <Link href="/signals/marketplace" className="text-neon-green hover:underline font-semibold">
          Track record
        </Link>
        <span className="text-slate-600">·</span>
        <Link href="/pricing" className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300 font-semibold">
          Upgrade from €19/mo <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
      <button onClick={dismiss} className="shrink-0 text-slate-600 hover:text-slate-400 transition-colors" aria-label="Dismiss">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
