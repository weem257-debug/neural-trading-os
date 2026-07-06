"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Users, Shield, CheckCircle, AlertTriangle, Loader2,
  TrendingUp, UserX, UserCheck, RefreshCw, Download, Mail, MailX, BarChart2, Bell, Zap,
} from "lucide-react";
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { GlassCard, SectionLabel } from "@/components/ui/GlassCard";
import { API_BASE, apiFetch } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";

type Tier = "free" | "basic" | "pro" | "institutional";

interface GrowthPoint { date: string; signups: number; signals: number; }
interface GrowthData { days: GrowthPoint[]; total_signups_7d: number; total_signals_7d: number; }

interface AdminUser {
  username: string;
  email: string;
  tier: Tier;
  role: string;
  is_active: boolean;
  created_at: string;
  signals_today: number;
  last_signal_at: string | null;
  referred_by: string | null;
  referral_count: number;
  email_unsubscribed?: boolean;
}

const TIER_ORDER: Tier[] = ["free", "basic", "pro", "institutional"];

const TIER_COLORS: Record<Tier, { bg: string; border: string; text: string }> = {
  free:          { bg: "rgba(100,116,139,0.1)",   border: "rgba(100,116,139,0.3)",   text: "#94a3b8" },
  basic:         { bg: "rgba(0,212,255,0.1)",      border: "rgba(0,212,255,0.3)",      text: "#00D4FF" },
  pro:           { bg: "rgba(123,47,255,0.12)",    border: "rgba(123,47,255,0.4)",     text: "#A78BFA" },
  institutional: { bg: "rgba(255,170,0,0.1)",      border: "rgba(255,170,0,0.35)",     text: "#FFAA00" },
};

// apiFetch sends the session cookie (credentials: "include") and the CSRF
// header; a bare Bearer header from localStorage is empty in cookie mode and
// produced 401s on every admin call.
function apiAdmin<T>(path: string, options?: RequestInit): Promise<T> {
  return apiFetch<T>(`/api/admin${path}`, options);
}

