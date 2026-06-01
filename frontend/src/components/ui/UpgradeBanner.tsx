"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X, Zap, ArrowRight } from "lucide-react";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";

const DISMISS_KEY = "upgrade_banner_dismissed_until";
const DISMISS_DAYS = 1;
// Show only when >= 50% of daily quota is consumed
const SHOW_THRESHOLD = 0.5;

const SKIP_PATHS = new Set(["/pricing", "/billing", "/login", "/landing", "/"]);

interface UsageInfo {
  plan: string;
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
      // Only show for limited plans (free=3, basic=10) when >= SHOW_THRESHOLD consumed
      const isLimitedPlan = u?.signals_limit > 0 && u?.signals_limit <= 10;
      const usageFraction = u?.signals_limit > 0 ? u.signals_used_today / u.signals_limit : 0;
      if (isLimitedPlan && usageFraction >= SHOW_THRESHOLD) {
        setUsage({
          plan: u.plan,
          signals_used_today: u.signals_used_today,
          signals_limit: u.signals_limit,
        });
        setShow(true);
      }
    }).catch(() => {
      // Don't show banner if usage can't be determined
    });
  }, [isAuthenticated, pathname]);

  function dismiss() {
    const until = Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000;
    localStorage.setItem(DISMISS_KEY, String(until));
    setShow(false);
  }

  if (!show || !usage) return null;

  const isAtLimit = usage.signals_used_today >= usage.signals_limit;
  const isNearLimit = usage.signals_used_today >= usage.signals_limit - 1;
  const isBasic = usage.plan === "basic";

  const upgradeHref = isBasic ? "/billing?plan=pro" : "/billing?plan=basic";
  const upgradeLabel = isBasic ? "Auf Pro upgraden" : "Ab €29/Monat upgraden";

  return (
    <div
      className="mb-4 flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl text-xs"
      style={{
        background: isNearLimit
          ? "linear-gradient(90deg, rgba(255,0,128,0.08) 0%, rgba(123,47,255,0.08) 100%)"
          : "linear-gradient(90deg, rgba(255,215,0,0.06) 0%, rgba(123,47,255,0.06) 100%)",
        border: `1px solid ${isNearLimit ? "rgba(255,0,128,0.3)" : "rgba(255,215,0,0.2)"}`,
      }}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <Zap
          className="w-3.5 h-3.5 shrink-0"
          style={{ color: isNearLimit ? "#FF0080" : "#FFD700" }}
        />
        <span className="text-slate-300 font-medium">
          <span style={{ color: isAtLimit ? "#FF0080" : isNearLimit ? "#FF6098" : "#FFD700" }}>
            {usage.signals_used_today}/{usage.signals_limit} Signale
          </span>
          {" "}heute genutzt
          {isAtLimit
            ? " — Tageslimit erreicht."
            : isNearLimit
            ? " — noch 1 Signal verfügbar."
            : "."}
        </span>
        <span className="text-slate-600">·</span>
        <Link
          href={upgradeHref}
          className="flex items-center gap-1 font-semibold hover:underline transition-colors"
          style={{ color: isNearLimit ? "#FF0080" : "#00D4FF" }}
        >
          {upgradeLabel} <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
      <button
        onClick={dismiss}
        className="shrink-0 text-slate-600 hover:text-slate-400 transition-colors"
        aria-label="Banner schließen"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
