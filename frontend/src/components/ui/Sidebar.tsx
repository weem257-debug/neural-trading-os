"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  TrendingUp,
  Briefcase,
  BarChart2,
  Newspaper,
  Shield,
  Zap,
  Bell,
  Cpu,
  Menu,
  X,
  Settings,
  LogOut,
  Waves,
  Landmark,
  Wallet,
  Brain,
  CreditCard,
  Building2,
  UserCircle,
  Award,
  LineChart,
} from "lucide-react";
import { LanguageToggle, useI18n } from "@/i18n/context";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";

const navItems = [
  { href: "/dashboard",  labelKey: "nav.dashboard",  icon: LayoutDashboard, color: "cyan" },
  { href: "/signals",    labelKey: "nav.signals",    icon: TrendingUp,      color: "green" },
  { href: "/portfolio",  labelKey: "nav.portfolio",  icon: Briefcase,       color: "purple" },
  { href: "/portfolios", labelKey: "nav.portfolios", icon: Briefcase,       color: "cyan" },
  { href: "/p2p",        labelKey: "nav.p2p",        icon: Landmark,        color: "purple" },
  { href: "/brokers",    labelKey: "nav.brokers",    icon: Building2,       color: "cyan" },
  { href: "/networth",   labelKey: "nav.networth",   icon: Wallet,          color: "green" },
  { href: "/learning",   labelKey: "nav.learning",   icon: Brain,           color: "purple" },
  { href: "/analysis",        labelKey: "nav.analysis",        icon: Waves,       color: "purple" },
  { href: "/aktienanalyse",  labelKey: "nav.aktienanalyse",  icon: LineChart,   color: "green"  },
  { href: "/backtest",   labelKey: "nav.backtest",   icon: BarChart2,       color: "cyan" },
  { href: "/sentiment",  labelKey: "nav.sentiment",  icon: Newspaper,       color: "yellow" },
  { href: "/risk",       labelKey: "nav.risk",       icon: Shield,          color: "pink" },
  { href: "/execution",  labelKey: "nav.execution",  icon: Zap,             color: "green" },
  { href: "/alerts",     labelKey: "nav.alerts",     icon: Bell,            color: "yellow" },
  { href: "/performance", labelKey: "nav.performance", icon: Award,         color: "yellow" },
  { href: "/pricing",   labelKey: "nav.pricing",   icon: CreditCard,      color: "green" },
  { href: "/billing",   labelKey: "nav.billing",   icon: CreditCard,      color: "cyan"  },
  { href: "/account",  labelKey: "nav.account",   icon: UserCircle,      color: "purple" },
];

const colorMap: Record<string, { active: string; icon: string; glow: string; bar: string }> = {
  cyan:   { active: "border-cyan-500/40 bg-cyan-500/10",      icon: "text-cyan-400",    glow: "shadow-glow-cyan-sm",   bar: "bg-cyan-400" },
  green:  { active: "border-neon-green/40 bg-neon-green/10",  icon: "text-neon-green",  glow: "shadow-glow-green-sm",  bar: "bg-neon-green" },
  pink:   { active: "border-neon-pink/40 bg-neon-pink/10",    icon: "text-neon-pink",   glow: "shadow-glow-pink-sm",   bar: "bg-neon-pink" },
  purple: { active: "border-neon-purple/40 bg-neon-purple/10",icon: "text-neon-purple", glow: "shadow-glow-purple",    bar: "bg-neon-purple" },
  yellow: { active: "border-neon-yellow/40 bg-neon-yellow/10",icon: "text-neon-yellow", glow: "",                      bar: "bg-neon-yellow" },
};

/* ------------------------------------------------------------------ */
/* Active alert count badge hook                                        */
/* ------------------------------------------------------------------ */
function useActiveAlertCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const data = await api.priceAlerts.list();
        if (!cancelled) setCount(data.filter((a) => a.status === "active").length);
      } catch {
        // silently ignore
      }
    };
    poll();
    const id = setInterval(poll, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return count;
}

