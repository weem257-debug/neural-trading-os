"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { UserCircle, Crown, Zap, TrendingUp, Settings, CreditCard, ChevronRight, AlertTriangle, Mail, Trash2, X, Share2, Check, CheckCircle, XCircle, Download, MessageCircle, Briefcase, Target, BarChart2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UsageData {
  plan: string;
  signals_used_today: number;
  signals_limit: number;
  signals_remaining: number;
  reset_at: string;
}

interface UserData {
  username: string;
  role: string;
  tier: string;
  email: string | null;
  created_at: string | null;
}

interface SubData {
  plan: string;
  plan_name: string;
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  stripe_configured: boolean;
}

// ---------------------------------------------------------------------------
// Tier config
// ---------------------------------------------------------------------------

const TIER_CONFIG: Record<string, { label: string; color: string; glow: string; icon: typeof Crown; upgrade: boolean }> = {
  free:          { label: "Free",          color: "text-slate-400",   glow: "rgba(100,116,139,0.3)", icon: Zap,       upgrade: true },
  basic:         { label: "Basic",         color: "text-cyan-400",    glow: "rgba(0,212,255,0.3)",   icon: TrendingUp, upgrade: true },
  pro:           { label: "Pro",           color: "text-violet-400",  glow: "rgba(123,47,255,0.3)",  icon: Crown,     upgrade: false },
  institutional: { label: "Institutional", color: "text-amber-400",   glow: "rgba(245,158,11,0.3)",  icon: Crown,     upgrade: false },
  demo:          { label: "Demo",          color: "text-slate-500",   glow: "rgba(100,116,139,0.2)", icon: Zap,       upgrade: true },
};

