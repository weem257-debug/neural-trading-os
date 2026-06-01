"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  CreditCard, Check, Zap, Shield, Crown, TrendingUp, Brain,
  ArrowRight, ExternalLink, AlertTriangle, RefreshCw, CheckCircle, FileText,
} from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { api } from "@/lib/api";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useAuthStore } from "@/store/authStore";

interface BillingStatus {
  user_id: string;
  plan: string;
  plan_name: string;
  price_eur: number;
  signals_per_day: number;
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  stripe_configured: boolean;
}

const PLAN_ICONS: Record<string, React.ElementType> = {
  free: Shield,
  basic: TrendingUp,
  pro: Brain,
  institutional: Crown,
  signals: Zap,
};

const PLAN_COLORS: Record<string, { text: string; border: string; bg: string }> = {
  free:         { text: "#94a3b8", border: "rgba(148,163,184,0.25)", bg: "rgba(148,163,184,0.08)" },
  basic:        { text: "#00D4FF", border: "rgba(0,212,255,0.3)",    bg: "rgba(0,212,255,0.08)"   },
  pro:          { text: "#7B2FFF", border: "rgba(123,47,255,0.4)",   bg: "rgba(123,47,255,0.1)"   },
  institutional:{ text: "#FF0080", border: "rgba(255,0,128,0.3)",    bg: "rgba(255,0,128,0.08)"   },
  signals:      { text: "#00FF88", border: "rgba(0,255,136,0.3)",    bg: "rgba(0,255,136,0.08)"   },
};

interface UsageStatus {
  plan: string;
  signals_used_today: number;
  signals_limit: number;
  signals_remaining: number;
  reset_at: string;
}

interface InvoiceData {
  id: string;
  number: string | null;
  date: string;
  amount_eur: number;
  status: string;
  pdf_url: string | null;
  hosted_url: string | null;
}

const UPGRADE_PLANS = [
  {
    id: "basic", label: "Basic", price: 29, priceAnnual: 290, color: "cyan",
    features: ["10 Signale/Tag", "Preis-Alerts", "Backtesting", "Paper Trading", "Alle Broker"],
  },
  {
    id: "pro", label: "Pro", price: 99, priceAnnual: 990, color: "purple",
    features: ["50 Signale/Tag", "Elliott Wave KI", "Multi-Broker Depot", "Portfolio-Analyse", "Prioritäts-Support"],
    highlight: true,
  },
  {
    id: "signals", label: "Signals Add-on", price: 19, priceAnnual: 190, color: "green",
    features: ["+10 Signale/Tag", "Ergänzung zu jedem Plan", "Kein Vertrag"],
  },
  {
    id: "institutional", label: "Institutional", price: 299, priceAnnual: 2990, color: "pink",
    features: ["Unbegrenzte Signale", "API-Zugang", "Dedizierter Support", "White-Label Option"],
  },
];

function SuccessBanner() {
  const params = useSearchParams();
  if (!params.get("success")) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-3 p-4 rounded-xl mb-6"
      style={{ background: "rgba(0,255,136,0.1)", border: "1px solid rgba(0,255,136,0.25)" }}
    >
      <CheckCircle className="w-5 h-5 text-neon-green flex-shrink-0" />
      <div>
        <p className="text-sm font-semibold text-neon-green">Abonnement aktiviert!</p>
        <p className="text-xs text-slate-400">Dein Plan wurde aktualisiert. Es kann einige Sekunden dauern bis es sichtbar ist.</p>
      </div>
    </motion.div>
  );
}

function UsageCard({ usage }: { usage: UsageStatus }) {
  const unlimited = usage.signals_limit < 0;
  const pct = unlimited ? 0 : Math.min(100, (usage.signals_used_today / usage.signals_limit) * 100);
  const barColor = pct >= 90 ? "#FF0080" : pct >= 70 ? "#FFD700" : "#00FF88";

  return (
    <GlassCard padding="p-4" className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Zap className="w-3.5 h-3.5 text-neon-green" />
          <p className="text-xs font-semibold text-slate-300">Signale heute</p>
        </div>
        <p className="text-xs text-slate-500">
          {unlimited ? "Unbegrenzt" : `${usage.signals_used_today} / ${usage.signals_limit}`}
        </p>
      </div>
      {!unlimited && (
        <div className="h-1.5 rounded-full bg-slate-800">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, background: barColor }}
          />
        </div>
      )}
      {!unlimited && usage.signals_remaining === 0 && (
        <p className="text-xs text-red-400 mt-1.5">Limit erreicht — Upgrade für mehr Signale.</p>
      )}
    </GlassCard>
  );
}