/* ------------------------------------------------------------------ */
/* Shared nav content — used in both desktop sidebar and mobile drawer */
/* ------------------------------------------------------------------ */
function NavContent({ onNavClick }: { onNavClick?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const activeAlertCount = useActiveAlertCount();
  const { t } = useI18n();
  const { username, role, tier, logout } = useAuthStore((s) => ({ username: s.username, role: s.role, tier: s.tier, logout: s.logout }));

  const tierBadge = (() => {
    switch (tier) {
      case "basic":        return { label: "BASIC",         bg: "rgba(0,212,255,0.15)",  border: "rgba(0,212,255,0.4)",  color: "#00D4FF" };
      case "pro":          return { label: "PRO",           bg: "rgba(123,47,255,0.15)", border: "rgba(123,47,255,0.4)", color: "#7B2FFF" };
      case "institutional":return { label: "INST",          bg: "rgba(236,72,153,0.15)", border: "rgba(236,72,153,0.4)", color: "#EC4899" };
      case "signals":      return { label: "SIGNALS",       bg: "rgba(245,158,11,0.15)", border: "rgba(245,158,11,0.4)", color: "#F59E0B" };
      default:             return { label: "FREE",          bg: "rgba(100,116,139,0.1)", border: "rgba(100,116,139,0.3)", color: "#64748B" };
    }
  })();

  const handleLogout = () => {
    logout();
    onNavClick?.();
    router.push("/login");
  };

  return (
    <>
      {/* Logo */}
      <div className="px-4 py-5" style={{ borderBottom: "1px solid rgba(0,212,255,0.1)" }}>
        <div className="flex items-center gap-2.5 mb-1">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{
              background: "linear-gradient(135deg, rgba(0,212,255,0.2), rgba(123,47,255,0.2))",
              border: "1px solid rgba(0,212,255,0.3)",
              boxShadow: "0 0 12px rgba(0,212,255,0.2)",
            }}
          >
            <Cpu className="w-4 h-4 text-cyan-400" />
          </div>
          <div>
            <p className="text-xs font-bold text-white leading-none">NEURAL</p>
            <p className="text-xs font-bold leading-none" style={{ color: "#00D4FF" }}>TRADING OS</p>
          </div>
        </div>
        <p className="text-xs mt-2" style={{ color: "rgba(100,116,139,0.8)" }}>9 AI engines unified</p>
      </div>

      {/* Nav */}
      <div className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ href, labelKey, icon: Icon, color }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          const c = colorMap[color] ?? colorMap.cyan;
          const label = t(labelKey);

          return (
            <Link
              key={href}
              href={href}
              onClick={onNavClick}
              aria-current={active ? "page" : undefined}
              aria-label={label}
              className={`
                group relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm
                font-medium transition-all duration-200 border
                ${active
                  ? `${c.active} text-white ${c.glow}`
                  : "border-transparent text-slate-500 hover:text-slate-300 hover:bg-white/5"
                }
              `}
            >
              {/* Active indicator bar — wider + stronger glow for better visibility */}
              {active && (
                <div
                  className={`absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full ${c.bar}`}
                  style={{ boxShadow: `0 0 10px currentColor, 0 0 20px currentColor` }}
                />
              )}

              <Icon
                className={`w-4 h-4 flex-shrink-0 transition-all duration-200 ${
                  active ? c.icon : "text-slate-600 group-hover:text-slate-400"
                }`}
              />
              <span className="truncate flex-1">{label}</span>
              {/* Alert badge */}
              {href === "/alerts" && activeAlertCount > 0 && (
                <span
                  className="flex-shrink-0 text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none"
                  style={{
                    background: "#ef4444",
                    color: "#fff",
                    fontSize: "10px",
                    boxShadow: "0 0 8px rgba(239,68,68,0.5)",
                  }}
                >
                  {activeAlertCount > 99 ? "99+" : activeAlertCount}
                </span>
              )}

              {/* Hover shimmer */}
              {!active && (
                <div
                  className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                  style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.02), transparent)" }}
                />
              )}
            </Link>
          );
        })}
      </div>

      {/* Settings link + Language Toggle */}
      <div className="px-3 pb-2 space-y-1">
        {/* Admin link — only for admin role */}
        {role === "admin" && (() => {
          const adminActive = pathname === "/admin" || pathname.startsWith("/admin/");
          return (
            <Link
              href="/admin"
              onClick={onNavClick}
              aria-current={adminActive ? "page" : undefined}
              aria-label="Admin"
              className={`
                group relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm
                font-medium transition-all duration-200 border
                ${adminActive
                  ? "border-amber-500/40 bg-amber-500/10 text-white"
                  : "border-transparent text-slate-500 hover:text-slate-300 hover:bg-white/5"
                }
              `}
            >
              <Shield className={`w-4 h-4 flex-shrink-0 transition-colors duration-200 ${adminActive ? "text-amber-400" : "text-slate-600 group-hover:text-slate-400"}`} />
              <span className="truncate">Admin</span>
            </Link>
          );
        })()}

        {(() => {
          const settingsActive = pathname === "/settings" || pathname.startsWith("/settings/");
          return (
            <Link
              href="/settings"
              onClick={onNavClick}
              aria-current={settingsActive ? "page" : undefined}
              aria-label={t("nav.settings")}
              className={`
                group relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm
                font-medium transition-all duration-200 border
                ${settingsActive
                  ? "border-slate-500/40 bg-slate-500/10 text-white"
                  : "border-transparent text-slate-500 hover:text-slate-300 hover:bg-white/5"
                }
              `}
            >
              <Settings className={`w-4 h-4 flex-shrink-0 transition-colors duration-200 ${settingsActive ? "text-slate-300" : "text-slate-600 group-hover:text-slate-400"}`} />
              <span className="truncate">{t("nav.settings")}</span>
            </Link>
          );
        })()}

        {/* Language toggle — DE / EN */}
        <div className="flex items-center gap-2 px-3 py-1.5">
          <span className="text-xs text-slate-600 flex-1">{t("settings.language")}</span>
          <LanguageToggle />
        </div>

        {/* Logout */}
        {username && (
          <button
            onClick={handleLogout}
            className="group relative w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 border border-transparent text-slate-500 hover:text-red-400 hover:bg-red-500/8"
            aria-label="Abmelden"
          >
            <LogOut className="w-4 h-4 flex-shrink-0 text-slate-600 group-hover:text-red-400 transition-colors duration-200" />
            <span className="truncate flex-1 text-left min-w-0">{username}</span>
            <span
              className="text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 group-hover:opacity-0 transition-opacity duration-150"
              style={{ background: tierBadge.bg, border: `1px solid ${tierBadge.border}`, color: tierBadge.color }}
            >{tierBadge.label}</span>
            <span className="text-xs absolute right-3 opacity-0 group-hover:opacity-100 transition-opacity duration-150 text-red-400">Raus</span>
          </button>
        )}
      </div>

      {/* System status footer */}
      <div className="px-4 py-4" style={{ borderTop: "1px solid rgba(0,212,255,0.1)" }}>
        {/* Mode badge */}
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-lg mb-3"
          style={{
            background: "rgba(0,212,255,0.08)",
            border: "1px solid rgba(0,212,255,0.2)",
          }}
        >
          <div className="status-dot-paper" />
          <div>
            <p className="text-xs font-semibold text-cyan-400">{t("common.paper")}</p>
            <p className="text-xs" style={{ color: "rgba(100,116,139,0.7)" }}>{t("common.simulation_active")}</p>
          </div>
        </div>

        {/* API status */}
        <div className="flex items-center gap-2">
          <div className="status-dot-live" style={{ width: "6px", height: "6px" }} />
          <span className="text-xs" style={{ color: "rgba(100,116,139,0.7)" }}>{t("common.connected")}</span>
        </div>

        {/* Version */}
        <p
          className="text-xs mt-2 font-mono"
          style={{ color: "rgba(100,116,139,0.4)" }}
        >
          v0.7.0 — claude-sonnet-4-6
        </p>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Hamburger button — shown on mobile (< md)                           */