function getTierCfg(tier: string) {
  return TIER_CONFIG[tier] ?? TIER_CONFIG.free;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AccountPage() {
  const [sub, setSub] = useState<SubData | null>(null);
  const username = useAuthStore((s) => s.username);
  const logout = useAuthStore((s) => s.logout);
  const router = useRouter();
  const [user, setUser] = useState<UserData | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [telegramStatus, setTelegramStatus] = useState<{ connected: boolean; username: string | null } | null>(null);
  const [connectedBrokers, setConnectedBrokers] = useState<number>(0);
  const [referralCount, setReferralCount] = useState<number | null>(null);
  const [emailSubscribed, setEmailSubscribed] = useState<boolean>(true);
  const [emailPrefLoading, setEmailPrefLoading] = useState(false);
  const [editingEmail, setEditingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailSaveMsg, setEmailSaveMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [myPerf, setMyPerf] = useState<{
    avg_return: number; win_rate: number; total_evaluated: number;
    best_signal: { ticker: string; return_pct: number } | null;
  } | null>(null);

  const referralCode = username ? btoa(username) : "";
  const referralUrl = typeof window !== "undefined"
    ? `${window.location.origin}/invite/${referralCode}`
    : `/invite/${referralCode}`;

  function copyReferral() {
    navigator.clipboard.writeText(referralUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  async function handleDeleteAccount() {
    setDeleteError(null);
    setDeleting(true);
    try {
      await api.auth.deleteAccount();
      logout();
      router.push("/landing");
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Löschen fehlgeschlagen");
      setDeleting(false);
    }
  }

  useEffect(() => {
    Promise.allSettled([
      api.auth.me(),
      api.billing.usage(),
      api.billing.status(),
    ]).then(([u, usg, s]) => {
      if (u.status === "fulfilled") {
        setUser(u.value);
        setEmailSubscribed(!(u.value.email_unsubscribed ?? false));
      } else setError((u.reason as Error)?.message ?? "Daten konnten nicht geladen werden");
      if (usg.status === "fulfilled") setUsage(usg.value as UsageData);
      if (s.status === "fulfilled") setSub(s.value as SubData);
    });
    api.telegram.status().then(t => setTelegramStatus(t)).catch(() => {});
    api.brokers.status().then((bs) => {
      setConnectedBrokers(Object.values(bs).filter(b => b.status === "configured").length);
    }).catch(() => {});
    api.auth.referralStats().then((r: { referral_count: number }) => setReferralCount(r.referral_count)).catch(() => {});
    api.signals.performanceMine().then(p => setMyPerf(p)).catch(() => {});
  }, []);

  const tier = user?.tier ?? "free";
  const cfg = getTierCfg(tier);
  const TierIcon = cfg.icon;

  const usagePct = usage
    ? usage.signals_limit < 0
      ? 0
      : Math.min(100, Math.round((usage.signals_used_today / usage.signals_limit) * 100))
    : 0;

  const usageColor =
    usagePct >= 90 ? "#ef4444" :
    usagePct >= 70 ? "#f59e0b" :
    "#00D4FF";

  return (
    <div className="space-y-6 max-w-xl">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <h1 className="text-2xl font-bold text-slate-100 mb-1">Mein Konto</h1>
        <p className="text-sm text-slate-500">Abonnement-Tier, Signalnutzung und Kontoeinstellungen.</p>
      </motion.div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}>
          <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <span className="text-sm text-red-400">{error}</span>
        </div>
      )}

      {/* Profile card */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="rounded-2xl p-6"
        style={{
          background: "rgba(8,11,20,0.7)",
          border: "1px solid rgba(0,212,255,0.15)",
          backdropFilter: "blur(16px)",
          boxShadow: `0 0 40px ${cfg.glow}, 0 4px 24px rgba(0,0,0,0.4)`,
        }}
      >
        <div className="flex items-center gap-4">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{
              background: `linear-gradient(135deg, ${cfg.glow.replace("0.3", "0.15")}, rgba(123,47,255,0.1))`,
              border: `1px solid ${cfg.glow.replace("0.3", "0.4")}`,
            }}
          >
            <UserCircle className="w-8 h-8" style={{ color: cfg.color.replace("text-", "").includes("-") ? undefined : cfg.color }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xl font-bold text-slate-100 truncate">{username ?? user?.username ?? "…"}</p>
            {user?.email && (
              <div className="flex items-center gap-1.5 mt-0.5">
                <Mail className="w-3 h-3 text-slate-600 flex-shrink-0" />
                <span className="text-xs text-slate-500 truncate">{user.email}</span>
              </div>
            )}
            {user?.created_at && (
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-xs text-slate-600">
                  Mitglied seit{" "}
                  {new Date(user.created_at).toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" })}
                </span>
              </div>
            )}
            <div className="flex items-center gap-2 mt-1.5">
              <TierIcon className={`w-4 h-4 ${cfg.color}`} />
              <span className={`text-sm font-semibold ${cfg.color}`}>{cfg.label}</span>
              {user?.role === "admin" && (
                <span className="text-xs px-2 py-0.5 rounded-full font-mono" style={{ background: "rgba(245,158,11,0.15)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.3)" }}>
                  ADMIN
                </span>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Signal usage */}
      {usage && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-2xl p-5"
          style={{ background: "rgba(8,11,20,0.6)", border: "1px solid rgba(0,212,255,0.12)", backdropFilter: "blur(16px)" }}
        >
          <p className="text-xs font-semibold tracking-wider text-slate-500 mb-3">SIGNAL-NUTZUNG HEUTE</p>

          <div className="flex items-baseline justify-between mb-2">
            <span className="text-2xl font-black text-slate-100">
              {usage.signals_used_today}
              <span className="text-slate-500 text-base font-normal ml-1">
                / {usage.signals_limit < 0 ? "∞" : usage.signals_limit}
              </span>
            </span>
            {usage.signals_limit >= 0 && (
              <span className="text-sm font-semibold" style={{ color: usageColor }}>
                {usagePct}%
              </span>
            )}
          </div>

          {usage.signals_limit >= 0 && (
            <div className="w-full h-2 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
              <div
                className="h-2 rounded-full transition-all duration-500"
                style={{ width: `${usagePct}%`, background: `linear-gradient(90deg, ${usageColor}, ${usageColor}99)`, boxShadow: `0 0 8px ${usageColor}66` }}
              />
            </div>
          )}

          <p className="text-xs text-slate-600 mt-2">
            Reset um Mitternacht ·{" "}
            {usage.signals_remaining < 0
              ? "Unbegrenzte Signale"
              : `${usage.signals_remaining} verbleibend`}
          </p>
        </motion.div>
      )}

      {/* Subscription details (paid plans) */}
      {sub && !cfg.upgrade && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="rounded-2xl p-5"
          style={{ background: "rgba(0,255,136,0.04)", border: "1px solid rgba(0,255,136,0.18)" }}
        >
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-slate-200">Abonnement</p>
            <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
              style={{ background: sub.status === "active" ? "rgba(0,255,136,0.15)" : "rgba(255,170,0,0.1)", color: sub.status === "active" ? "#00FF88" : "#FFAA00" }}>
              {sub.status === "active" ? "Aktiv" : sub.status}
            </span>
          </div>
          <p className="text-xs text-slate-400 mb-1">
            Plan: <span className="font-semibold text-slate-200">{sub.plan_name}</span>
          </p>
          {sub.current_period_end && (
            <p className="text-xs text-slate-500">
              {sub.cancel_at_period_end ? "Endet am" : "Verlängerung am"}{" "}
              <span className="text-slate-300 font-medium">
                {new Date(sub.current_period_end).toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" })}
              </span>
            </p>
          )}
          {sub.cancel_at_period_end && (
            <p className="text-xs mt-2 font-semibold" style={{ color: "#F59E0B" }}>
              ⚠ Kündigung aktiv — Plan läuft zum obigen Datum aus
            </p>
          )}
          <Link
            href="/billing"
            className="inline-flex items-center gap-1.5 mt-3 text-xs font-semibold"
            style={{ color: "#00D4FF" }}
          >
            <CreditCard className="w-3.5 h-3.5" />
            Abonnement verwalten →
          </Link>
        </motion.div>
      )}

      {/* Upgrade CTA — konkrete Plan-Vergleichstabelle */}
      {cfg.upgrade && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="rounded-2xl overflow-hidden"
          style={{ border: "1px solid rgba(123,47,255,0.25)" }}
        >
          {/* Header */}
          <div className="px-5 py-4" style={{ background: "linear-gradient(135deg, rgba(123,47,255,0.1), rgba(0,212,255,0.06))" }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-slate-200">Nächste Stufe freischalten</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {tier === "free" ? "Free → Basic" : "Basic → Pro"} — was sich konkret ändert
                </p>
              </div>
              <div className="text-right">
                <p className="text-lg font-black" style={{ color: "#A78BFA" }}>
                  €{tier === "free" ? "29" : "99"}
                  <span className="text-xs font-normal text-slate-500">/Mo</span>
                </p>
                <p className="text-[10px] text-slate-600">oder €{tier === "free" ? "290" : "990"}/Jahr (−17%)</p>
              </div>
            </div>
          </div>

          {/* Feature comparison */}
          <div className="px-5 py-4" style={{ background: "rgba(8,11,20,0.6)" }}>
            <div className="grid grid-cols-2 gap-3 mb-4">
              {/* Current plan column */}
              <div>
                <p className="text-[10px] font-semibold tracking-widest text-slate-600 mb-2">
                  JETZT ({tier.toUpperCase()})
                </p>
                <div className="space-y-2">
                  {(tier === "free" ? [
                    { ok: true,  text: "3 Signale/Tag" },
                    { ok: false, text: "Max 5 Ticker" },
                    { ok: false, text: "Keine Preisalarme (DB)" },
                    { ok: false, text: "Kein Backtesting" },
                    { ok: false, text: "Kein Prioritäts-Support" },
                  ] : [
                    { ok: true,  text: "10 Signale/Tag" },
                    { ok: true,  text: "5 Ticker" },
                    { ok: true,  text: "Preisalarme" },
                    { ok: false, text: "Kein Backtesting" },
                    { ok: false, text: "Kein Prioritäts-Support" },
                  ]).map(({ ok, text }, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      {ok
                        ? <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#00FF88" }} />
                        : <XCircle    className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#ef4444" }} />
                      }
                      <span className={`text-xs ${ok ? "text-slate-300" : "text-slate-600"}`}>{text}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Next plan column */}
              <div
                className="rounded-xl p-3"
                style={{ background: "rgba(123,47,255,0.07)", border: "1px solid rgba(123,47,255,0.2)" }}
              >
                <p className="text-[10px] font-semibold tracking-widest mb-2" style={{ color: "#A78BFA" }}>
                  MIT {tier === "free" ? "BASIC" : "PRO"}
                </p>
                <div className="space-y-2">
                  {(tier === "free" ? [
                    "10 Signale/Tag",
                    "5 beobachtete Ticker",
                    "Preisalarme (DB-gespeichert)",
                    "News-Sentiment-Analyse",
                    "Basis-Risikokennzahlen",
                  ] : [
                    "50 Signale/Tag (Claude Sonnet 4.6)",
                    "Unbegrenzte Ticker",
                    "Backtesting: Jesse + Qlib",
                    "Selbstlernende KI",
                    "Webhooks + Prioritäts-Support",
                  ]).map((text, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#A78BFA" }} />
                      <span className="text-xs text-slate-300">{text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <Link
              href={tier === "basic" ? "/billing?plan=pro" : "/billing?plan=basic"}
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-bold transition-all hover:brightness-110"
              style={{
                background: "linear-gradient(135deg, rgba(123,47,255,0.25), rgba(0,212,255,0.15))",
                border: "1px solid rgba(123,47,255,0.45)",
                color: "#A78BFA",
                boxShadow: "0 0 20px rgba(123,47,255,0.15)",
                letterSpacing: "0.04em",
              }}
            >
              <Crown className="w-4 h-4" />
              {tier === "basic" ? "Auf Pro upgraden — €99/Mo" : "Auf Basic upgraden — €29/Mo"}
            </Link>
          </div>
        </motion.div>
      )}

      {/* Quick links */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="rounded-2xl overflow-hidden"
        style={{ border: "1px solid rgba(0,212,255,0.1)" }}
      >
        {[
          { href: "/settings", icon: Settings, label: "Einstellungen & Passwort ändern", sub: "API-Keys, Trading-Präferenzen, Passwort" },
          { href: "/billing",  icon: CreditCard, label: "Abrechnung",                    sub: "Abonnement verwalten, Rechnungen" },
        ].map(({ href, icon: Icon, label, sub }, i) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-white/[0.03] group"
            style={{ borderTop: i > 0 ? "1px solid rgba(255,255,255,0.05)" : undefined }}
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(0,212,255,0.08)", border: "1px solid rgba(0,212,255,0.15)" }}>
              <Icon className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-200">{label}</p>
              <p className="text-xs text-slate-600 truncate">{sub}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-700 group-hover:text-slate-500 transition-colors flex-shrink-0" />
          </Link>
        ))}
      </motion.div>

      {/* Integrationen */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.22 }}
        className="rounded-2xl overflow-hidden"
        style={{ border: "1px solid rgba(0,212,255,0.1)" }}
      >
        <div className="px-5 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          <p className="text-xs font-semibold tracking-wider text-slate-500">INTEGRATIONEN</p>
        </div>
        {[
          {
            href: "/settings",
            icon: MessageCircle,
            label: "Telegram",
            sub: telegramStatus?.connected
              ? `Verbunden als @${telegramStatus.username ?? "…"}`
              : "Nicht verbunden — in Einstellungen konfigurieren",
            badge: telegramStatus?.connected
              ? { text: "Aktiv", color: "#00FF88", bg: "rgba(0,255,136,0.12)" }
              : { text: "Inaktiv", color: "#94a3b8", bg: "rgba(255,255,255,0.05)" },
          },
          {
            href: "/settings",
            icon: Briefcase,
            label: "Broker-Depots",
            sub: connectedBrokers > 0
              ? `${connectedBrokers} Depot${connectedBrokers > 1 ? "s" : ""} verbunden`
              : "Kein Depot verbunden — in Einstellungen hinzufügen",
            badge: connectedBrokers > 0
              ? { text: `${connectedBrokers} aktiv`, color: "#00D4FF", bg: "rgba(0,212,255,0.1)" }
              : { text: "Keine", color: "#94a3b8", bg: "rgba(255,255,255,0.05)" },
          },
        ].map(({ href, icon: Icon, label, sub, badge }, i) => (
          <Link
            key={label}
            href={href}
            className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-white/[0.03] group"
            style={{ borderTop: i > 0 ? "1px solid rgba(255,255,255,0.05)" : undefined }}
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(0,212,255,0.08)", border: "1px solid rgba(0,212,255,0.15)" }}>
              <Icon className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-200">{label}</p>
              <p className="text-xs text-slate-600 truncate">{sub}</p>
            </div>
            <span
              className="text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0"
              style={{ background: badge.bg, color: badge.color }}
            >
              {badge.text}
            </span>
          </Link>
        ))}
      </motion.div>

      {/* Meine KI-Performance */}
      {myPerf !== null && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.24 }}
          className="rounded-2xl p-5"
          style={{ background: "rgba(0,212,255,0.03)", border: "1px solid rgba(0,212,255,0.14)" }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-cyan-400" />
              <p className="text-sm font-bold text-slate-200">Meine KI-Performance</p>
            </div>
            <Link href="/performance" className="text-xs font-semibold" style={{ color: "#00D4FF" }}>
              Details →
            </Link>
          </div>

          {myPerf.total_evaluated === 0 ? (
            <div className="flex items-start gap-2">
              <BarChart2 className="w-3.5 h-3.5 text-slate-600 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-slate-600">
                Daten werden gesammelt — ausgewertete Signale erscheinen hier nach 24 Stunden.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center">
                <p
                  className="text-2xl font-black"
                  style={{ color: myPerf.win_rate >= 0.5 ? "#00FF88" : "#ef4444" }}
                >
                  {Math.round(myPerf.win_rate * 100)}%
                </p>
                <p className="text-[10px] text-slate-600 mt-0.5">Trefferquote</p>
              </div>
              <div className="text-center">
                <p
                  className="text-2xl font-black"
                  style={{ color: myPerf.avg_return >= 0 ? "#00D4FF" : "#ef4444" }}
                >
                  {myPerf.avg_return >= 0 ? "+" : ""}{(myPerf.avg_return * 100).toFixed(1)}%
                </p>
                <p className="text-[10px] text-slate-600 mt-0.5">Ø Rendite</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-black text-slate-300">{myPerf.total_evaluated}</p>
                <p className="text-[10px] text-slate-600 mt-0.5">Ausgewertet</p>
              </div>
              {myPerf.best_signal && (
                <div className="col-span-3 mt-1 flex items-center gap-2 px-3 py-2 rounded-lg"
                  style={{ background: "rgba(0,255,136,0.05)", border: "1px solid rgba(0,255,136,0.12)" }}>
                  <CheckCircle className="w-3 h-3 text-green-400 flex-shrink-0" />
                  <span className="text-xs text-slate-400">
                    Bestes Signal: <span className="font-bold text-slate-200">{myPerf.best_signal.ticker}</span>
                    {" "}<span className="text-green-400">{myPerf.best_signal.return_pct > 0 ? "+" : ""}{(myPerf.best_signal.return_pct * 100).toFixed(2)}%</span>
                  </span>
                </div>
              )}
            </div>
          )}
        </motion.div>
      )}

      {/* Referral Link */}
      {referralCode && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="rounded-2xl p-5"
          style={{ background: "rgba(0,255,136,0.04)", border: "1px solid rgba(0,255,136,0.12)" }}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Share2 className="w-4 h-4" style={{ color: "#00FF88" }} />
              <p className="text-sm font-bold text-slate-200">Freunde einladen</p>
            </div>
            {referralCount !== null && referralCount > 0 && (
              <span
                className="text-xs font-bold px-2 py-0.5 rounded-full"
                style={{ background: "rgba(0,255,136,0.12)", color: "#00FF88" }}
              >
                {referralCount} {referralCount === 1 ? "Einladung" : "Einladungen"} angenommen
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mb-3">
            Teile deinen persönlichen Link und stärke die Neural Trading OS Community.
          </p>
          <div className="flex items-center gap-2">
            <div
              className="flex-1 px-3 py-2 rounded-xl text-xs font-mono text-slate-400 truncate"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              {referralUrl}
            </div>
            <button
              onClick={copyReferral}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all hover:brightness-110 flex-shrink-0"
              style={{ background: "rgba(0,255,136,0.1)", border: "1px solid rgba(0,255,136,0.25)", color: "#00FF88" }}
            >
              {copied ? <><Check className="w-3 h-3" /> Kopiert</> : "Kopieren"}
            </button>
          </div>
        </motion.div>
      )}

      {/* E-Mail-Adresse ändern */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.21 }}
        className="rounded-2xl p-5"
        style={{ background: "rgba(8,11,20,0.6)", border: "1px solid rgba(0,212,255,0.12)", backdropFilter: "blur(16px)" }}
      >
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold tracking-wider text-slate-500">PROFIL</p>
          {!editingEmail && (
            <button
              onClick={() => { setNewEmail(user?.email ?? ""); setEditingEmail(true); setEmailSaveMsg(null); }}
              className="text-xs font-semibold transition-colors hover:text-cyan-300"
              style={{ color: "#00D4FF" }}
            >
              Bearbeiten
            </button>
          )}
        </div>

        {!editingEmail ? (
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-slate-600 flex-shrink-0" />
            <span className="text-sm text-slate-400">{user?.email ?? "Keine E-Mail-Adresse hinterlegt"}</span>
          </div>
        ) : (
          <div className="space-y-2">
            <label className="text-xs text-slate-500">Neue E-Mail-Adresse</label>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-sm text-slate-200 outline-none transition-all"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(0,212,255,0.25)" }}
              placeholder="neue@email.de"
              autoFocus
            />
            {emailSaveMsg && (
              <p className="text-xs" style={{ color: emailSaveMsg.type === "ok" ? "#00FF88" : "#ef4444" }}>
                {emailSaveMsg.text}
              </p>
            )}
            <div className="flex gap-2 pt-1">
              <button
                disabled={emailSaving || !newEmail.trim()}
                onClick={async () => {
                  setEmailSaving(true);
                  setEmailSaveMsg(null);
                  try {
                    const res = await api.auth.updateProfile(newEmail.trim());
                    setUser((u) => u ? { ...u, email: res.email } : u);
                    setEditingEmail(false);
                    setEmailSaveMsg({ type: "ok", text: "E-Mail-Adresse aktualisiert" });
                    setTimeout(() => setEmailSaveMsg(null), 3000);
                  } catch (e) {
                    setEmailSaveMsg({ type: "err", text: (e as Error)?.message ?? "Fehler beim Speichern" });
                  } finally {
                    setEmailSaving(false);
                  }
                }}
                className="flex-1 py-2 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                style={{ background: "rgba(0,212,255,0.12)", border: "1px solid rgba(0,212,255,0.3)", color: "#00D4FF" }}
              >
                {emailSaving ? "Speichert…" : "Speichern"}
              </button>
              <button
                onClick={() => { setEditingEmail(false); setEmailSaveMsg(null); }}
                className="px-4 py-2 rounded-xl text-sm font-bold transition-all"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#64748b" }}
              >
                Abbrechen
              </button>
            </div>
          </div>
        )}
        {!editingEmail && emailSaveMsg?.type === "ok" && (
          <p className="text-xs mt-2" style={{ color: "#00FF88" }}>{emailSaveMsg.text}</p>
        )}
      </motion.div>

      {/* DSGVO Art. 20 — Datanexport */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.22 }}
        className="rounded-2xl p-5"
        style={{ background: "rgba(0,212,255,0.03)", border: "1px solid rgba(0,212,255,0.12)" }}
      >
        <p className="text-xs font-semibold tracking-wider mb-1" style={{ color: "rgba(0,212,255,0.7)" }}>DATENSCHUTZ</p>
        <p className="text-xs text-slate-600 mb-3">
          Alle deine gespeicherten Daten als JSON herunterladen (DSGVO Art. 20 — Recht auf Datenportabilität). Enthält Kontoinformationen, Signalverlauf, Kursalarme, Depot-Verbindungen, Portfolios und Handelserfahrungen.
        </p>
        <button
          onClick={async () => {
            setExporting(true);
            try { await api.auth.exportData(); }
            catch { /* toast not critical */ }
            finally { setExporting(false); }
          }}
          disabled={exporting}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all hover:brightness-110 disabled:opacity-50"
          style={{ background: "rgba(0,212,255,0.08)", border: "1px solid rgba(0,212,255,0.25)", color: "#00D4FF" }}
        >
          {exporting ? (
            <><span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> Wird exportiert…</>
          ) : (
            <><Download className="w-4 h-4" /> Meine Daten herunterladen</>
          )}
        </button>
      </motion.div>

      {/* E-Mail-Präferenzen */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.23 }}
        className="rounded-2xl p-5"
        style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}
      >
        <p className="text-xs font-semibold tracking-wider mb-1" style={{ color: "rgba(255,255,255,0.45)" }}>E-MAIL-BENACHRICHTIGUNGEN</p>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-slate-300 font-medium">Marketing-E-Mails</p>
            <p className="text-xs text-slate-600 mt-0.5">
              {emailSubscribed
                ? "Du erhältst Signal-Digests, Upgrade-Hinweise und Weekly-Reports."
                : "Du erhältst keine Marketing-E-Mails. Transaktions-Mails (Passwort-Reset) werden weiterhin gesendet."}
            </p>
          </div>
          <button
            onClick={async () => {
              setEmailPrefLoading(true);
              try {
                await api.auth.emailPreferences(!emailSubscribed);
                setEmailSubscribed(!emailSubscribed);
              } catch { /* silent */ }
              finally { setEmailPrefLoading(false); }
            }}
            disabled={emailPrefLoading}
            className="relative flex-shrink-0 w-11 h-6 rounded-full transition-all duration-200 disabled:opacity-50"
            style={{ background: emailSubscribed ? "rgba(0,212,255,0.7)" : "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)" }}
            aria-label={emailSubscribed ? "E-Mails deaktivieren" : "E-Mails aktivieren"}
          >
            <span
              className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all duration-200"
              style={{ left: emailSubscribed ? "calc(100% - 1.375rem)" : "0.125rem" }}
            />
          </button>
        </div>
      </motion.div>

      {/* Danger zone */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="rounded-2xl p-5"
        style={{ background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.15)" }}
      >
        <p className="text-xs font-semibold tracking-wider mb-1" style={{ color: "rgba(239,68,68,0.7)" }}>GEFAHRENBEREICH</p>
        <p className="text-xs text-slate-600 mb-3">
          Konto dauerhaft deaktivieren. Personenbezogene Daten werden gemäß DSGVO Art. 17 anonymisiert.
        </p>
        <button
          onClick={() => setShowDeleteModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all hover:brightness-110"
          style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171" }}
        >
          <Trash2 className="w-4 h-4" />
          Konto löschen
        </button>
      </motion.div>

      {/* Delete confirmation modal */}
      {showDeleteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowDeleteModal(false); }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-sm rounded-2xl p-6"
            style={{ background: "rgba(8,11,20,0.95)", border: "1px solid rgba(239,68,68,0.3)", boxShadow: "0 0 40px rgba(239,68,68,0.15)" }}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
                <h2 className="text-base font-bold text-slate-100">Konto unwiderruflich löschen</h2>
              </div>
              <button onClick={() => setShowDeleteModal(false)} aria-label="Dialog schließen" style={{ color: "rgba(100,116,139,0.6)" }}>
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-slate-400 mb-4">
              Dein Konto wird deaktiviert und deine E-Mail-Adresse anonymisiert. Diese Aktion kann <strong className="text-red-400">nicht rückgängig gemacht</strong> werden.
            </p>

            <p className="text-xs text-slate-500 mb-2">
              Gib <span className="font-mono text-red-400">LÖSCHEN</span> ein, um zu bestätigen:
            </p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="LÖSCHEN"
              className="w-full px-3 py-2 rounded-lg text-sm text-slate-200 placeholder-slate-700 outline-none mb-4"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(239,68,68,0.2)" }}
            />

            {deleteError && (
              <p className="text-xs text-red-400 mb-3">{deleteError}</p>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 py-2 rounded-xl text-sm font-semibold"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(100,116,139,0.8)" }}
              >
                Abbrechen
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteConfirmText !== "LÖSCHEN" || deleting}
                className="flex-1 py-2 rounded-xl text-sm font-bold transition-all"
                style={{
                  background: deleteConfirmText === "LÖSCHEN" ? "rgba(239,68,68,0.2)" : "rgba(239,68,68,0.05)",
                  border: "1px solid rgba(239,68,68,0.4)",
                  color: deleteConfirmText === "LÖSCHEN" ? "#f87171" : "rgba(239,68,68,0.3)",
                  opacity: deleting ? 0.6 : 1,
                }}
              >
                {deleting ? "Wird gelöscht…" : "Endgültig löschen"}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
