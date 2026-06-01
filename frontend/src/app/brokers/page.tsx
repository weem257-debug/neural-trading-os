"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Building2,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Loader2,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Euro,
  Lock,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Upload,
  FileText,
} from "lucide-react";
import { GlassCard, SectionLabel } from "@/components/ui/GlassCard";
import { api, type BrokerPortfolioData, type BrokerPosition, type BrokerDepot } from "@/lib/api";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BrokerStatus {
  status: string;           // "configured" | "not_set" | "oauth_pending"
  api_type: string;
  phase: number;
  note?: string;
  requires?: string;
  route?: string;
}

interface BrokerCardInfo {
  key: string;
  label: string;
  description: string;
  color: string;
  accent: string;
  phaseLabel: string;
}

// ---------------------------------------------------------------------------
// Broker-Definitionen
// ---------------------------------------------------------------------------

const BROKER_CARDS: BrokerCardInfo[] = [
  {
    key: "bitpanda",
    label: "Bitpanda",
    description: "Crypto, ETFs, Aktien, Metalle",
    color: "rgba(255,107,0,0.15)",
    accent: "#FF6B00",
    phaseLabel: "Offizielle API",
  },
  {
    key: "comdirect",
    label: "Comdirect",
    description: "Depot — OAuth2 + PHOTO-TAN",
    color: "rgba(0,212,255,0.1)",
    accent: "#00D4FF",
    phaseLabel: "Offizielle API",
  },
  {
    key: "degiro",
    label: "DEGIRO",
    description: "Depot — Community-Lib",
    color: "rgba(0,200,83,0.12)",
    accent: "#00C853",
    phaseLabel: "Community-Lib",
  },
  {
    key: "flatex",
    label: "Flatex",
    description: "Konto via FinTS/HBCI",
    color: "rgba(123,47,255,0.12)",
    accent: "#7B2FFF",
    phaseLabel: "FinTS/HBCI",
  },
  {
    key: "trade_republic",
    label: "Trade Republic",
    description: "Portfolio — WebSocket",
    color: "rgba(255,210,0,0.1)",
    accent: "#FFD200",
    phaseLabel: "Inoffiziell",
  },
  {
    key: "wh_selfinvest",
    label: "WH SelfInvest",
    description: "CFD/Futures — cTrader API",
    color: "rgba(255,0,128,0.1)",
    accent: "#FF0080",
    phaseLabel: "cTrader API",
  },
  {
    key: "crowdestor",
    label: "Crowdestor",
    description: "P2P Crowdinvesting",
    color: "rgba(0,255,136,0.08)",
    accent: "#00FF88",
    phaseLabel: "Inoffiziell",
  },
];

// ---------------------------------------------------------------------------
// Helper: Status-Badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  if (status === "configured") {
    return (
      <span className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full"
        style={{ background: "rgba(0,255,136,0.1)", color: "#00FF88", border: "1px solid rgba(0,255,136,0.25)" }}>
        <CheckCircle className="w-3 h-3" />
        Verbunden
      </span>
    );
  }
  if (status === "oauth_pending") {
    return (
      <span className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full"
        style={{ background: "rgba(255,170,0,0.1)", color: "#FFAA00", border: "1px solid rgba(255,170,0,0.25)" }}>
        <AlertTriangle className="w-3 h-3" />
        Auth erforderlich
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full"
      style={{ background: "rgba(100,116,139,0.1)", color: "#64748B", border: "1px solid rgba(100,116,139,0.2)" }}>
      <XCircle className="w-3 h-3" />
      Nicht konfiguriert
    </span>
  );
}

// ---------------------------------------------------------------------------
// Helper: Gesamtwert aus dem Broker-Objekt lesen (verschiedene Felder je Broker)
// ---------------------------------------------------------------------------

function getTotalValue(data: BrokerPortfolioData): number {
  return data.total_value_eur ?? data.total_value ?? data.total_invested ?? 0;
}

function getProfitLoss(data: BrokerPortfolioData): number {
  return data.total_profit_loss_eur ?? data.total_profit_loss ?? 0;
}

function getProfitLossPct(data: BrokerPortfolioData): number | null {
  return data.total_profit_loss_pct ?? null;
}

// ---------------------------------------------------------------------------
// Flatex CSV-Upload
// ---------------------------------------------------------------------------

