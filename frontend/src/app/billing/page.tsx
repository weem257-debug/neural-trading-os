"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  CreditCard, Check, Zap, Shield, Crown, TrendingUp, Brain,
  ArrowRight, ExternalLink, AlertTriangle, RefreshCw, CheckCircle,
} from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { api } from "@/lib/api";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

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

const UPGRADE_PLANS = [
  { id: "basic",  label: "Basic",         price: 29,  color: "cyan"   },
  { id: "pro",    label: "Pro",           price: 99,  color: "purple" },
  { id: "signals",label: "Signals Only",  price: 19,  color: "green"  },
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
        <p className="text-sm font-semibold text-neon-green">Subscription activated!</p>
        <p className="text-xs text-slate-400">Your plan has been upgraded. It may take a few seconds to reflect.</p>
      </div>
    </motion.div>
  );
}

function BillingPageInner() {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.billing.status()
      .then(setStatus)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleUpgrade(planId: string) {
    setCheckoutLoading(planId);
    setError(null);
    try {
      const { checkout_url } = await api.billing.checkout(planId);
      window.location.href = checkout_url;
    } catch (e: unknown) {
      setError((e as Error).message ?? "Failed to create checkout session.");
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
      setError((e as Error).message ?? "Failed to open billing portal.");
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
              <p className="text-xs text-slate-500 mb-0.5">Current Plan</p>
              <p className="text-xl font-bold text-white">{status?.plan_name ?? "Free"}</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {status?.price_eur ? (
              <div className="text-right">
                <p className="text-2xl font-bold text-white">€{status.price_eur}</p>
                <p className="text-xs text-slate-500">/month</p>
              </div>
            ) : (
              <div className="text-right">
                <p className="text-2xl font-bold text-white">Free</p>
                <p className="text-xs text-slate-500">forever</p>
              </div>
            )}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="rounded-lg p-3" style={{ background: "rgba(255,255,255,0.03)" }}>
            <p className="text-xs text-slate-500 mb-1">AI Signals/day</p>
            <p className="text-sm font-bold text-white">
              {status?.signals_per_day === -1 ? "Unlimited" : (status?.signals_per_day ?? 3)}
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
              <p className="text-xs text-slate-500 mb-1">Renews</p>
              <p className="text-sm font-bold text-white">
                {new Date(status.current_period_end).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
              </p>
            </div>
          )}
        </div>

        {status?.cancel_at_period_end && (
          <div className="mt-3 flex items-center gap-2 text-xs text-amber-400">
            <AlertTriangle className="w-3.5 h-3.5" />
            Subscription cancels at end of billing period.
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
              Manage Subscription
            </button>
          </div>
        )}
      </GlassCard>

      {/* Upgrade options */}
      {status?.plan === "free" && (
        <>
          <h2 className="text-sm font-semibold text-slate-400 mb-3 uppercase tracking-widest">Upgrade Plan</h2>

          {!status.stripe_configured && (
            <div className="flex items-start gap-2 p-3 rounded-lg mb-4"
              style={{ background: "rgba(0,212,255,0.06)", border: "1px solid rgba(0,212,255,0.15)" }}>
              <AlertTriangle className="w-4 h-4 text-cyan-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-slate-400">
                Stripe billing is not yet active on this instance. Join the{" "}
                <Link href="/landing#waitlist" className="text-cyan-400 underline">waitlist</Link> for early-bird access.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {UPGRADE_PLANS.map((p) => (
              <motion.div
                key={p.id}
                whileHover={{ scale: 1.02 }}
                className="rounded-xl p-4 flex flex-col"
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <p className="text-sm font-bold text-white mb-1">{p.label}</p>
                <p className="text-2xl font-bold text-white mb-3">€{p.price}<span className="text-xs text-slate-500">/mo</span></p>
                <button
                  onClick={() => handleUpgrade(p.id)}
                  disabled={!status.stripe_configured || checkoutLoading === p.id}
                  className="mt-auto flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all duration-200 disabled:opacity-40"
                  style={{
                    background: status.stripe_configured ? "rgba(0,212,255,0.1)" : "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(0,212,255,0.2)",
                    color: "#00D4FF",
                  }}
                >
                  {checkoutLoading === p.id
                    ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    : <><Check className="w-3.5 h-3.5" /> Upgrade</>
                  }
                </button>
              </motion.div>
            ))}
          </div>

          <div className="mt-4 text-center">
            <Link href="/pricing" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors">
              Compare all plans in detail <ArrowRight className="w-3 h-3" />
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
            You&apos;re on the <span className="text-neon-green font-semibold">{status.plan_name}</span> plan.
            Use &quot;Manage Subscription&quot; above to change or cancel.
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
        <p className="text-sm text-slate-500">Manage your plan, payment method, and usage limits.</p>
      </motion.div>

      <Suspense>
        <BillingPageInner />
      </Suspense>
    </div>
  );
}
