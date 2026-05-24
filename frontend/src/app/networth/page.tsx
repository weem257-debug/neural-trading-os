"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Wallet,
  TrendingUp,
  Landmark,
  Building,
  Bitcoin,
  Loader2,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { API_BASE } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PortfolioSummary {
  total_value: number;
  day_change_pct: number;
  currency: string;
}

interface P2PSummary {
  total_invested: number;
  cash_balance: number;
  total_interest: number;
}

interface BankConnection {
  id: number;
  bank_name: string;
  last_balance: number | null;
  currency: string;
}

interface AssetBlock {
  label: string;
  value: number;
  color: string;
  icon: React.ElementType;
  sub?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function authHeader(): HeadersInit {
  const token = localStorage.getItem("auth_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiFetch(path: string) {
  const res = await fetch(`${API_BASE}${path}`, { headers: authHeader() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const fmt = (n: number, currency = "EUR") =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);

function pct(n: number, sign = true) {
  const s = sign && n > 0 ? "+" : "";
  return `${s}${n.toFixed(2)} %`;
}

// ---------------------------------------------------------------------------
// DonutChart (CSS-only)
// ---------------------------------------------------------------------------

function DonutSegment({ blocks }: { blocks: AssetBlock[] }) {
  const total = blocks.reduce((s, b) => s + b.value, 0);
  if (total === 0) return null;

  let cumulativePct = 0;
  const segments = blocks.map((b) => {
    const pct = (b.value / total) * 100;
    const start = cumulativePct;
    cumulativePct += pct;
    return { ...b, pct, start };
  });

  const gradientParts = segments.map(
    (s) => `${s.color} ${s.start.toFixed(1)}% ${(s.start + s.pct).toFixed(1)}%`
  );

  return (
    <div className="relative w-48 h-48 mx-auto">
      <div
        className="w-full h-full rounded-full"
        style={{
          background: `conic-gradient(${gradientParts.join(", ")})`,
        }}
      />
      {/* Center hole */}
      <div
        className="absolute inset-6 rounded-full flex flex-col items-center justify-center"
        style={{ background: "#060d1f" }}
      >
        <p className="text-xs text-slate-500">Gesamt</p>
        <p className="text-sm font-bold text-white">{fmt(total)}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AssetCard
// ---------------------------------------------------------------------------

function AssetCard({ block, total }: { block: AssetBlock; total: number }) {
  const Icon = block.icon;
  const sharePct = total > 0 ? (block.value / total) * 100 : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border p-4"
      style={{
        borderColor: block.color + "40",
        background: `linear-gradient(135deg, ${block.color}06, transparent)`,
      }}
    >
      <div className="flex items-center gap-3 mb-3">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center"
          style={{ background: block.color + "20" }}
        >
          <Icon className="w-4 h-4" style={{ color: block.color }} />
        </div>
        <div>
          <p className="text-sm font-semibold text-white">{block.label}</p>
          {block.sub && <p className="text-xs text-slate-500">{block.sub}</p>}
        </div>
        <div className="ml-auto text-right">
          <p className="font-bold text-white">{fmt(block.value)}</p>
          <p className="text-xs" style={{ color: block.color }}>
            {sharePct.toFixed(1)} %
          </p>
        </div>
      </div>
      {/* Share bar */}
      <div className="h-1 rounded-full bg-slate-800">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${sharePct}%`, background: block.color }}
        />
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function NetWorthPage() {
  const [blocks, setBlocks] = useState<AssetBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const results: AssetBlock[] = [];

    // Fetch all data sources in parallel; partial failures are tolerated
    const [portfolioResult, p2pResult, bankResult] = await Promise.allSettled([
      apiFetch("/api/portfolio/summary"),
      apiFetch("/api/p2p/summary"),
      apiFetch("/api/bank/connections"),
    ]);

    // Stocks / Crypto portfolio
    if (portfolioResult.status === "fulfilled") {
      const d = portfolioResult.value as PortfolioSummary;
      if (d.total_value > 0) {
        results.push({
          label: "Aktien & Krypto",
          value: d.total_value,
          color: "#00D4FF",
          icon: TrendingUp,
          sub: d.day_change_pct !== undefined ? `Heute: ${pct(d.day_change_pct)}` : undefined,
        });
      }
    }

    // P2P
    if (p2pResult.status === "fulfilled") {
      const d = p2pResult.value as P2PSummary;
      const p2pTotal = d.total_invested + d.cash_balance;
      if (p2pTotal > 0) {
        results.push({
          label: "P2P Kredite",
          value: p2pTotal,
          color: "#7B2FFF",
          icon: Landmark,
          sub: `+ ${fmt(d.total_interest)} Zinsen verdient`,
        });
      }
    }

    // Bank accounts
    if (bankResult.status === "fulfilled") {
      const connections = bankResult.value as BankConnection[];
      const bankTotal = connections.reduce((s, c) => s + (c.last_balance ?? 0), 0);
      if (bankTotal > 0) {
        results.push({
          label: "Bankkonten",
          value: bankTotal,
          color: "#00FF88",
          icon: Building,
          sub: `${connections.filter((c) => c.last_balance !== null).length} Konten verknüpft`,
        });
      }
    }

    if (results.length === 0 && portfolioResult.status === "rejected") {
      setError("Daten konnten nicht geladen werden");
    }

    setBlocks(results);
    setLastUpdate(new Date());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const total = blocks.reduce((s, b) => s + b.value, 0);

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Wallet className="w-6 h-6 text-neon-green" />
            Nettovermögen
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Alle Assets konsolidiert — Aktien, P2P, Bankkonten
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-700 text-xs text-slate-400 hover:text-cyan-400 hover:border-cyan-500/40 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Aktualisieren
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 text-neon-green animate-spin" />
        </div>
      ) : error ? (
        <div className="text-center py-16">
          <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-2" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      ) : (
        <>
          {/* Total hero */}
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-2xl border border-neon-green/20 p-6 mb-6 text-center"
            style={{ background: "linear-gradient(135deg, rgba(0,255,136,0.05), transparent)" }}
          >
            <p className="text-sm text-slate-500 mb-1">Gesamtvermögen</p>
            <p className="text-4xl font-black text-white">{fmt(total)}</p>
          </motion.div>

          {/* Donut + asset list */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Donut */}
            <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-6 flex flex-col items-center justify-center gap-4">
              <DonutSegment blocks={blocks} />
              {/* Legend */}
              <div className="flex flex-wrap gap-3 justify-center">
                {blocks.map((b) => (
                  <div key={b.label} className="flex items-center gap-1.5 text-xs text-slate-400">
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ background: b.color }}
                    />
                    {b.label}
                  </div>
                ))}
              </div>
            </div>

            {/* Asset cards */}
            <div className="space-y-3">
              {blocks.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <Wallet className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Noch keine Assets verknüpft.</p>
                  <p className="text-xs mt-1">
                    Füge P2P-Plattformen oder Bankkonten in den{" "}
                    <a href="/settings" className="text-cyan-400 underline">Einstellungen</a> hinzu.
                  </p>
                </div>
              ) : (
                blocks.map((b) => <AssetCard key={b.label} block={b} total={total} />)
              )}
            </div>
          </div>

          {lastUpdate && (
            <p className="text-xs text-slate-600 mt-6 text-center">
              Zuletzt aktualisiert: {lastUpdate.toLocaleString("de-DE")}
            </p>
          )}
        </>
      )}
    </div>
  );
}