function FlatexCsvUpload({ onData }: { onData: (d: BrokerPortfolioData) => void }) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function handleFile(file: File) {
    if (!file.name.endsWith(".csv")) {
      setResult({ ok: false, message: "Nur CSV-Dateien erlaubt." });
      return;
    }
    setUploading(true);
    setResult(null);
    try {
      const data = await api.brokers.flatexImportCsv(file);
      onData(data);
      const n = (data as BrokerPortfolioData & { num_positions?: number }).num_positions ?? 0;
      setResult({ ok: true, message: `${n} Position${n !== 1 ? "en" : ""} importiert.` });
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : "Import fehlgeschlagen." });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="border-t border-white/5 px-4 py-3">
      <p className="text-xs text-slate-500 mb-2 flex items-center gap-1.5">
        <FileText className="w-3.5 h-3.5 text-purple-400" />
        Depot-CSV importieren
        <span className="text-slate-600">(Mein Depot → Export → CSV-Export)</span>
      </p>
      <label
        className={`flex flex-col items-center justify-center gap-1.5 rounded-xl p-3 text-xs cursor-pointer transition-all ${dragging ? "opacity-100" : "opacity-70 hover:opacity-100"}`}
        style={{
          border: `1px dashed ${dragging ? "#7B2FFF" : "rgba(123,47,255,0.4)"}`,
          background: dragging ? "rgba(123,47,255,0.08)" : "rgba(123,47,255,0.04)",
        }}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) handleFile(file);
        }}
      >
        {uploading
          ? <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
          : <Upload className="w-4 h-4 text-purple-400" />
        }
        <span className="text-slate-400">
          {uploading ? "Importiere…" : "CSV hierher ziehen oder klicken"}
        </span>
        <input type="file" accept=".csv" className="sr-only"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
      </label>
      {result && (
        <p className={`mt-1.5 text-xs ${result.ok ? "text-green-400" : "text-red-400"}`}>
          {result.ok ? "✓" : "✗"} {result.message}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Broker-Karte (Einzelne Zeile)
// ---------------------------------------------------------------------------

function BrokerCard({
  info,
  status,
  data,
  loading,
  onRefresh,
  showCsvUpload,
  onPortfolioData,
}: {
  info: BrokerCardInfo;
  status: BrokerStatus | null;
  data: BrokerPortfolioData | null;
  loading: boolean;
  onRefresh: () => void;
  showCsvUpload?: boolean;
  onPortfolioData?: (d: BrokerPortfolioData) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const configured = status?.status === "configured";
  const isDemo = data?.is_demo ?? false;
  const hasError = !!data?.error;

  const totalValue = data ? getTotalValue(data) : null;
  const pl = data ? getProfitLoss(data) : null;
  const plPct = data ? getProfitLossPct(data) : null;
  const isPositive = (pl ?? 0) >= 0;

  // Positionen oder Depots für die Detailansicht
  const positions: BrokerPosition[] = data?.positions ?? [];
  const depots: BrokerDepot[] = data?.depots ?? [];
  const hasDetail = positions.length > 0 || depots.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-2xl overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${info.color}, rgba(8,11,20,0.8))`,
        border: `1px solid ${configured ? info.accent + "40" : "rgba(255,255,255,0.06)"}`,
        boxShadow: configured ? `0 0 20px ${info.accent}15` : "none",
      }}
    >
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <h3 className="text-sm font-bold text-slate-100">{info.label}</h3>
              <span className="text-xs px-1.5 py-0.5 rounded-full font-mono"
                style={{ background: info.accent + "18", color: info.accent, fontSize: "10px" }}>
                {info.phaseLabel}
              </span>
            </div>
            <p className="text-xs text-slate-500">{info.description}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {status && <StatusBadge status={status.status} />}
            <button
              onClick={onRefresh}
              disabled={loading}
              aria-label={`${info.label} aktualisieren`}
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-all disabled:opacity-40"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Werte */}
        {loading ? (
          <div className="flex items-center gap-2 py-2">
            <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
            <span className="text-xs text-slate-500">Lade Daten…</span>
          </div>
        ) : hasError ? (
          <p className="text-xs text-red-400 py-1">{data?.error}</p>
        ) : data ? (
          <div className="space-y-1">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono" style={{ color: info.accent }}>
                {totalValue !== null ? `€${totalValue.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
              </span>
              {isDemo && (
                <span className="text-xs text-slate-600 font-mono">Demo</span>
              )}
            </div>
            {pl !== null && pl !== 0 && (
              <div className="flex items-center gap-1.5">
                {isPositive
                  ? <TrendingUp className="w-3.5 h-3.5 text-green-400" />
                  : <TrendingDown className="w-3.5 h-3.5 text-red-400" />
                }
                <span className="text-xs font-mono font-semibold"
                  style={{ color: isPositive ? "#00FF88" : "#FF4444" }}>
                  {isPositive ? "+" : ""}{pl.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR
                  {plPct !== null && ` (${isPositive ? "+" : ""}${plPct.toFixed(2)}%)`}
                </span>
              </div>
            )}
            {/* Hinweis wenn Auth erforderlich */}
            {data.auth_required && (
              <div className="flex items-center gap-1.5 mt-1">
                <Lock className="w-3 h-3 text-amber-400" />
                <span className="text-xs text-amber-400">OAuth-Auth erforderlich</span>
              </div>
            )}
            {/* Hinweis wenn optionales Paket fehlt */}
            {data.lib_missing && status?.requires && (
              <div className="flex items-center gap-1.5 mt-1 px-2 py-1 rounded-lg"
                style={{ background: "rgba(255,170,0,0.08)", border: "1px solid rgba(255,170,0,0.2)" }}>
                <AlertTriangle className="w-3 h-3 text-amber-400 flex-shrink-0" />
                <code className="text-xs text-amber-300 font-mono">{status.requires}</code>
              </div>
            )}
          </div>
        ) : configured ? (
          <p className="text-xs text-slate-600 py-2">Klicke auf Aktualisieren zum Laden</p>
        ) : (
          <div className="py-1">
            <p className="text-xs text-slate-600 mb-1">Credentials in den</p>
            <Link
              href="/settings"
              className="inline-flex items-center gap-1 text-xs font-semibold underline"
              style={{ color: info.accent }}
            >
              <ExternalLink className="w-3 h-3" />
              Einstellungen konfigurieren
            </Link>
          </div>
        )}

        {/* Expand-Toggle */}
        {hasDetail && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="mt-3 flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {expanded ? "Weniger" : `${positions.length + depots.length} Position${positions.length + depots.length !== 1 ? "en" : ""} anzeigen`}
          </button>
        )}
      </div>

      {/* Detail: Positionen */}
      {expanded && hasDetail && (
        <div className="border-t border-white/5 px-4 py-3 space-y-1.5 max-h-60 overflow-y-auto">
          {/* Depot-Modus (Comdirect: mehrere Depots) */}
          {depots.length > 0 && depots.map((depot) => {
            const depotPl = depot.total_profit_loss ?? 0;
            const depotPlPos = depotPl >= 0;
            return (
              <div key={depot.depot_id} className="mb-3">
                {/* Depot-Header mit Name + Gesamtwert + P&L */}
                <div className="flex items-center justify-between mb-1.5 px-1">
                  <span className="text-xs font-semibold text-slate-300">{depot.depot_name}</span>
                  <div className="flex items-center gap-2 text-xs font-mono">
                    <span style={{ color: info.accent }}>
                      €{(depot.total_value ?? 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    {depotPl !== 0 && (
                      <span style={{ color: depotPlPos ? "#00FF88" : "#FF4444", fontSize: "10px" }}>
                        {depotPlPos ? "+" : ""}{depotPl.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    )}
                  </div>
                </div>
                <div className="space-y-0.5">
                  {depot.positions.map((pos, idx) => (
                    <PositionRow key={idx} pos={pos} accent={info.accent} />
                  ))}
                </div>
                {depots.indexOf(depot) < depots.length - 1 && (
                  <div className="mt-2 border-t border-white/5" />
                )}
              </div>
            );
          })}
          {/* Positions-Modus (alle anderen) */}
          {depots.length === 0 && positions.map((pos, idx) => (
            <PositionRow key={idx} pos={pos} accent={info.accent} />
          ))}
        </div>
      )}

      {/* CSV-Upload (Flatex) */}
      {showCsvUpload && onPortfolioData && (
        <FlatexCsvUpload onData={onPortfolioData} />
      )}
    </motion.div>
  );
}

function PositionRow({ pos, accent }: { pos: BrokerPosition; accent: string }) {
  const value = pos.current_value_eur ?? pos.current_value ?? 0;
  const pl = pos.profit_loss_eur ?? pos.profit_loss_abs ?? null;
  const plPct = pos.profit_loss_pct ?? null;
  const isPos = (pl ?? 0) >= 0;
  const symbol = pos.symbol ?? pos.isin ?? "—";
  const name = pos.name ?? "";
  const qty = pos.amount ?? pos.quantity ?? null;

  return (
    <div className="flex items-center justify-between py-1 text-xs">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="font-mono font-bold text-slate-200 flex-shrink-0">{symbol}</span>
        {name && <span className="text-slate-500 truncate">{name}</span>}
        {qty !== null && <span className="text-slate-600 flex-shrink-0 font-mono">{qty}</span>}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
        <span className="font-mono" style={{ color: accent }}>
          €{value.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
        {plPct !== null && plPct !== undefined && (
          <span className="font-mono" style={{ color: isPos ? "#00FF88" : "#FF4444", fontSize: "10px" }}>
            {isPos ? "+" : ""}{plPct.toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gesamt-Summary-Banner
// ---------------------------------------------------------------------------

function TotalBanner({ total, brokerValue, p2pValue, loading }: {
  total: number;
  brokerValue: number;
  p2pValue: number;
  loading: boolean;
}) {
  return (
    <GlassCard variant="cyan" delay={0}>
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-center gap-3 flex-1">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(0,212,255,0.15)", border: "1px solid rgba(0,212,255,0.3)" }}>
            <Euro className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-0.5">Alle Depots gesamt</p>
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
            ) : (
              <p className="text-3xl font-bold font-mono text-white">
                {total.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-6 sm:gap-8">
          <div>
            <p className="text-xs text-slate-600 mb-0.5">Broker-Depots</p>
            <p className="text-base font-mono font-semibold text-cyan-400">
              {loading ? "—" : `€${brokerValue.toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-600 mb-0.5">P2P Investiert</p>
            <p className="text-base font-mono font-semibold text-neon-green">
              {loading ? "—" : `€${p2pValue.toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
            </p>
          </div>
        </div>
      </div>
    </GlassCard>
  );
}

// ---------------------------------------------------------------------------
// Async-Fetch pro Broker
// ---------------------------------------------------------------------------

type FetchFn = () => Promise<BrokerPortfolioData>;

const BROKER_FETCHERS: Record<string, FetchFn> = {
  bitpanda: () => api.brokers.bitpanda(),
  comdirect: () => api.brokers.comdirect(),
  degiro: () => api.brokers.degiro(),
  flatex: () => api.brokers.flatexAccount(),
  trade_republic: () => api.brokers.tradeRepublic(),
  wh_selfinvest: () => api.brokers.whSelfinvest(),
  crowdestor: () => api.brokers.crowdestor(),
};

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function BrokersPage() {
  const [statuses, setStatuses] = useState<Record<string, BrokerStatus> | null>(null);
  const [brokerData, setBrokerData] = useState<Record<string, BrokerPortfolioData | null>>({});
  const [loadingBrokers, setLoadingBrokers] = useState<Record<string, boolean>>({});
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryTotal, setSummaryTotal] = useState(0);
  const [summaryBroker, setSummaryBroker] = useState(0);
  const [summaryP2P, setSummaryP2P] = useState(0);
  const [globalRefreshing, setGlobalRefreshing] = useState(false);

  // Status aller Broker laden
  useEffect(() => {
    api.brokers.status()
      .then(setStatuses)
      .catch(() => setStatuses(null));
  }, []);

  // Summary für Gesamtsumme
  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const s = await api.brokers.summary();
      setSummaryTotal(s.total_portfolio_value);
      setSummaryBroker(s.total_broker_value);
      setSummaryP2P(s.total_p2p_invested);

      // Broker-Daten aus Summary befüllen
      const mapped: Record<string, BrokerPortfolioData> = {};
      for (const d of s.brokers) {
        if (d.broker) mapped[d.broker] = d;
      }
      for (const d of s.p2p) {
        if (d.broker) mapped[d.broker] = d;
      }
      setBrokerData(mapped);
    } catch {
      // summary fehlgeschlagen — einzeln laden
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  // Einzelnen Broker neu laden
  const refreshBroker = useCallback(async (key: string) => {
    const fetcher = BROKER_FETCHERS[key];
    if (!fetcher) return;
    setLoadingBrokers((prev) => ({ ...prev, [key]: true }));
    try {
      const data = await fetcher();
      setBrokerData((prev) => ({ ...prev, [key]: data }));
      // Summary neu berechnen
      setSummaryTotal((prev) => {
        const oldVal = brokerData[key] ? getTotalValue(brokerData[key]!) : 0;
        const newVal = getTotalValue(data);
        return prev - oldVal + newVal;
      });
    } catch (err) {
      setBrokerData((prev) => ({
        ...prev,
        [key]: { broker: key, error: err instanceof Error ? err.message : "Fehler", is_demo: true },
      }));
    } finally {
      setLoadingBrokers((prev) => ({ ...prev, [key]: false }));
    }
  }, [brokerData]);

  // Alle Broker neu laden
  const refreshAll = useCallback(async () => {
    setGlobalRefreshing(true);
    await loadSummary();
    setGlobalRefreshing(false);
  }, [loadSummary]);

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="w-5 h-5 text-cyan-400" />
            <h1 className="text-2xl font-bold text-slate-100">Broker & Depots</h1>
          </div>
          <p className="text-sm text-slate-500">
            Alle Broker-Depots in der Übersicht. Credentials in den{" "}
            <Link href="/settings" className="text-cyan-400 underline underline-offset-2 hover:text-cyan-300">
              Einstellungen
            </Link>{" "}
            konfigurieren.
          </p>
        </div>
        <button
          onClick={refreshAll}
          disabled={globalRefreshing}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
          style={{
            background: "rgba(0,212,255,0.1)",
            border: "1px solid rgba(0,212,255,0.25)",
            color: "#00D4FF",
          }}
        >
          <RefreshCw className={`w-4 h-4 ${globalRefreshing ? "animate-spin" : ""}`} />
          Alle aktualisieren
        </button>
      </motion.div>

      {/* Gesamt-Banner */}
      <TotalBanner
        total={summaryTotal}
        brokerValue={summaryBroker}
        p2pValue={summaryP2P}
        loading={summaryLoading}
      />

      {/* Broker-Karten Grid */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <SectionLabel>Broker-Depots</SectionLabel>
          {statuses && (
            <span className="text-xs text-slate-600 font-mono">
              {Object.values(statuses).filter((s) => s.status === "configured").length} / {Object.keys(statuses).length - 2} konfiguriert
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {BROKER_CARDS.map((info) => (
            <BrokerCard
              key={info.key}
              info={info}
              status={statuses?.[info.key] ?? null}
              data={brokerData[info.key] ?? null}
              loading={loadingBrokers[info.key] ?? false}
              onRefresh={() => refreshBroker(info.key)}
              showCsvUpload={info.key === "flatex"}
              onPortfolioData={info.key === "flatex"
                ? (d) => setBrokerData((prev) => ({ ...prev, flatex: d }))
                : undefined}
            />
          ))}
        </div>
      </div>

      {/* Info-Box */}
      <GlassCard delay={0.3}>
        <div className="flex gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="space-y-2 text-xs text-slate-500">
            <p className="font-semibold text-slate-400">Hinweise zur Datenverfügbarkeit</p>
            <ul className="space-y-1 list-disc list-inside">
              <li><strong className="text-slate-300">Comdirect:</strong> Benötigt OAuth2 + PHOTO-TAN — einmalig über &quot;OAuth einrichten&quot; in den Einstellungen.</li>
              <li><strong className="text-slate-300">Flatex:</strong> Kontostand via FinTS. PIN wird nie gespeichert — nur im Memory während des Sync-Vorgangs.</li>
              <li><strong className="text-slate-300">Trade Republic:</strong> 2FA-Bestätigung in der TR-App beim ersten Connect nötig.</li>
              <li><strong className="text-slate-300">DEGIRO:</strong> Benötigt <code className="bg-white/5 px-1 rounded">pip install degiro-connector</code> auf dem Server.</li>
              <li><strong className="text-slate-300">Demo-Daten:</strong> Nicht konfigurierte Broker zeigen realistische Demo-Daten zur Orientierung.</li>
            </ul>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
