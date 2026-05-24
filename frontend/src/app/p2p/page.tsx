"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Landmark,
  TrendingUp,
  AlertTriangle,
  RefreshCw,
  Info,
  Loader2,
  ArrowUpRight,
  ShieldCheck,
} from "lucide-react";
import { API_BASE } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PlatformData {
  platform: string;
  total_invested: number;
  outstanding_principal: number;
  interest_month: number;
  total_interest: number;
  defaulted_amount: number;
  cash_balance: number;
  net_annual_return: number | null;
  num_active_loans: number;
  currency: string;
  fetched_at: string;
  is_demo: boolean;
}

interface P2PSummary {
  total_invested: number;
  outstanding_principal: number;
  total_interest: number;
  total_defaulted: number;
  cash_balance: number;
  net_annual_return_weighted: number | null;
  platforms: PlatformData[];
  is_demo: boolean;
  fetched_at: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function authHeader(): HeadersInit {
  const token = localStorage.getItem("auth_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const fmt = (n: number, currency = "EUR") =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);

const pct = (n: number | null) =>
  n !== null ? `${n.toFixed(2)} %` : "–";

const PLATFORM_COLORS: Record<string, string> = {
  mintos: "#FF6B35",
  bondora: "#00C896",
  peerberry: "#7B2FFF",
};

const PLATFORM_LABELS: Record<string, string> = {
  mintos: "Mintos",
  bondora: "Bondora",
  peerberry: "PeerBerry",
};

// ---------------------------------------------------------------------------
// MetricBox
// ---------------------------------------------------------------------------

function MetricBox({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-4">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className="text-xl font-bold" style={{ color: color ?? "#fff" }}>{value}</p>
      {sub && <p className="text-xs text-slate-600 mt-0.5">{sub}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PlatformCard
// ---------------------------------------------------------------------------

function PlatformCard({ data }: { data: PlatformData }) {
  const color = PLATFORM_COLORS[data.platform] ?? "#00D4FF";
  const label = PLATFORM_LABELS[data.platform] ?? data.platform;
  const defaultPct =
    data.outstanding_principal > 0
      ? ((data.defaulted_amount / data.outstanding_principal) * 100).toFixed(2)
      : "0.00";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border p-5"
      style={{
        borderColor: color + "40",
        background: `linear-gradient(135deg, ${color}08, transparent)`,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-lg font-bold"
            style={{ background: color + "20", color }}
          >
            {label[0]}
          </div>
          <div>
            <p className="font-bold text-white text-sm">{label}</p>
            {data.is_demo && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
                Demo-Daten
              </span>
            )}
          </div>
        </div>
        {data.net_annual_return !== null && (
          <div
            className="flex items-center gap-1 text-sm font-bold"
            style={{ color }}
          >
            <ArrowUpRight className="w-4 h-4" />
            {pct(data.net_annual_return)} p.a.
          </div>
        )}
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-slate-500">Investiert</p>
          <p className="font-semibold text-white">{fmt(data.total_invested, data.currency)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Ausstehend</p>
          <p className="font-semibold text-white">{fmt(data.outstanding_principal, data.currency)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Zinsen diesen Monat</p>
          <p className="font-semibold" style={{ color: "#00FF88" }}>
            {fmt(data.interest_month, data.currency)}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Zinsen gesamt</p>
          <p className="font-semibold text-white">{fmt(data.total_interest, data.currency)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Cash-Balance</p>
          <p className="font-semibold text-cyan-400">{fmt(data.cash_balance, data.currency)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Ausfälle</p>
          <p className="font-semibold" style={{ color: data.defaulted_amount > 0 ? "#FF6B6B" : "#64748b" }}>
            {fmt(data.defaulted_amount, data.currency)}
            {" "}
            <span className="text-xs opacity-70">({defaultPct} %)</span>
          </p>
        </div>
      </div>

      {/* Active loans */}
      {data.num_active_loans > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-800/60 flex items-center gap-2 text-xs text-slate-500">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>{data.num_active_loans} aktive Kredite</span>
        </div>
      )}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function P2PPage() {
  const [summary, setSummary] = useState<P2PSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [snapshotMsg, setSnapshotMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = localStorage.getItem("auth_token");
      const res = await fetch(`${API_BASE}/api/p2p/summary`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSummary(await res.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveSnapshot = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem("auth_token");
      await fetch(`${API_BASE}/api/p2p/snapshot`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      setSnapshotMsg("Snapshot gespeichert!");
      setTimeout(() => setSnapshotMsg(""), 3000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Landmark className="w-6 h-6 text-neon-purple" />
            P2P Kredite
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Mintos · Bondora · PeerBerry — Alle Plattformen auf einen Blick
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={saveSnapshot}
            disabled={saving}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-700 text-xs text-slate-400 hover:text-cyan-400 hover:border-cyan-500/40 transition-colors"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <TrendingUp className="w-3.5 h-3.5" />}
            Snapshot speichern
          </button>
          <button
            onClick={load}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-700 text-xs text-slate-400 hover:text-cyan-400 hover:border-cyan-500/40 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Aktualisieren
          </button>
        </div>
      </div>

      {snapshotMsg && (
        <div className="mb-4 px-4 py-2 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-xs">
          {snapshotMsg}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 text-neon-purple animate-spin" />
        </div>
      ) : error ? (
        <div className="text-center py-16">
          <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-2" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      ) : summary && (
        <>
          {/* Demo notice */}
          {summary.is_demo && (
            <div className="mb-6 flex items-start gap-2 px-4 py-3 rounded-xl bg-yellow-500/5 border border-yellow-500/20 text-yellow-400 text-xs">
              <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                Demo-Daten werden angezeigt. Füge deine API-Keys in den{" "}
                <a href="/settings" className="underline">Einstellungen</a> hinzu, um echte Daten zu laden.
              </span>
            </div>
          )}

          {/* Summary KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
            <MetricBox label="Gesamt investiert" value={fmt(summary.total_invested)} />
            <MetricBox
              label="Zinsen gesamt"
              value={fmt(summary.total_interest)}
              color="#00FF88"
            />
            <MetricBox
              label="Zinsen p.a. (Ø)"
              value={pct(summary.net_annual_return_weighted)}
              color="#00D4FF"
            />
            <MetricBox
              label="Cash verfügbar"
              value={fmt(summary.cash_balance)}
              color="#7B2FFF"
            />
            <MetricBox
              label="Ausfälle gesamt"
              value={fmt(summary.total_defaulted)}
              color={summary.total_defaulted > 0 ? "#FF6B6B" : "#64748b"}
            />
          </div>

          {/* Platform cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {summary.platforms.map((p) => (
              <PlatformCard key={p.platform} data={p} />
            ))}
          </div>

          <p className="text-xs text-slate-600 mt-6 text-center">
            Zuletzt aktualisiert: {new Date(summary.fetched_at).toLocaleString("de-DE")}
          </p>
        </>
      )}
    </div>
  );
}
