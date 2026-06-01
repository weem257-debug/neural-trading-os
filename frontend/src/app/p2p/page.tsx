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
  BarChart3,
  History,
  Camera,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
} from "recharts";
import { api } from "@/lib/api";

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

interface SnapshotRecord {
  id: number;
  platform: string;
  total_invested: number;
  outstanding_principal: number;
  interest_month: number;
  total_interest: number;
  defaulted_amount: number;
  cash_balance: number;
  net_annual_return: number | null;
  currency: string;
  fetched_at: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fmt = (n: number, currency = "EUR") =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);

const fmtFull = (n: number, currency = "EUR") =>
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

function MetricBox({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-4">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className="text-xl font-bold" style={{ color: color ?? "#fff" }}>
        {value}
      </p>
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
                Demo
              </span>
            )}
          </div>
        </div>
        {data.net_annual_return !== null && (
          <div className="flex items-center gap-1 text-sm font-bold" style={{ color }}>
            <ArrowUpRight className="w-4 h-4" />
            {pct(data.net_annual_return)} p.a.
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-slate-500">Investiert</p>
          <p className="font-semibold text-white">{fmtFull(data.total_invested, data.currency)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Ausstehend</p>
          <p className="font-semibold text-white">{fmtFull(data.outstanding_principal, data.currency)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Zinsen diesen Monat</p>
          <p className="font-semibold" style={{ color: "#00FF88" }}>
            {fmtFull(data.interest_month, data.currency)}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Zinsen gesamt</p>
          <p className="font-semibold text-white">{fmtFull(data.total_interest, data.currency)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Cash-Balance</p>
          <p className="font-semibold text-cyan-400">{fmtFull(data.cash_balance, data.currency)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Ausfälle</p>
          <p
            className="font-semibold"
            style={{ color: data.defaulted_amount > 0 ? "#FF6B6B" : "#64748b" }}
          >
            {fmtFull(data.defaulted_amount, data.currency)}{" "}
            <span className="text-xs opacity-70">({defaultPct} %)</span>
          </p>
        </div>
      </div>

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
// AllocationChart — horizontal bar chart per platform
// ---------------------------------------------------------------------------

function AllocationChart({ platforms }: { platforms: PlatformData[] }) {
  const data = platforms.map((p) => ({
    name: PLATFORM_LABELS[p.platform] ?? p.platform,
    Investiert: Math.round(p.total_invested),
    Zinsen: Math.round(p.total_interest),
    Cash: Math.round(p.cash_balance),
    color: PLATFORM_COLORS[p.platform] ?? "#00D4FF",
  }));

  return (
    <div className="rounded-2xl border border-slate-800/60 bg-slate-900/30 p-5">
      <p className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
        <BarChart3 className="w-4 h-4 text-neon-purple" />
        Plattform-Allokation
      </p>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} layout="vertical" margin={{ left: 16, right: 32, top: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
          <XAxis
            type="number"
            tickFormatter={(v) => `€${(v / 1000).toFixed(1)}k`}
            tick={{ fill: "#475569", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fill: "#94a3b8", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={70}
          />
          <Tooltip
            contentStyle={{
              background: "rgba(8,11,20,0.95)",
              border: "1px solid rgba(0,212,255,0.2)",
              borderRadius: 8,
              fontSize: 12,
              color: "#fff",
            }}
            formatter={(value: number, name: string) => [fmtFull(value), name]}
          />
          <Bar dataKey="Investiert" fill="#00D4FF" radius={[0, 4, 4, 0]} barSize={10} />
          <Bar dataKey="Zinsen" fill="#00FF88" radius={[0, 4, 4, 0]} barSize={10} />
          <Bar dataKey="Cash" fill="#7B2FFF" radius={[0, 4, 4, 0]} barSize={10} />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 11, color: "#64748b", paddingTop: 8 }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HistoryChart — line chart from snapshots
// ---------------------------------------------------------------------------

function HistoryTab() {
  const [snapshots, setSnapshots] = useState<SnapshotRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.p2p.history(120)
      .then(setSnapshots)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 text-neon-purple animate-spin" />
      </div>
    );
  }

  if (snapshots.length === 0) {
    return (
      <div className="text-center py-16 text-slate-500">
        <History className="w-10 h-10 mx-auto mb-3 opacity-40" />
        <p className="text-sm">Noch keine Snapshot-Daten vorhanden.</p>
        <p className="text-xs mt-1">Speichere den ersten Snapshot über die Schaltfläche oben.</p>
      </div>
    );
  }

  // Aggregate by date: sum across all platforms per day
  const byDate: Record<string, { total_invested: number; total_interest: number; cash: number }> = {};
  for (const s of snapshots) {
    const day = s.fetched_at.slice(0, 10);
    if (!byDate[day]) byDate[day] = { total_invested: 0, total_interest: 0, cash: 0 };
    byDate[day].total_invested += s.total_invested;
    byDate[day].total_interest += s.total_interest;
    byDate[day].cash += s.cash_balance;
  }

  const chartData = Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, vals]) => ({
      date: new Date(date).toLocaleDateString("de-DE", { month: "short", day: "numeric" }),
      Investiert: Math.round(vals.total_invested),
      Zinsen: Math.round(vals.total_interest),
    }));

  // Per-platform breakdown table (last snapshot per platform)
  const latestByPlatform: Record<string, SnapshotRecord> = {};
  for (const s of snapshots) {
    if (!latestByPlatform[s.platform]) latestByPlatform[s.platform] = s;
  }

  return (
    <div className="space-y-6">
      {chartData.length >= 2 ? (
        <div className="rounded-2xl border border-slate-800/60 bg-slate-900/30 p-5">
          <p className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-neon-green" />
            P2P-Entwicklung (alle Plattformen)
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis
                dataKey="date"
                tick={{ fill: "#475569", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v) => `€${(v / 1000).toFixed(1)}k`}
                tick={{ fill: "#475569", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: "rgba(8,11,20,0.95)",
                  border: "1px solid rgba(0,212,255,0.2)",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "#fff",
                }}
                formatter={(value: number, name: string) => [fmtFull(value), name]}
              />
              <Legend
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: 11, color: "#64748b" }}
              />
              <Line
                type="monotone"
                dataKey="Investiert"
                stroke="#00D4FF"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="Zinsen"
                stroke="#00FF88"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="text-center py-8 text-slate-500 text-xs">
          Mindestens 2 Snapshots für den Chart benötigt.
        </div>
      )}

      {/* Recent snapshots table */}
      <div className="rounded-2xl border border-slate-800/60 bg-slate-900/30 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-800/60">
          <p className="text-sm font-semibold text-slate-300">Letzte Snapshots</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-800/60">
                {["Datum", "Plattform", "Investiert", "Zinsen gesamt", "Cash", "NAR"].map((h) => (
                  <th key={h} className="text-left px-4 py-2 text-slate-500 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {snapshots.slice(0, 30).map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-slate-800/30 hover:bg-slate-800/20 transition-colors"
                >
                  <td className="px-4 py-2 text-slate-400 font-mono">
                    {new Date(s.fetched_at).toLocaleDateString("de-DE", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className="font-semibold"
                      style={{ color: PLATFORM_COLORS[s.platform] ?? "#94a3b8" }}
                    >
                      {PLATFORM_LABELS[s.platform] ?? s.platform}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-mono text-slate-300">{fmt(s.total_invested)}</td>
                  <td className="px-4 py-2 font-mono" style={{ color: "#00FF88" }}>
                    {fmt(s.total_interest)}
                  </td>
                  <td className="px-4 py-2 font-mono text-cyan-400">{fmt(s.cash_balance)}</td>
                  <td className="px-4 py-2 text-slate-400">
                    {s.net_annual_return !== null ? `${s.net_annual_return.toFixed(1)} %` : "–"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type Tab = "overview" | "history";

export default function P2PPage() {
  const [summary, setSummary] = useState<P2PSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [snapshotMsg, setSnapshotMsg] = useState("");
  const [tab, setTab] = useState<Tab>("overview");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setSummary(await api.p2p.summary());
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
      await api.p2p.snapshot();
      setSnapshotMsg("Snapshot gespeichert!");
      setTimeout(() => setSnapshotMsg(""), 3000);
    } finally {
      setSaving(false);
    }
  };

  const TABS: { id: Tab; label: string }[] = [
    { id: "overview", label: "Übersicht" },
    { id: "history", label: "Verlauf" },
  ];

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
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
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-700 text-xs text-slate-400 hover:text-neon-purple hover:border-neon-purple/40 transition-colors"
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Camera className="w-3.5 h-3.5" />
            )}
            Snapshot
          </button>
          <button
            onClick={load}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-700 text-xs text-slate-400 hover:text-cyan-400 hover:border-cyan-500/40 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Aktualisieren
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-slate-800/60">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors border-b-2 -mb-px ${
              tab === t.id
                ? "border-neon-purple text-neon-purple"
                : "border-transparent text-slate-500 hover:text-slate-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {snapshotMsg && (
        <div className="mb-4 px-4 py-2 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-xs">
          {snapshotMsg}
        </div>
      )}

      {tab === "history" ? (
        <HistoryTab />
      ) : loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 text-neon-purple animate-spin" />
        </div>
      ) : error ? (
        <div className="text-center py-16">
          <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-2" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      ) : (
        summary && (
          <>
            {/* Demo notice */}
            {summary.is_demo && (
              <div className="mb-6 flex items-start gap-2 px-4 py-3 rounded-xl bg-yellow-500/5 border border-yellow-500/20 text-yellow-400 text-xs">
                <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>
                  Demo-Daten werden angezeigt. Füge deine API-Keys in den{" "}
                  <a href="/settings" className="underline">
                    Einstellungen
                  </a>{" "}
                  hinzu, um echte Daten zu laden.
                </span>
              </div>
            )}

            {/* KPI cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
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

            {/* Allocation chart */}
            <div className="mb-6">
              <AllocationChart platforms={summary.platforms} />
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
        )
      )}
    </div>
  );
}