function BillingPageInner() {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [usage, setUsage] = useState<UsageStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [annual, setAnnual] = useState(true);
  const [invoices, setInvoices] = useState<InvoiceData[]>([]);
  const syncUserInfo = useAuthStore((s) => s.syncUserInfo);
  const searchParams = useSearchParams();
  const planParam = searchParams.get("plan");
  const plansRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // After successful Stripe checkout, sync tier from server so JWT/store reflects new plan
    if (searchParams.get("success")) {
      syncUserInfo();
    }
    Promise.allSettled([api.billing.status(), api.billing.usage()]).then(([s, u]) => {
      if (s.status === "fulfilled") {
        setStatus(s.value);
        if (s.value.stripe_configured && s.value.plan !== "free") {
          api.billing.invoices().then(r => setInvoices(r.invoices)).catch(() => {});
        }
      } else setError((s.reason as Error).message);
      if (u.status === "fulfilled") setUsage(u.value);
    }).finally(() => setLoading(false));
  }, [searchParams, syncUserInfo]);

  // Scroll preselected plan into view after data loads
  useEffect(() => {
    if (!loading && planParam && plansRef.current) {
      setTimeout(() => plansRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 150);
    }
  }, [loading, planParam]);

  async function handleUpgrade(planId: string) {
    setCheckoutLoading(planId);
    setError(null);
    try {
      const { checkout_url } = await api.billing.checkout(planId, annual);
      window.location.href = checkout_url;
    } catch (e: unknown) {
      setError((e as Error).message ?? "Checkout-Session konnte nicht erstellt werden.");
      setCheckoutLoading(null);
    }
  }

  async function handlePortal() {
    setPortalLoading(true);
    setError(null);
    try {
      const { portal_url } = await api.billing.portal();
      window.open(portal_url, "_blank");
    } catch (e: unknown) {
      setError((e as Error).message ?? "Billing-Portal konnte nicht geöffnet werden.");
    } finally {
      setPortalLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 text-cyan-400 animate-spin" />
      </div>
    );
  }

  const planColor = PLAN_COLORS[status?.plan ?? "free"] ?? PLAN_COLORS.free;
  const PlanIcon = PLAN_ICONS[status?.plan ?? "free"] ?? Shield;

  return (
    <div className="max-w-3xl">
      <SuccessBanner />
      {usage && <UsageCard usage={usage} />}

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg mb-4"
          style={{ background: "rgba(255,0,128,0.08)", border: "1px solid rgba(255,0,128,0.2)" }}>
          <AlertTriangle className="w-4 h-4 text-neon-pink mt-0.5 flex-shrink-0" />
          <p className="text-sm text-slate-300">{error}</p>
        </div>
      )}

      {/* Current plan card */}
      <GlassCard padding="p-6" className="mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: planColor.bg, border: `1px solid ${planColor.border}` }}>
              <PlanIcon className="w-5 h-5" style={{ color: planColor.text }} />
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-0.5">Aktueller Plan</p>
              <p className="text-xl font-bold text-white">{status?.plan_name ?? "Free"}</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {status?.price_eur ? (
              <div className="text-right">
                <p className="text-2xl font-bold text-white">€{status.price_eur}</p>
                <p className="text-xs text-slate-500">/Monat</p>
              </div>
            ) : (
              <div className="text-right">
                <p className="text-2xl font-bold text-white">Kostenlos</p>
                <p className="text-xs text-slate-500">dauerhaft</p>
              </div>
            )}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="rounded-lg p-3" style={{ background: "rgba(255,255,255,0.03)" }}>
            <p className="text-xs text-slate-500 mb-1">KI-Signale/Tag</p>
            <p className="text-sm font-bold text-white">
              {status?.signals_per_day === -1 ? "Unbegrenzt" : (status?.signals_per_day ?? 3)}
            </p>
          </div>
          <div className="rounded-lg p-3" style={{ background: "rgba(255,255,255,0.03)" }}>
            <p className="text-xs text-slate-500 mb-1">Status</p>
            <p className="text-sm font-bold" style={{ color: status?.status === "active" ? "#00FF88" : "#FF0080" }}>
              {status?.status ?? "active"}
            </p>
          </div>
          {status?.current_period_end && (
            <div className="rounded-lg p-3" style={{ background: "rgba(255,255,255,0.03)" }}>
              <p className="text-xs text-slate-500 mb-1">Verlängert am</p>
              <p className="text-sm font-bold text-white">
                {new Date(status.current_period_end).toLocaleDateString("de-DE", { day: "numeric", month: "short", year: "numeric" })}
              </p>
            </div>
          )}
        </div>

        {status?.cancel_at_period_end && (
          <div className="mt-3 flex items-center gap-2 text-xs text-amber-400">
            <AlertTriangle className="w-3.5 h-3.5" />
            Abonnement endet am Ende des Abrechnungszeitraums.
          </div>
        )}

        {status?.stripe_configured && status.plan !== "free" && (
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={handlePortal}
              disabled={portalLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 transition-all duration-200 hover:text-white"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
            >
              {portalLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
              Abonnement verwalten
            </button>
          </div>
        )}
      </GlassCard>

      {/* Invoice history */}
      {invoices.length > 0 && (
        <GlassCard padding="p-5" className="mb-6">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-4 h-4 text-slate-400" />
            <p className="text-xs font-semibold tracking-wider text-slate-500">RECHNUNGEN</p>
          </div>
          <div className="space-y-2">
            {invoices.map(inv => (
              <div
                key={inv.id}
                className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xs text-slate-500 flex-shrink-0">{inv.date}</span>
                  {inv.number && (
                    <span className="text-xs font-mono text-slate-400 truncate">{inv.number}</span>
                  )}
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-sm font-bold text-slate-200">€{inv.amount_eur.toFixed(2)}</span>
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                    style={{
                      background: inv.status === "paid" ? "rgba(0,255,136,0.12)" : "rgba(245,158,11,0.12)",
                      color: inv.status === "paid" ? "#00FF88" : "#f59e0b",
                    }}
                  >
                    {inv.status === "paid" ? "Bezahlt" : inv.status}
                  </span>
                  {inv.pdf_url && (
                    <a
                      href={inv.pdf_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      PDF
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {/* Upgrade options */}
      {status?.plan === "free" && (
        <>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-widest">Upgrade Plan</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setAnnual(false)}
                className="text-xs px-3 py-1.5 rounded-lg transition-all duration-200"
                style={{
                  background: !annual ? "rgba(0,212,255,0.12)" : "transparent",
                  color: !annual ? "#00D4FF" : "#64748b",
                  border: !annual ? "1px solid rgba(0,212,255,0.3)" : "1px solid transparent",
                }}
              >
                Monatlich
              </button>
              <button
                onClick={() => setAnnual(true)}
                className="relative text-xs px-3 py-1.5 rounded-lg transition-all duration-200"
                style={{
                  background: annual ? "rgba(0,212,255,0.12)" : "transparent",
                  color: annual ? "#00D4FF" : "#64748b",
                  border: annual ? "1px solid rgba(0,212,255,0.3)" : "1px solid transparent",
                }}
              >
                Jährlich
                <span
                  className="absolute -top-2 -right-2 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ background: "#00FF88", color: "#000" }}
                >
                  -17%
                </span>
              </button>
            </div>
          </div>

          {!status.stripe_configured && (
            <div className="p-4 rounded-xl mb-4 space-y-2"
              style={{ background: "rgba(0,212,255,0.05)", border: "1px solid rgba(0,212,255,0.15)" }}>
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                <p className="text-xs font-semibold text-cyan-300">Stripe noch nicht aktiviert</p>
              </div>
              <p className="text-xs text-slate-400">
                Setze folgende Umgebungsvariablen im Backend, um Zahlungen zu aktivieren:
              </p>
              <div className="rounded-lg p-3 font-mono text-xs space-y-1"
                style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.05)" }}>
                {["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_BASIC", "STRIPE_PRICE_PRO", "STRIPE_PRICE_INST", "FRONTEND_URL"].map(v => (
                  <p key={v} className="text-slate-400"><span className="text-cyan-500">{v}</span>=...</p>
                ))}
              </div>
              <p className="text-xs text-slate-500">
                Stripe-Schlüssel und Preis-IDs findest du im{" "}
                <a href="https://dashboard.stripe.com" target="_blank" rel="noopener noreferrer" className="text-cyan-400 underline">Stripe Dashboard</a>.
              </p>
            </div>
          )}

          <div ref={plansRef} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {UPGRADE_PLANS.map((p) => {
              const colorMap: Record<string, { accent: string; border: string; bg: string }> = {
                cyan:   { accent: "#00D4FF", border: "rgba(0,212,255,0.3)",   bg: "rgba(0,212,255,0.06)"   },
                purple: { accent: "#7B2FFF", border: "rgba(123,47,255,0.4)",  bg: "rgba(123,47,255,0.08)"  },
                green:  { accent: "#00FF88", border: "rgba(0,255,136,0.3)",   bg: "rgba(0,255,136,0.06)"   },
                pink:   { accent: "#FF0080", border: "rgba(255,0,128,0.3)",   bg: "rgba(255,0,128,0.06)"   },
              };
              const c = colorMap[p.color] ?? colorMap.cyan;
              const isPreselected = planParam === p.id;
              return (
                <motion.div
                  key={p.id}
                  whileHover={{ scale: 1.02 }}
                  className="rounded-xl p-4 flex flex-col relative"
                  style={{
                    background: (p.highlight || isPreselected) ? c.bg : "rgba(255,255,255,0.03)",
                    border: `1px solid ${(p.highlight || isPreselected) ? c.border : "rgba(255,255,255,0.08)"}`,
                    boxShadow: isPreselected ? `0 0 20px ${c.bg}` : undefined,
                  }}
                >
                  {isPreselected && !p.highlight && (
                    <span
                      className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-xs font-bold px-2 py-0.5 rounded-full"
                      style={{ background: c.accent, color: "#000", fontSize: "9px" }}
                    >
                      AUSGEWÄHLT
                    </span>
                  )}
                  {p.highlight && !isPreselected && (
                    <span
                      className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-xs font-bold px-2 py-0.5 rounded-full"
                      style={{ background: c.accent, color: "#000", fontSize: "9px" }}
                    >
                      BELIEBT
                    </span>
                  )}
                  {isPreselected && p.highlight && (
                    <span
                      className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-xs font-bold px-2 py-0.5 rounded-full"
                      style={{ background: c.accent, color: "#000", fontSize: "9px" }}
                    >
                      AUSGEWÄHLT
                    </span>
                  )}
                  <p className="text-sm font-bold text-white mb-0.5">{p.label}</p>
                  {annual ? (
                    <div className="mb-3">
                      <p className="text-2xl font-bold text-white">
                        €{p.priceAnnual}<span className="text-xs text-slate-500">/Jahr</span>
                      </p>
                      <p className="text-xs text-slate-500">
                        ≈ €{Math.round(p.priceAnnual / 12)}/Mo — 2 Monate gratis
                      </p>
                    </div>
                  ) : (
                    <p className="text-2xl font-bold text-white mb-3">
                      €{p.price}<span className="text-xs text-slate-500">/Mo</span>
                    </p>
                  )}
                  <ul className="space-y-1 mb-4 flex-1">
                    {p.features.map((f) => (
                      <li key={f} className="flex items-center gap-1.5 text-xs text-slate-400">
                        <Check className="w-3 h-3 flex-shrink-0" style={{ color: c.accent }} />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => handleUpgrade(p.id)}
                    disabled={!status.stripe_configured || checkoutLoading === p.id}
                    className="flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all duration-200 disabled:opacity-40"
                    style={{
                      background: status.stripe_configured ? c.bg : "rgba(255,255,255,0.04)",
                      border: `1px solid ${c.border}`,
                      color: c.accent,
                    }}
                  >
                    {checkoutLoading === p.id
                      ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      : <><ArrowRight className="w-3.5 h-3.5" /> Upgrade</>
                    }
                  </button>
                </motion.div>
              );
            })}
          </div>

          <div className="mt-4 text-center">
            <Link href="/pricing" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors">
              Alle Pläne im Vergleich <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </>
      )}

      {/* Already on paid plan */}
      {status?.plan !== "free" && status && (
        <div className="flex items-center gap-2 p-4 rounded-xl"
          style={{ background: "rgba(0,255,136,0.06)", border: "1px solid rgba(0,255,136,0.15)" }}>
          <CheckCircle className="w-4 h-4 text-neon-green flex-shrink-0" />
          <p className="text-sm text-slate-300">
            Du bist auf dem <span className="text-neon-green font-semibold">{status.plan_name}</span>-Plan.
            Nutze &quot;Abonnement verwalten&quot; oben um zu wechseln oder zu kündigen.
          </p>
        </div>
      )}
    </div>
  );
}

export default function BillingPage() {
  return (
    <div className="p-6 md:p-8">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <div className="flex items-center gap-2 mb-1">
          <CreditCard className="w-5 h-5 text-cyan-400" />
          <h1 className="text-xl font-bold text-white">Billing & Subscription</h1>
        </div>
        <p className="text-sm text-slate-500">Abonnement, Zahlungsmethode und Nutzungslimits verwalten.</p>
      </motion.div>

      <Suspense>
        <BillingPageInner />
      </Suspense>
    </div>
  );
}