export default function AdminPage() {
  const role = useAuthStore((s) => s.role);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [sendingEmail, setSendingEmail] = useState<string | null>(null);
  const [emailSentSet, setEmailSentSet] = useState<Set<string>>(new Set());
  const [sendingReengage, setSendingReengage] = useState<string | null>(null);
  const [reengage_sent_set, setReengageSentSet] = useState<Set<string>>(new Set());
  const [growth, setGrowth] = useState<GrowthData | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<"username" | "tier" | "signals_today" | "is_active" | "last_signal_at">("signals_today");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkReengageSending, setBulkReengageSending] = useState(false);
  const [waitlistCount, setWaitlistCount] = useState<number | null>(null);
  const [inviteSending, setInviteSending] = useState(false);
  const [weeklyDigestSending, setWeeklyDigestSending] = useState(false);
  const [morningBriefingTrigger, setMorningBriefingTrigger] = useState(false);
  const [activationFollowupSending, setActivationFollowupSending] = useState(false);
  const [dailySignalEmailSending, setDailySignalEmailSending] = useState(false);
  const [smtpTestEmail, setSmtpTestEmail] = useState("");
  const [smtpTesting, setSmtpTesting] = useState(false);

  function exportCsv(onlyUpgradeCandidates = false) {
    const rows = onlyUpgradeCandidates
      ? users.filter(u => u.tier === "free" && u.signals_today > 0 && u.is_active)
      : users;
    const header = "Benutzername,E-Mail,Plan,Rolle,Signale heute,Letztes Signal,Aktiv,Referral von,Referrals,E-Mail abbestellt,Registriert";
    const esc = (v: string | null | undefined) => v == null ? "" : `"${String(v).replace(/"/g, '""')}"`;
    const body = rows.map(u =>
      [
        esc(u.username),
        esc(u.email),
        u.tier,
        u.role,
        u.signals_today,
        u.last_signal_at ? new Date(u.last_signal_at).toLocaleString("de-DE") : "",
        u.is_active ? "ja" : "nein",
        esc(u.referred_by),
        u.referral_count,
        u.email_unsubscribed ? "ja" : "nein",
        new Date(u.created_at).toLocaleDateString("de-DE"),
      ].join(",")
    ).join("\n");
    const csv = `${header}\n${body}`;
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nutzer-${onlyUpgradeCandidates ? "upgrade-kandidaten" : "alle"}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiAdmin<AdminUser[]>("/users");
      setUsers(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchGrowth = useCallback(async () => {
    try {
      const data = await apiAdmin<GrowthData>("/stats/growth");
      setGrowth(data);
    } catch { /* non-critical */ }
  }, []);

  useEffect(() => {
    fetchUsers();
    fetchGrowth();
    fetch(`${API_BASE}/api/waitlist/count`).then(r => r.json()).then(d => setWaitlistCount(d.count ?? 0)).catch(() => {});
  }, [fetchUsers, fetchGrowth]);

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  async function changeTier(username: string, tier: Tier) {
    setUpdating(`${username}-tier`);
    try {
      await apiAdmin(`/users/${username}`, { method: "PATCH", body: JSON.stringify({ tier }) });
      setUsers(prev => prev.map(u => u.username === username ? { ...u, tier } : u));
      showToast(`${username} → ${tier}`, true);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Fehler", false);
    } finally {
      setUpdating(null);
    }
  }

  async function sendUpgradeEmail(username: string) {
    setSendingEmail(username);
    try {
      const data = await apiAdmin<{ sent: boolean; message: string }>(`/users/${username}/send-upgrade-email`, { method: "POST" });
      setEmailSentSet(prev => new Set(prev).add(username));
      showToast(data.message, true);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Fehler", false);
    } finally {
      setSendingEmail(null);
    }
  }

  async function sendReengagementEmail(username: string) {
    setSendingReengage(username);
    try {
      const data = await apiAdmin<{ sent: boolean; message: string }>(`/users/${username}/send-reengagement-email`, { method: "POST" });
      setReengageSentSet(prev => new Set(prev).add(username));
      showToast(data.message, true);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Fehler", false);
    } finally {
      setSendingReengage(null);
    }
  }

  async function bulkSendUpgradeEmails() {
    setBulkSending(true);
    try {
      const data = await apiAdmin<{ sent: number; skipped: number; failed: number; message: string }>("/bulk-upgrade-email", { method: "POST" });
      showToast(data.message, data.failed === 0);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Bulk-E-Mail fehlgeschlagen", false);
    } finally {
      setBulkSending(false);
    }
  }

  async function bulkSendReengagementEmails() {
    setBulkReengageSending(true);
    try {
      const data = await apiAdmin<{ sent: number; skipped: number; failed: number; message: string }>("/bulk-reengagement-email", { method: "POST" });
      showToast(data.message, data.failed === 0);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Re-Engagement-E-Mail fehlgeschlagen", false);
    } finally {
      setBulkReengageSending(false);
    }
  }

  async function sendWeeklyDigest() {
    setWeeklyDigestSending(true);
    try {
      const data = await apiAdmin<{ sent: number; skipped: number; failed: number; message: string }>("/send-weekly-digest", { method: "POST" });
      showToast(data.message, data.failed === 0);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Wochendigest fehlgeschlagen", false);
    } finally {
      setWeeklyDigestSending(false);
    }
  }

  async function triggerActivationFollowup() {
    setActivationFollowupSending(true);
    try {
      const data = await apiAdmin<{ sent: number; skipped: number; failed: number; message: string }>("/trigger-activation-followup", { method: "POST" });
      showToast(data.message, data.failed === 0);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Aktivierungs-Follow-up fehlgeschlagen", false);
    } finally {
      setActivationFollowupSending(false);
    }
  }

  async function triggerDailySignalEmail() {
    setDailySignalEmailSending(true);
    try {
      const data = await apiAdmin<{ sent: number; skipped: number; failed: number; message: string }>("/trigger-daily-signal-email", { method: "POST" });
      showToast(data.message, data.failed === 0);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Signal-E-Mail fehlgeschlagen", false);
    } finally {
      setDailySignalEmailSending(false);
    }
  }

  async function triggerMorningBriefings() {
    setMorningBriefingTrigger(true);
    try {
      const data = await apiAdmin<{ triggered: boolean; message: string }>("/trigger-morning-briefings", { method: "POST" });
      showToast(data.message, data.triggered);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Morgendigest fehlgeschlagen", false);
    } finally {
      setMorningBriefingTrigger(false);
    }
  }

  async function inviteWaitlist() {
    setInviteSending(true);
    try {
      const data = await apiAdmin<{ sent: number; skipped: number; failed: number; message: string }>("/invite-waitlist", { method: "POST" });
      showToast(data.message, data.failed === 0);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Fehler beim Senden der Einladungen", false);
    } finally {
      setInviteSending(false);
    }
  }

  async function toggleActive(username: string, current: boolean) {
    setUpdating(`${username}-active`);
    try {
      await apiAdmin(`/users/${username}`, { method: "PATCH", body: JSON.stringify({ is_active: !current }) });
      setUsers(prev => prev.map(u => u.username === username ? { ...u, is_active: !current } : u));
      showToast(`${username} ${!current ? "aktiviert" : "deaktiviert"}`, true);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Fehler", false);
    } finally {
      setUpdating(null);
    }
  }

  const activeCount = users.filter(u => u.is_active).length;
  const tierCounts = TIER_ORDER.reduce<Record<Tier, number>>((acc, t) => {
    acc[t] = users.filter(u => u.tier === t).length;
    return acc;
  }, { free: 0, basic: 0, pro: 0, institutional: 0 });

  const MRR_PRICES: Record<Tier, number> = { free: 0, basic: 29, pro: 99, institutional: 299 };
  const mrr = TIER_ORDER.reduce((sum, t) => sum + tierCounts[t] * MRR_PRICES[t], 0);
  const signalsActiveFreeTier = users.filter(u => u.tier === "free" && u.signals_today > 0 && u.is_active).length;
  const totalSignalsToday = users.reduce((sum, u) => sum + u.signals_today, 0);
  const dauCount = users.filter(u => u.signals_today > 0).length;
  const paidCount = tierCounts.basic + tierCounts.pro + tierCounts.institutional;
  const conversionRate = users.length > 0 ? ((paidCount / users.length) * 100).toFixed(1) : "0.0";
  const referralCount = users.filter(u => u.referred_by).length;
  const unsubscribedCount = users.filter(u => u.email_unsubscribed).length;
  const arpu = paidCount > 0 ? (mrr / paidCount).toFixed(0) : "0";

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const inactiveCount = users.filter(u =>
    u.is_active &&
    new Date(u.created_at) < oneDayAgo &&
    (!u.last_signal_at || new Date(u.last_signal_at) < sevenDaysAgo)
  ).length;

  if (role !== "admin") {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-2">
          <Shield className="w-10 h-10 text-red-400 mx-auto" />
          <p className="text-slate-400 font-semibold">Zugriff verweigert</p>
          <p className="text-xs text-slate-600">Admin-Rolle erforderlich</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Toast */}
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
          className="fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold shadow-xl"
          style={{
            background: toast.ok ? "rgba(0,255,136,0.15)" : "rgba(255,0,128,0.15)",
            border: `1px solid ${toast.ok ? "rgba(0,255,136,0.4)" : "rgba(255,0,128,0.4)"}`,
            color: toast.ok ? "#00FF88" : "#FF0080",
          }}
        >
          {toast.ok ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {toast.msg}
        </motion.div>
      )}

      {/* Header */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-100 mb-1 flex items-center gap-2">
              <Shield className="w-6 h-6 text-cyan-400" />
              Admin — Benutzerverwaltung
            </h1>
            <p className="text-sm text-slate-500">Tier-Management und Kontostatus für alle registrierten Nutzer.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative group">
              <button
                disabled={users.length === 0}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all disabled:opacity-40"
                style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", color: "#F59E0B" }}
              >
                <Download className="w-3.5 h-3.5" />
                CSV
              </button>
              <div className="absolute right-0 top-full mt-1 z-20 hidden group-hover:block group-focus-within:block">
                <div className="rounded-xl overflow-hidden shadow-xl min-w-max"
                  style={{ background: "#0d1117", border: "1px solid rgba(245,158,11,0.25)" }}>
                  <button
                    onClick={() => exportCsv(false)}
                    className="flex items-center gap-2 w-full px-4 py-2.5 text-xs font-medium text-left hover:bg-white/5 transition-colors"
                    style={{ color: "#94a3b8" }}
                  >
                    Alle Nutzer exportieren ({users.length})
                  </button>
                  <button
                    onClick={() => exportCsv(true)}
                    className="flex items-center gap-2 w-full px-4 py-2.5 text-xs font-medium text-left hover:bg-white/5 transition-colors border-t"
                    style={{ color: "#F59E0B", borderColor: "rgba(245,158,11,0.15)" }}
                  >
                    Upgrade-Kandidaten ({users.filter(u => u.tier === "free" && u.signals_today > 0 && u.is_active).length})
                  </button>
                </div>
              </div>
            </div>
            {(waitlistCount ?? 0) > 0 && (
              <button
                onClick={inviteWaitlist}
                disabled={inviteSending}
                title={`Einladungs-E-Mail an ${waitlistCount} Wartelisten-Einträge senden`}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all disabled:opacity-40"
                style={{ background: "rgba(255,170,0,0.08)", border: "1px solid rgba(255,170,0,0.25)", color: "#FFAA00" }}
              >
                {inviteSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                Warteliste einladen ({waitlistCount})
              </button>
            )}
            <button
              onClick={bulkSendReengagementEmails}
              disabled={bulkReengageSending}
              title="Re-Engagement-E-Mail an inaktive Free-Nutzer (>7 Tage kein Signal)"
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all disabled:opacity-40"
              style={{ background: "rgba(0,255,136,0.06)", border: "1px solid rgba(0,255,136,0.18)", color: "#00FF88" }}
            >
              {bulkReengageSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserCheck className="w-3.5 h-3.5" />}
              Inaktive reaktivieren
            </button>
            <button
              onClick={sendWeeklyDigest}
              disabled={weeklyDigestSending}
              title="Personalisierten Wochenrückblick an alle aktiven Nutzer senden (1× pro Woche)"
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all disabled:opacity-40"
              style={{ background: "rgba(0,212,255,0.06)", border: "1px solid rgba(0,212,255,0.18)", color: "#00D4FF" }}
            >
              {weeklyDigestSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BarChart2 className="w-3.5 h-3.5" />}
              Wochendigest
            </button>
            <button
              onClick={triggerMorningBriefings}
              disabled={morningBriefingTrigger}
              title="Telegram Morgen-Briefing jetzt manuell an alle registrierten Chats senden"
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all disabled:opacity-40"
              style={{ background: "rgba(255,170,0,0.07)", border: "1px solid rgba(255,170,0,0.22)", color: "#FFAA00" }}
            >
              {morningBriefingTrigger ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bell className="w-3.5 h-3.5" />}
              Morgendigest
            </button>
            <button
              onClick={triggerActivationFollowup}
              disabled={activationFollowupSending}
              title="Aktivierungs-Follow-up an Nutzer senden, die sich 24-48h registriert haben, aber noch kein Signal generiert haben (1× pro Nutzer)"
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all disabled:opacity-40"
              style={{ background: "rgba(0,255,136,0.06)", border: "1px solid rgba(0,255,136,0.18)", color: "#00FF88" }}
            >
              {activationFollowupSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
              Aktivierung
            </button>
            <button
              onClick={triggerDailySignalEmail}
              disabled={dailySignalEmailSending}
              title="Tägliche Signal-Benachrichtigungs-E-Mail an alle aktiven Nutzer senden"
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all disabled:opacity-40"
              style={{ background: "rgba(0,212,255,0.06)", border: "1px solid rgba(0,212,255,0.18)", color: "#00D4FF" }}
            >
              {dailySignalEmailSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
              Signal-Mail
            </button>
            <button
              onClick={bulkSendUpgradeEmails}
              disabled={bulkSending || users.filter(u => u.tier in { free: 1, basic: 1 } && u.signals_today > 0 && u.is_active).length === 0}
              title="Upgrade-E-Mail an alle heute aktiven Free/Basic-Nutzer senden"
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all disabled:opacity-40"
              style={{ background: "rgba(167,139,250,0.08)", border: "1px solid rgba(167,139,250,0.2)", color: "#A78BFA" }}
            >
              {bulkSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
              Alle anschreiben
            </button>
            <button
              onClick={() => { fetchUsers(); fetchGrowth(); }}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all disabled:opacity-50"
              style={{ background: "rgba(0,212,255,0.08)", border: "1px solid rgba(0,212,255,0.2)", color: "#00D4FF" }}
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Aktualisieren
            </button>
          </div>
        </div>
      </motion.div>

      {/* Revenue + User Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6 mb-1">
        <GlassCard delay={0.04}>
          <p className="text-xs mb-1" style={{ color: "#00FF88" }}>MRR (geschätzt)</p>
          <p className="text-2xl font-bold" style={{ color: "#00FF88" }}>€{mrr}</p>
          <p className="text-xs text-slate-600">ARR ~€{mrr * 12} · {activeCount} aktiv</p>
        </GlassCard>
        <GlassCard delay={0.05}>
          <p className="text-xs text-slate-600 mb-1">Gesamt User</p>
          <p className="text-2xl font-bold text-slate-200">{users.length}</p>
          <p className="text-xs text-slate-600">{users.filter(u => !u.is_active).length} gesperrt</p>
        </GlassCard>
        <GlassCard delay={0.06}>
          <p className="text-xs mb-1" style={{ color: "#F59E0B" }}>Upgrade-Kandidaten</p>
          <p className="text-2xl font-bold" style={{ color: "#F59E0B" }}>{signalsActiveFreeTier}</p>
          <p className="text-xs text-slate-600">Free + Signale heute</p>
        </GlassCard>
        <GlassCard delay={0.07}>
          <p className="text-xs mb-1" style={{ color: "#FF6B6B" }}>Inaktive Nutzer</p>
          <p className="text-2xl font-bold" style={{ color: inactiveCount > 0 ? "#FF6B6B" : "#64748b" }}>{inactiveCount}</p>
          <p className="text-xs text-slate-600">Kein Signal &gt;7 Tage</p>
        </GlassCard>
        <GlassCard delay={0.08}>
          <p className="text-xs text-slate-600 mb-1">Signale heute</p>
          <p className="text-2xl font-bold text-slate-200">{totalSignalsToday}</p>
          <p className="text-xs text-slate-600">alle User</p>
        </GlassCard>
        <GlassCard delay={0.09}>
          <p className="text-xs mb-1" style={{ color: "#FFAA00" }}>Warteliste</p>
          <p className="text-2xl font-bold" style={{ color: (waitlistCount ?? 0) > 0 ? "#FFAA00" : "#64748b" }}>{waitlistCount ?? "—"}</p>
          <p className="text-xs text-slate-600">nicht registriert</p>
        </GlassCard>
      </div>

      {/* DAU + Conversion Rate + ARPU + Referrals */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <GlassCard delay={0.095}>
          <p className="text-xs mb-1" style={{ color: "#00D4FF" }}>Aktiv heute (DAU)</p>
          <p className="text-2xl font-bold" style={{ color: dauCount > 0 ? "#00D4FF" : "#64748b" }}>{dauCount}</p>
          <p className="text-xs text-slate-600">{users.length > 0 ? ((dauCount / users.length) * 100).toFixed(0) : 0}% aller Nutzer · Signale heute &gt;0</p>
        </GlassCard>
        <GlassCard delay={0.1}>
          <p className="text-xs mb-1" style={{ color: "#00FF88" }}>Konversionsrate</p>
          <p className="text-2xl font-bold" style={{ color: paidCount > 0 ? "#00FF88" : "#64748b" }}>{conversionRate}%</p>
          <p className="text-xs text-slate-600">{paidCount} bezahlte · {users.length} gesamt</p>
        </GlassCard>
        <GlassCard delay={0.105}>
          <p className="text-xs mb-1" style={{ color: "#A78BFA" }}>ARPU</p>
          <p className="text-2xl font-bold" style={{ color: paidCount > 0 ? "#A78BFA" : "#64748b" }}>€{arpu}</p>
          <p className="text-xs text-slate-600">Ø pro bezahltem Nutzer/mo</p>
        </GlassCard>
        <GlassCard delay={0.11}>
          <p className="text-xs mb-1" style={{ color: "#FFAA00" }}>Referrals</p>
          <p className="text-2xl font-bold" style={{ color: referralCount > 0 ? "#FFAA00" : "#64748b" }}>{referralCount}</p>
          <p className="text-xs text-slate-600">
            via Einladung · {unsubscribedCount > 0 ? `${unsubscribedCount} abgemeldet` : "alle E-Mail aktiv"}
          </p>
        </GlassCard>
      </div>

      {/* Tier Breakdown */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {TIER_ORDER.map((tier) => (
          <GlassCard key={tier} delay={0.08}>
            <p className="text-xs mb-1" style={{ color: TIER_COLORS[tier].text }}>{tier.charAt(0).toUpperCase() + tier.slice(1)}</p>
            <p className="text-2xl font-bold text-slate-200">{tierCounts[tier]}</p>
            <p className="text-xs text-slate-600">Nutzer · €{MRR_PRICES[tier]}/mo</p>
          </GlassCard>
        ))}
      </div>

      {/* Growth Chart */}
      {growth && growth.days.some(d => d.signups > 0 || d.signals > 0) && (
        <GlassCard delay={0.09}>
          <div className="-m-4 mb-4 px-4 py-3 rounded-t-xl" style={{ background: "rgba(0,212,255,0.04)", borderBottom: "1px solid rgba(0,212,255,0.08)" }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-cyan-400" />
                <SectionLabel>Wachstum — Letzte 7 Tage</SectionLabel>
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-500">
                <span><span className="font-bold" style={{ color: "#00D4FF" }}>{growth.total_signups_7d}</span> Registrierungen</span>
                <span><span className="font-bold" style={{ color: "#A78BFA" }}>{growth.total_signals_7d}</span> Signale</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {/* Signups chart */}
            <div>
              <p className="text-[10px] font-semibold tracking-wider text-slate-600 mb-2">NEUE NUTZER/TAG</p>
              <ResponsiveContainer width="100%" height={80}>
                <BarChart data={growth.days} barSize={14}>
                  <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} tick={{ fontSize: 9, fill: "#475569" }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: "#0d1117", border: "1px solid rgba(0,212,255,0.2)", borderRadius: "8px", fontSize: "11px" }}
                    labelFormatter={(d: string) => new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "short" })}
                    formatter={(v: number) => [v, "Registrierungen"]}
                  />
                  <Bar dataKey="signups" radius={[3, 3, 0, 0]}>
                    {growth.days.map((_, i) => (
                      <Cell key={i} fill={i === growth.days.length - 1 ? "#00D4FF" : "rgba(0,212,255,0.35)"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            {/* Signals chart */}
            <div>
              <p className="text-[10px] font-semibold tracking-wider text-slate-600 mb-2">SIGNALE/TAG</p>
              <ResponsiveContainer width="100%" height={80}>
                <BarChart data={growth.days} barSize={14}>
                  <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} tick={{ fontSize: 9, fill: "#475569" }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: "#0d1117", border: "1px solid rgba(123,47,255,0.2)", borderRadius: "8px", fontSize: "11px" }}
                    labelFormatter={(d: string) => new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "short" })}
                    formatter={(v: number) => [v, "Signale"]}
                  />
                  <Bar dataKey="signals" radius={[3, 3, 0, 0]}>
                    {growth.days.map((_, i) => (
                      <Cell key={i} fill={i === growth.days.length - 1 ? "#A78BFA" : "rgba(123,47,255,0.4)"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </GlassCard>
      )}

      {/* SMTP Test */}
      <GlassCard delay={0.08}>
        <div className="flex items-center gap-2 mb-4">
          <Mail className="w-4 h-4 text-cyan-400" />
          <SectionLabel>SMTP Test</SectionLabel>
        </div>
        <p className="text-xs text-slate-500 mb-3">Sendet eine Test-E-Mail um die SMTP-Konfiguration zu überprüfen.</p>
        <div className="flex gap-2">
          <input
            type="email"
            value={smtpTestEmail}
            onChange={(e) => setSmtpTestEmail(e.target.value)}
            placeholder="test@example.com"
            className="flex-1 rounded-xl px-3 py-2 text-xs font-mono text-slate-300 outline-none"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(0,212,255,0.2)" }}
          />
          <button
            onClick={async () => {
              if (!smtpTestEmail.trim()) return;
              setSmtpTesting(true);
              try {
                const res = await apiAdmin<{ sent: boolean; message: string; smtp_configured: boolean }>(
                  `/test-smtp?to=${encodeURIComponent(smtpTestEmail.trim())}`,
                  { method: "POST" }
                );
                showToast(res.message, res.sent);
              } catch (e) {
                showToast(e instanceof Error ? e.message : "Fehler", false);
              } finally {
                setSmtpTesting(false);
              }
            }}
            disabled={smtpTesting || !smtpTestEmail.trim()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-40"
            style={{ background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.3)", color: "#00D4FF" }}
          >
            {smtpTesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
            Testen
          </button>
        </div>
      </GlassCard>

      {/* User table */}
      <GlassCard delay={0.1}>
        <div className="-m-4 mb-4 px-4 py-3 rounded-t-xl" style={{ background: "rgba(0,212,255,0.04)", borderBottom: "1px solid rgba(0,212,255,0.08)" }}>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-cyan-400" />
              <SectionLabel>Registrierte Nutzer ({users.length})</SectionLabel>
            </div>
            <input
              type="text"
              placeholder="Suche nach Name oder E-Mail…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="text-xs px-3 py-1.5 rounded-lg outline-none"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#e2e8f0", width: 220 }}
            />
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg mb-4" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}>
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <span className="text-xs text-red-400">{error}</span>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
          </div>
        ) : users.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-8">Noch keine registrierten Nutzer.</p>
        ) : (
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="border-b border-white/5">
                  {([
                    { label: "Nutzer", key: "username" },
                    { label: "E-Mail", key: null },
                    { label: "Plan", key: "tier" },
                    { label: "Signale heute", key: "signals_today" },
                    { label: "Zuletzt aktiv", key: "last_signal_at" },
                    { label: "Status", key: "is_active" },
                    { label: "Aktionen", key: null },
                  ] as { label: string; key: "username" | "tier" | "signals_today" | "is_active" | "last_signal_at" | null }[]).map(({ label, key }) => (
                    <th key={label} className="text-left text-xs font-semibold text-slate-600 pb-2 pr-4">
                      {key ? (
                        <button
                          onClick={() => {
                            if (sortBy === key) setSortDir(d => d === "asc" ? "desc" : "asc");
                            else { setSortBy(key); setSortDir("desc"); }
                          }}
                          className="flex items-center gap-1 hover:text-slate-400 transition-colors"
                        >
                          {label}
                          <span className="text-[10px]">{sortBy === key ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}</span>
                        </button>
                      ) : label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {users.filter(u => {
                  if (!searchTerm.trim()) return true;
                  const q = searchTerm.toLowerCase();
                  return u.username.toLowerCase().includes(q) || (u.email ?? "").toLowerCase().includes(q);
                }).sort((a, b) => {
                  let cmp = 0;
                  if (sortBy === "username") cmp = a.username.localeCompare(b.username);
                  else if (sortBy === "tier") {
                    const order = { free: 0, basic: 1, pro: 2, institutional: 3 };
                    cmp = (order[a.tier as keyof typeof order] ?? 0) - (order[b.tier as keyof typeof order] ?? 0);
                  } else if (sortBy === "signals_today") cmp = a.signals_today - b.signals_today;
                  else if (sortBy === "last_signal_at") {
                    const ta = a.last_signal_at ? new Date(a.last_signal_at).getTime() : 0;
                    const tb = b.last_signal_at ? new Date(b.last_signal_at).getTime() : 0;
                    cmp = ta - tb;
                  } else if (sortBy === "is_active") cmp = Number(a.is_active) - Number(b.is_active);
                  return sortDir === "asc" ? cmp : -cmp;
                }).map((u) => {
                  const tc = TIER_COLORS[u.tier as Tier] ?? TIER_COLORS.free;
                  const isUpdatingTier = updating === `${u.username}-tier`;
                  const isUpdatingActive = updating === `${u.username}-active`;
                  const isUpgradeCandidate = u.tier === "free" && u.signals_today > 0 && u.is_active;
                  const isInactive = u.is_active && new Date(u.created_at) < oneDayAgo &&
                    (!u.last_signal_at || new Date(u.last_signal_at) < sevenDaysAgo);
                  return (
                    <tr
                      key={u.username}
                      className="hover:bg-white/[0.015] transition-colors"
                      style={isUpgradeCandidate ? { background: "rgba(245,158,11,0.03)" } : undefined}
                    >
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-semibold text-slate-200">{u.username}</span>
                          {u.role === "admin" && (
                            <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "rgba(255,170,0,0.1)", color: "#FFAA00" }}>admin</span>
                          )}
                          {isUpgradeCandidate && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: "rgba(245,158,11,0.15)", color: "#F59E0B", border: "1px solid rgba(245,158,11,0.3)" }}>
                              ↑ UPGRADE
                            </span>
                          )}
                          {isInactive && !isUpgradeCandidate && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: "rgba(255,107,107,0.12)", color: "#FF6B6B", border: "1px solid rgba(255,107,107,0.25)" }}>
                              INAKTIV
                            </span>
                          )}
                          {(u.referral_count ?? 0) > 0 && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: "rgba(0,255,136,0.1)", color: "#00FF88", border: "1px solid rgba(0,255,136,0.25)" }}
                              title={`${u.referral_count} Nutzer via Referral eingeladen`}>
                              🔗 {u.referral_count}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-600 mt-0.5">
                          {new Date(u.created_at).toLocaleDateString("de-DE")}
                          {u.referred_by && <span className="ml-1" title={`via ${u.referred_by}`}>· via {u.referred_by}</span>}
                        </p>
                      </td>
                      <td className="py-3 pr-4">
                        <span className="flex items-center gap-1.5">
                          <span className="text-xs text-slate-400 font-mono">{u.email}</span>
                          {u.email_unsubscribed && (
                            <MailX className="w-3 h-3 flex-shrink-0" style={{ color: "#f59e0b" }} aria-label="E-Mail abbestellt" />
                          )}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {TIER_ORDER.map((tier) => (
                            <button
                              key={tier}
                              onClick={() => u.tier !== tier && changeTier(u.username, tier)}
                              disabled={isUpdatingTier}
                              className="text-xs px-2 py-0.5 rounded-full font-semibold transition-all disabled:opacity-50"
                              style={{
                                background: u.tier === tier ? tc.bg : "rgba(255,255,255,0.04)",
                                border: `1px solid ${u.tier === tier ? tc.border : "rgba(255,255,255,0.06)"}`,
                                color: u.tier === tier ? tc.text : "#475569",
                                cursor: u.tier === tier ? "default" : "pointer",
                              }}
                            >
                              {isUpdatingTier && u.tier === tier ? <Loader2 className="w-3 h-3 animate-spin inline" /> : null}
                              {tier}
                            </button>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-1">
                          <TrendingUp className="w-3.5 h-3.5 text-slate-600" />
                          <span className="font-mono text-slate-400">{u.signals_today}</span>
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <span className="text-xs font-mono" style={{
                          color: !u.last_signal_at ? "#374151" :
                            new Date(u.last_signal_at) < sevenDaysAgo ? "#FF6B6B" :
                            new Date(u.last_signal_at) < new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) ? "#F59E0B" :
                            "#4ade80",
                        }}>
                          {u.last_signal_at
                            ? new Date(u.last_signal_at).toLocaleDateString("de-DE", { day: "2-digit", month: "short" })
                            : "—"}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        <span
                          className="text-xs px-2 py-0.5 rounded-full font-semibold"
                          style={{
                            background: u.is_active ? "rgba(0,255,136,0.08)" : "rgba(239,68,68,0.08)",
                            color: u.is_active ? "#00FF88" : "#f87171",
                            border: `1px solid ${u.is_active ? "rgba(0,255,136,0.2)" : "rgba(239,68,68,0.2)"}`,
                          }}
                        >
                          {u.is_active ? "Aktiv" : "Gesperrt"}
                        </span>
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => toggleActive(u.username, u.is_active)}
                            disabled={isUpdatingActive || u.role === "admin"}
                            title={u.role === "admin" ? "Admin-Konto kann nicht gesperrt werden" : undefined}
                            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            style={{
                              background: u.is_active ? "rgba(239,68,68,0.06)" : "rgba(0,255,136,0.06)",
                              color: u.is_active ? "#f87171" : "#4ade80",
                              border: `1px solid ${u.is_active ? "rgba(239,68,68,0.2)" : "rgba(0,255,136,0.2)"}`,
                            }}
                          >
                            {isUpdatingActive
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : u.is_active
                              ? <UserX className="w-3 h-3" />
                              : <UserCheck className="w-3 h-3" />
                            }
                            {u.is_active ? "Sperren" : "Freischalten"}
                          </button>
                          {(u.tier === "free" || u.tier === "basic") && u.role !== "admin" && u.email && !u.email_unsubscribed && (
                            <button
                              onClick={() => sendUpgradeEmail(u.username)}
                              disabled={sendingEmail === u.username || emailSentSet.has(u.username)}
                              title={emailSentSet.has(u.username) ? "Heute bereits gesendet" : "Upgrade-E-Mail senden"}
                              className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                              style={{
                                background: emailSentSet.has(u.username) ? "rgba(0,255,136,0.06)" : "rgba(123,47,255,0.08)",
                                color: emailSentSet.has(u.username) ? "#4ade80" : "#A78BFA",
                                border: `1px solid ${emailSentSet.has(u.username) ? "rgba(0,255,136,0.2)" : "rgba(123,47,255,0.25)"}`,
                              }}
                            >
                              {sendingEmail === u.username
                                ? <Loader2 className="w-3 h-3 animate-spin" />
                                : emailSentSet.has(u.username)
                                ? <CheckCircle className="w-3 h-3" />
                                : <Mail className="w-3 h-3" />
                              }
                              {emailSentSet.has(u.username) ? "Gesendet" : "Mail"}
                            </button>
                          )}
                          {isInactive && u.role !== "admin" && u.email && !u.email_unsubscribed && (
                            <button
                              onClick={() => sendReengagementEmail(u.username)}
                              disabled={sendingReengage === u.username || reengage_sent_set.has(u.username)}
                              title={reengage_sent_set.has(u.username) ? "Reaktivierung heute bereits gesendet" : "Re-Engagement-E-Mail senden"}
                              className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                              style={{
                                background: reengage_sent_set.has(u.username) ? "rgba(0,255,136,0.06)" : "rgba(255,107,107,0.08)",
                                color: reengage_sent_set.has(u.username) ? "#4ade80" : "#FF6B6B",
                                border: `1px solid ${reengage_sent_set.has(u.username) ? "rgba(0,255,136,0.2)" : "rgba(255,107,107,0.25)"}`,
                              }}
                            >
                              {sendingReengage === u.username
                                ? <Loader2 className="w-3 h-3 animate-spin" />
                                : reengage_sent_set.has(u.username)
                                ? <CheckCircle className="w-3 h-3" />
                                : <UserCheck className="w-3 h-3" />
                              }
                              {reengage_sent_set.has(u.username) ? "Reaktiviert" : "Reaktivieren"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
    </div>
  );
}
