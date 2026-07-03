"use client";

/**
 * "Nettovermögen" — extracted from the former standalone /networth page so
 * it can be embedded as a collapsible section on /depot. Logic, data
 * fetching and hooks are unchanged; only the export shape changed and the
 * top-level heading was demoted from h1 to h2.
 */
import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wallet,
  TrendingUp,
  Landmark,
  Building,
  Building2,
  Loader2,
  RefreshCw,
  AlertTriangle,
  Plus,
  Trash2,
  RefreshCcw,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { api } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PortfolioSummary {
  total_value: number;
  day_pnl_pct: number;
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

interface BankConnection {
  id: number;
  bank_name: string;
  blz: string;
  username: string;
  account_iban: string | null;
  portfolio_id: number | null;
  last_synced: string | null;
  last_balance: number | null;
  currency: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout nach ${ms / 1000}s`)), ms)
    ),
  ]);
}

const fmt = (n: number, currency = "EUR") =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);

function pct(n: number, sign = true) {
  const s = sign && n > 0 ? "+" : "";
  return `${s}${n.toFixed(2)} %`;
}

// ---------------------------------------------------------------------------
// Broker display config
// ---------------------------------------------------------------------------

const BROKER_COLORS: Record<string, string> = {
  bitpanda: "#FF6B35",
  comdirect: "#FFD700",
  degiro: "#FF4B6E",
  flatex: "#4ECDC4",
  trade_republic: "#00E676",
  wh_selfinvest: "#A78BFA",
};

const BROKER_LABELS: Record<string, string> = {
  bitpanda: "Bitpanda",
  comdirect: "Comdirect",
  degiro: "DeGiro",
  flatex: "Flatex",
  trade_republic: "Trade Republic",
  wh_selfinvest: "WH SelfInvest",
};

// ---------------------------------------------------------------------------
// DonutChart (CSS-only)
// ---------------------------------------------------------------------------

function DonutSegment({ blocks }: { blocks: AssetBlock[] }) {
  const total = blocks.reduce((s, b) => s + b.value, 0);
  if (total === 0) return null;

  let cumulativePct = 0;
  const segments = blocks.map((b) => {
    const share = (b.value / total) * 100;
    const start = cumulativePct;
    cumulativePct += share;
    return { ...b, share, start };
  });

  const gradientParts = segments.map(
    (s) => `${s.color} ${s.start.toFixed(1)}% ${(s.start + s.share).toFixed(1)}%`
  );

  return (
    <div className="relative w-48 h-48 mx-auto">
      <div
        className="w-full h-full rounded-full"
        style={{
          background: `conic-gradient(${gradientParts.join(", ")})`,
        }}
      />
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
// BankConnectionsPanel
// ---------------------------------------------------------------------------

const KNOWN_BLZ: Record<string, string> = {
  "20041155": "comdirect",
  "12030000": "DKB",
  "50010517": "ING-DiBa",
  "30060010": "Volksbank (Fiducia)",
};

function BankConnectionsPanel({ onBalanceChange }: { onBalanceChange: () => void }) {
  const [connections, setConnections] = useState<BankConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [syncing, setSyncing] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [syncPin, setSyncPin] = useState<Record<number, string>>({});
  const [syncResult, setSyncResult] = useState<Record<number, string>>({});
  const [addForm, setAddForm] = useState({ bank_name: "", blz: "", username: "", account_iban: "", currency: "EUR" });
  const [addError, setAddError] = useState("");
  const [addLoading, setAddLoading] = useState(false);

  const reload = useCallback(async () => {
    try { setConnections(await api.bank.connections()); } finally { setLoading(false); }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const handleSync = async (conn: BankConnection) => {
    const pin = syncPin[conn.id];
    if (!pin?.trim()) { setSyncResult(prev => ({ ...prev, [conn.id]: "Bitte PIN eingeben" })); return; }
    setSyncing(conn.id);
    setSyncResult(prev => ({ ...prev, [conn.id]: "" }));
    try {
      const res = await api.bank.sync({ blz: conn.blz, username: conn.username, pin: pin.trim(), iban: conn.account_iban ?? undefined });
      setSyncResult(prev => ({ ...prev, [conn.id]: `Kontostand: ${fmt(res.balance, res.currency)} (${res.is_demo ? "Demo" : "Live"})` }));
      setSyncPin(prev => ({ ...prev, [conn.id]: "" }));
      await reload();
      onBalanceChange();
    } catch (e) {
      setSyncResult(prev => ({ ...prev, [conn.id]: e instanceof Error ? e.message : "Sync fehlgeschlagen" }));
    } finally {
      setSyncing(null);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Bankverbindung wirklich löschen?")) return;
    setDeleting(id);
    try { await api.bank.deleteConnection(id); await reload(); onBalanceChange(); }
    catch { /* ignore */ }
    finally { setDeleting(null); }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError("");
    if (!addForm.bank_name.trim() || !addForm.blz.trim() || !addForm.username.trim()) {
      setAddError("Bankname, BLZ und Login sind Pflichtfelder");
      return;
    }
    setAddLoading(true);
    try {
      await api.bank.addConnection({
        bank_name: addForm.bank_name.trim(),
        blz: addForm.blz.trim(),
        username: addForm.username.trim(),
        account_iban: addForm.account_iban.trim() || undefined,
        currency: addForm.currency,
      });
      setAddForm({ bank_name: "", blz: "", username: "", account_iban: "", currency: "EUR" });
      setShowAdd(false);
      await reload();
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "Fehler beim Hinzufügen");
    } finally {
      setAddLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 overflow-hidden">
      <div className="px-5 py-4 flex items-center justify-between border-b border-slate-800/60">
        <div className="flex items-center gap-2">
          <Building className="w-4 h-4 text-neon-green" />
          <span className="text-sm font-semibold text-white">Bankverbindungen (FinTS)</span>
          {!loading && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">{connections.length}</span>
          )}
        </div>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-slate-700 text-slate-400 hover:text-neon-green hover:border-green-500/40 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Verbindung hinzufügen
          {showAdd ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />}
        </button>
      </div>

      <AnimatePresence>
        {showAdd && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <form onSubmit={handleAdd} className="p-5 border-b border-slate-800/40 space-y-3">
              <p className="text-xs text-slate-500 mb-3">
                Trage deine Bankdaten ein. Die PIN wird <strong className="text-slate-300">niemals gespeichert</strong> — sie wird nur beim manuellen Sync einmalig übermittelt.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Bankname</label>
                  <input
                    value={addForm.bank_name}
                    onChange={(e) => {
                      const blz = Object.entries(KNOWN_BLZ).find(([, n]) => n.toLowerCase() === e.target.value.toLowerCase())?.[0] ?? addForm.blz;
                      setAddForm((f) => ({ ...f, bank_name: e.target.value, blz: blz || f.blz }));
                    }}
                    placeholder="comdirect, DKB, ING-DiBa…"
                    className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-green-500/50"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">BLZ (8 Ziffern)</label>
                  <input
                    value={addForm.blz}
                    onChange={(e) => setAddForm((f) => ({ ...f, blz: e.target.value }))}
                    placeholder="20041155"
                    maxLength={8}
                    className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-green-500/50"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Online-Banking-Login</label>
                  <input
                    value={addForm.username}
                    onChange={(e) => setAddForm((f) => ({ ...f, username: e.target.value }))}
                    placeholder="Kundennummer / Login"
                    className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-green-500/50"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">IBAN (optional)</label>
                  <input
                    value={addForm.account_iban}
                    onChange={(e) => setAddForm((f) => ({ ...f, account_iban: e.target.value }))}
                    placeholder="DE89 3704 0044 0532 0130 00"
                    className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-green-500/50"
                  />
                </div>
              </div>
              {addError && <p className="text-xs text-red-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{addError}</p>}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowAdd(false)}
                  className="flex-1 py-2 rounded-lg border border-slate-700 text-sm text-slate-400 hover:text-white transition-colors"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={addLoading}
                  className="flex-1 py-2 rounded-lg text-sm font-semibold text-black transition-opacity disabled:opacity-50"
                  style={{ background: "#00FF88" }}
                >
                  {addLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Verbindung speichern"}
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 text-neon-green animate-spin" />
        </div>
      ) : connections.length === 0 ? (
        <div className="text-center py-8 text-slate-600 text-xs">
          <Building className="w-8 h-8 mx-auto mb-2 opacity-30" />
          Noch keine Bankverbindung hinterlegt.
        </div>
      ) : (
        <div className="divide-y divide-slate-800/40">
          {connections.map((conn) => (
            <div key={conn.id} className="p-4 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">{conn.bank_name}</p>
                  <p className="text-xs text-slate-500 font-mono">{conn.blz} · {conn.username}</p>
                  {conn.account_iban && <p className="text-xs text-slate-600 font-mono">{conn.account_iban}</p>}
                </div>
                <div className="text-right flex-shrink-0">
                  {conn.last_balance != null && (
                    <p className="text-sm font-bold text-neon-green">{fmt(conn.last_balance, conn.currency)}</p>
                  )}
                  {conn.last_synced && (
                    <p className="text-xs text-slate-600">
                      {new Date(conn.last_synced).toLocaleDateString("de-DE")}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="password"
                  value={syncPin[conn.id] ?? ""}
                  onChange={(e) => setSyncPin((p) => ({ ...p, [conn.id]: e.target.value }))}
                  placeholder="PIN für Sync"
                  className="flex-1 bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-green-500/50"
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSync(conn); } }}
                />
                <button
                  onClick={() => handleSync(conn)}
                  disabled={syncing === conn.id}
                  className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-slate-700 text-slate-400 hover:text-neon-green hover:border-green-500/40 transition-colors disabled:opacity-50"
                >
                  {syncing === conn.id
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <RefreshCcw className="w-3.5 h-3.5" />
                  }
                  Sync
                </button>
                <button
                  onClick={() => handleDelete(conn.id)}
                  disabled={deleting === conn.id}
                  className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-slate-700 text-slate-400 hover:text-red-400 hover:border-red-500/40 transition-colors disabled:opacity-50"
                >
                  {deleting === conn.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                </button>
              </div>
              {syncResult[conn.id] && (
                <p className={`text-xs ${syncResult[conn.id].startsWith("Kontostand") ? "text-neon-green" : "text-red-400"}`}>
                  {syncResult[conn.id]}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------------

export function NetWorthSection() {
  const [blocks, setBlocks] = useState<AssetBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const results: AssetBlock[] = [];

    const [portfolioResult, p2pResult, bankResult, brokersResult] = await Promise.allSettled([
      api.portfolio.snapshot(),
      api.p2p.summary(),
      api.bank.connections(),
      withTimeout(api.brokers.summary(), 10_000),
    ]);

    // Aktien & internes Portfolio
    if (portfolioResult.status === "fulfilled") {
      const d = portfolioResult.value as PortfolioSummary;
      if (d.total_value > 0) {
        results.push({
          label: "Aktien & Krypto",
          value: d.total_value,
          color: "#00D4FF",
          icon: TrendingUp,
          sub: d.day_pnl_pct !== undefined ? `Heute: ${pct(d.day_pnl_pct)}` : undefined,
        });
      }
    }

    // P2P (Bondora, Mintos etc. via interne P2P-API)
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

    // Bankkonten
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

    // Broker-Depots (Bitpanda, Comdirect, DeGiro, Flatex, Trade Republic, WH)
    if (brokersResult.status === "fulfilled") {
      const summary = brokersResult.value;

      for (const broker of summary.brokers) {
        if (broker.error || broker.is_demo) continue;
        const value = broker.total_value_eur ?? broker.total_value ?? 0;
        if (value <= 0) continue;

        const numPositions = broker.num_positions ?? broker.positions?.length ?? 0;
        const numDepots = broker.num_depots ?? broker.depots?.length;

        let sub: string | undefined;
        if (numDepots && numDepots > 1) {
          sub = `${numDepots} Depots · ${numPositions} Positionen`;
        } else if (numPositions > 0) {
          sub = `${numPositions} Positionen`;
        }

        results.push({
          label: BROKER_LABELS[broker.broker] ?? broker.broker,
          value,
          color: BROKER_COLORS[broker.broker] ?? "#888",
          icon: Building2,
          sub,
        });
      }

      // P2P aus Broker-Summary (z.B. Crowdestor)
      for (const p2p of summary.p2p) {
        if (p2p.error || p2p.is_demo) continue;
        const invested = p2p.total_invested_eur ?? p2p.total_invested ?? 0;
        const cash = p2p.free_cash ?? 0;
        const total = invested + cash;
        if (total <= 0) continue;

        results.push({
          label: BROKER_LABELS[p2p.broker] ?? p2p.broker,
          value: total,
          color: "#9333EA",
          icon: Landmark,
          sub: invested > 0 ? `${fmt(invested)} investiert` : undefined,
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
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Wallet className="w-5 h-5 text-neon-green" />
            Nettovermögen
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Alle Assets konsolidiert — Aktien, P2P, Bankkonten, Broker-Depots
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
            {blocks.length > 0 && (
              <p className="text-xs text-slate-600 mt-1">{blocks.length} Asset-Klassen</p>
            )}
          </motion.div>

          {/* Donut + asset list */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Donut */}
            <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-6 flex flex-col items-center justify-center gap-4">
              <DonutSegment blocks={blocks} />
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
            <div className="space-y-3 overflow-y-auto max-h-[520px] pr-1">
              {blocks.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <Wallet className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Noch keine Assets verknüpft.</p>
                  <p className="text-xs mt-1">
                    Füge Broker-Credentials oder P2P-Plattformen in den{" "}
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

          {/* Bank connection management */}
          <div className="mt-6">
            <BankConnectionsPanel onBalanceChange={load} />
          </div>
        </>
      )}
    </div>
  );
}