/* ------------------------------------------------------------------ */
function HamburgerButton({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={open ? "Navigation schließen" : "Navigation öffnen"}
      className="fixed top-3 left-3 z-50 md:hidden flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-200"
      style={{
        background: open ? "rgba(0,212,255,0.15)" : "rgba(8,11,20,0.9)",
        border: "1px solid rgba(0,212,255,0.2)",
        backdropFilter: "blur(12px)",
        boxShadow: "0 0 16px rgba(0,212,255,0.1)",
      }}
    >
      <AnimatePresence mode="wait" initial={false}>
        {open ? (
          <motion.span
            key="close"
            initial={{ rotate: -90, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            exit={{ rotate: 90, opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <X className="w-5 h-5 text-cyan-400" />
          </motion.span>
        ) : (
          <motion.span
            key="open"
            initial={{ rotate: 90, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            exit={{ rotate: -90, opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <Menu className="w-5 h-5 text-cyan-400" />
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Mobile Drawer                                                        */
/* ------------------------------------------------------------------ */
function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Overlay */}
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 md:hidden"
            style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
            onClick={onClose}
          />

          {/* Drawer panel */}
          <motion.div
            key="drawer"
            role="navigation"
            aria-label="Hauptnavigation"
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed top-0 left-0 bottom-0 z-50 w-60 flex flex-col md:hidden relative overflow-hidden"
            style={{
              background: "linear-gradient(180deg, rgba(8,11,20,0.98) 0%, rgba(13,17,23,0.98) 100%)",
              borderRight: "1px solid rgba(0,212,255,0.12)",
              backdropFilter: "blur(24px)",
            }}
          >
            {/* Subtle left accent line */}
            <div
              className="absolute left-0 top-0 bottom-0 w-px"
              style={{ background: "linear-gradient(180deg, transparent, rgba(0,212,255,0.4), transparent)" }}
            />
            {/* Neural bottom line */}
            <div
              className="absolute bottom-0 left-4 right-4 h-px"
              style={{ background: "linear-gradient(90deg, transparent, rgba(0,212,255,0.4), transparent)" }}
            />

            <NavContent onNavClick={onClose} />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ */
/* Main export                                                          */
/* ------------------------------------------------------------------ */
export function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());

  const NO_SIDEBAR = new Set(["/", "/landing", "/login", "/register", "/forgot-password", "/reset-password", "/impressum", "/datenschutz", "/agb"]);
  if (NO_SIDEBAR.has(pathname)) return null;

  // Full-screen standalone landing (invite funnel) never renders dashboard chrome.
  if (pathname.startsWith("/invite/")) return null;

  // Public share surface: anonymous visitors arriving from a shared signal link
  // or the public stock-analysis page get a clean page without the sidebar.
  if (!isAuthenticated && (pathname.startsWith("/signals/view/") || pathname.startsWith("/aktienanalyse"))) return null;

  return (
    <>
      {/* ---- Desktop: always-visible sidebar (hidden on mobile) ---- */}
      <nav
        role="navigation"
        aria-label="Hauptnavigation"
        className="hidden md:flex w-52 flex-shrink-0 flex-col border-r relative overflow-hidden"
        style={{
          background: "linear-gradient(180deg, rgba(8,11,20,0.95) 0%, rgba(13,17,23,0.95) 100%)",
          borderColor: "rgba(0,212,255,0.12)",
          backdropFilter: "blur(20px)",
        }}
      >
        {/* Subtle left accent line */}
        <div
          className="absolute left-0 top-0 bottom-0 w-px"
          style={{ background: "linear-gradient(180deg, transparent, rgba(0,212,255,0.4), transparent)" }}
        />
        {/* Neural bottom line */}
        <div
          className="absolute bottom-0 left-4 right-4 h-px"
          style={{ background: "linear-gradient(90deg, transparent, rgba(0,212,255,0.4), transparent)" }}
        />

        <NavContent />
      </nav>

      {/* ---- Mobile: hamburger button + slide-in drawer ---- */}
      <HamburgerButton open={mobileOpen} onClick={() => setMobileOpen((v) => !v)} />
      <MobileDrawer open={mobileOpen} onClose={() => setMobileOpen(false)} />
    </>
  );
}
