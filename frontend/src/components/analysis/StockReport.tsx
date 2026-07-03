"use client";

/**
 * Stock report tool — extracted from the public /aktienanalyse page so the
 * exact same component can be embedded as a collapsible section on /live
 * AND continue to power the public, no-login SEO page unchanged.
 *
 * `standalone` (default false) toggles the full-viewport public chrome
 * (sticky share header + full-screen dark background). The public page
 * passes `standalone`; the embedded /live section omits it and gets a
 * plain content block that inherits the surrounding dashboard shell.
 *
 * All ticker-analysis logic below is unchanged from the original page.
 */
import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  LineChart,
  Loader2,
  Share2,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
} from "lucide-react";
import { GlassCard, SectionLabel, NeonBadge } from "@/components/ui/GlassCard";
import { api } from "@/lib/api";
import type { StockReport as StockReportData, StockVerdikt } from "@/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_TICKERS = 8;
const DEFAULT_TICKERS = "AAPL, MSFT, NVDA";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseTickers(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(/[\s,;\n]+/)
        .map((t) => t.trim().toUpperCase())
        .filter((t) => t.length > 0 && t.length <= 10)
    ),
  ];
}

interface VerdiktStyle {
  color: string;
  bg: string;
  border: string;
  label: string;
}

function getVerdiktStyle(verdict: StockVerdikt): VerdiktStyle {
  switch (verdict) {
    case "STRONG_BUY":
      return { color: "#00FF88", bg: "rgba(0,255,136,0.12)", border: "rgba(0,255,136,0.35)", label: "STARK KAUFEN" };
    case "BUY":
      return { color: "#00FF88", bg: "rgba(0,255,136,0.08)", border: "rgba(0,255,136,0.25)", label: "KAUFEN" };
    case "HOLD":
      return { color: "#FFD700", bg: "rgba(255,215,0,0.10)", border: "rgba(255,215,0,0.30)", label: "HALTEN" };
    case "SELL":
      return { color: "#FF0080", bg: "rgba(255,0,128,0.08)", border: "rgba(255,0,128,0.25)", label: "VERKAUFEN" };
    case "STRONG_SELL":
      return { color: "#FF0080", bg: "rgba(255,0,128,0.12)", border: "rgba(255,0,128,0.35)", label: "STARK VERKAUFEN" };
    default:
      return { color: "#64748B", bg: "rgba(100,116,139,0.08)", border: "rgba(100,116,139,0.25)", label: "KEINE EMPFEHLUNG" };
  }
}

/** Promise pool — runs tasks with max `concurrency` at a time. */
async function runWithLimit<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length);
  let idx = 0;
  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      try {
        results[i] = { status: "fulfilled", value: await tasks[i]() };
      } catch (e) {
        results[i] = { status: "rejected", reason: e };
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, tasks.length) }, worker)
  );
  return results;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ConfidenceBar({ value, label }: { value: number; label: string }) {
  const pct = Math.round(value * 100);
  const color = pct >= 70 ? "#00FF88" : pct >= 40 ? "#FFD700" : "#FF0080";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-slate-500">{label}</span>
        <span className="font-mono font-bold" style={{ color }}>{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="h-full rounded-full"
          style={{ background: color, boxShadow: `0 0 6px ${color}60` }}
        />
      </div>
    </div>
  );
}

function DisclaimerBanner() {
  return (
    <div
      className="flex items-start gap-3 px-4 py-3 rounded-xl text-xs leading-relaxed"
      style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)" }}
    >
      <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
      <span className="text-amber-200/80">
        <strong className="text-amber-400">Wichtiger Hinweis:</strong> Dies ist{" "}
        <strong>KEINE Anlage- oder Finanzberatung</strong>. Alle Angaben dienen nur zu
        Informations- und Demonstrationszwecken. Trading birgt erhebliche Verlustrisiken bis
        zum Totalverlust. Keine Gewähr für Richtigkeit, Vollständigkeit oder Aktualität der
        Daten. Konsultieren Sie einen qualifizierten Finanzberater vor jeder
        Investitionsentscheidung.
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ticker state union
// ---------------------------------------------------------------------------

type TickerState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; report: StockReportData };

function ReportCard({ ticker, state }: { ticker: string; state: TickerState }) {
  const [expanded, setExpanded] = useState(false);

  if (state.status === "loading") {
    return (
      <GlassCard className="flex items-center gap-4 py-6" animate={false}>
        <Loader2 className="w-5 h-5 animate-spin flex-shrink-0" style={{ color: "#00D4FF" }} />
        <div>
          <p className="font-mono font-bold text-slate-200">{ticker}</p>
          <p className="text-xs text-slate-500 mt-0.5">Analyse läuft … (10–30 s)</p>
        </div>
      </GlassCard>
    );
  }

  if (state.status === "error") {
    return (
      <GlassCard variant="pink" className="flex items-center gap-4 py-5" animate={false}>
        <AlertTriangle className="w-5 h-5 flex-shrink-0 text-red-400" />
        <div>
          <p className="font-mono font-bold text-slate-200">{ticker}</p>
          <p className="text-xs text-red-400 mt-0.5">{state.message}</p>
        </div>
      </GlassCard>
    );
  }

  if (state.status !== "success") return null;

  const { report } = state;
  const vs = getVerdiktStyle(report.verdict);
  const posPct = (report.position_size_pct * 100).toFixed(1);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="rounded-xl overflow-hidden"
      style={{
        background: "linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)",
        border: `1px solid ${vs.border}`,
        backdropFilter: "blur(20px)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
      }}
    >
      <div className="p-4">
        {/* Ticker + verdict */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <p className="text-xl font-black font-mono text-slate-100">{report.ticker}</p>
            <p className="text-xs text-slate-500 mt-0.5">
              {new Date(report.generated_at).toLocaleString("de-DE")}
            </p>
          </div>
          <div
            className="flex-shrink-0 px-4 py-2 rounded-xl text-sm font-black tracking-wide"
            style={{
              background: vs.bg,
              border: `1px solid ${vs.border}`,
              color: vs.color,
              textShadow: `0 0 12px ${vs.color}60`,
            }}
          >
            {vs.label}
          </div>
        </div>

        {/* Confidence + agreement */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <ConfidenceBar value={report.confidence} label="Konfidenz" />
          <ConfidenceBar value={report.agreement} label="Übereinstimmung" />
        </div>

        {/* Key metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
          {[
            {
              label: "Positionsgröße",
              value: `${posPct}%`,
              color: "#00D4FF",
            },
            {
              label: "Composite Score",
              value: `${report.composite_score >= 0 ? "+" : ""}${report.composite_score.toFixed(3)}`,
              color: report.composite_score >= 0 ? "#00FF88" : "#FF0080",
            },
            {
              label: "Stop-Loss",
              value: report.stop_loss != null ? `$${report.stop_loss.toFixed(2)}` : "—",
              color: "#FF0080",
            },
            {
              label: "Take-Profit",
              value: report.take_profit != null ? `$${report.take_profit.toFixed(2)}` : "—",
              color: "#00FF88",
            },
          ].map(({ label, value, color }) => (
            <div
              key={label}
              className="p-2.5 rounded-lg"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              <p className="text-xs text-slate-500 mb-1">{label}</p>
              <p className="font-mono font-bold text-sm" style={{ color }}>{value}</p>
            </div>
          ))}
        </div>

        {/* Data quality */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs text-slate-600">Datenqualität:</span>
          <NeonBadge
            color={
              report.data_quality === "good"
                ? "green"
                : report.data_quality === "limited"
                ? "yellow"
                : "pink"
            }
          >
            {report.data_quality}
          </NeonBadge>
        </div>

        {/* Summary */}
        <p className="text-sm text-slate-300 leading-relaxed">{report.summary}</p>

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 flex items-center gap-1.5 text-xs font-semibold transition-colors hover:text-slate-300"
          style={{ color: "#64748B" }}
        >
          {expanded ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
          Komponenten-Detail {expanded ? "ausblenden" : "anzeigen"}
        </button>
      </div>

      {/* Expandable components detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            key="detail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div
              className="px-4 pb-4 pt-3"
              style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
            >
              <p className="text-xs font-semibold text-slate-500 mb-2 tracking-wider">
                SIGNAL-KOMPONENTEN
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {Object.entries(report.components).map(([key, val]) => {
                  if (val == null) return null;
                  const score = val as number;
                  const color =
                    score >= 0.3 ? "#00FF88" : score <= -0.3 ? "#FF0080" : "#FFD700";
                  return (
                    <div
                      key={key}
                      className="flex items-center justify-between px-3 py-2 rounded-lg"
                      style={{
                        background: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.05)",
                      }}
                    >
                      <span className="text-xs text-slate-500 capitalize">
                        {key.replace(/_/g, " ")}
                      </span>
                      <span className="font-mono text-xs font-bold" style={{ color }}>
                        {score >= 0 ? "+" : ""}
                        {score.toFixed(3)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Inner content (needs Suspense boundary for useSearchParams)
// ---------------------------------------------------------------------------

function StockReportInner({ standalone }: { standalone: boolean }) {
  const searchParams = useSearchParams();
  const [tickerInput, setTickerInput] = useState(DEFAULT_TICKERS);
  const [states, setStates] = useState<Map<string, TickerState>>(new Map());
  const [orderedTickers, setOrderedTickers] = useState<string[]>([]);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const [copied, setCopied] = useState(false);

  // Optional share key from URL
  const shareKey = searchParams.get("key") ?? undefined;

  // Pre-fill from ?tickers= on mount
  useEffect(() => {
    const urlTickers = searchParams.get("tickers");
    if (urlTickers) {
      setTickerInput(urlTickers.replace(/,/g, ", "));
    }
  }, [searchParams]);

  const parsedTickers = parseTickers(tickerInput);
  const tooMany = parsedTickers.length > MAX_TICKERS;
  const effectiveTickers = tooMany ? parsedTickers.slice(0, MAX_TICKERS) : parsedTickers;

  const isLoading = [...states.values()].some((s) => s.status === "loading");

  const analyze = useCallback(async () => {
    if (!effectiveTickers.length) return;

    // Mark all as loading immediately
    setStates(new Map(effectiveTickers.map((t) => [t, { status: "loading" }] as const)));
    setOrderedTickers(effectiveTickers);
    setHasAnalyzed(true);

    const tasks = effectiveTickers.map((ticker) => () => api.report.get(ticker, shareKey));
    const results = await runWithLimit(tasks, 2);

    const reportMap = new Map<string, TickerState>();
    results.forEach((res, i) => {
      const ticker = effectiveTickers[i];
      if (res.status === "fulfilled") {
        reportMap.set(ticker, { status: "success", report: res.value });
      } else {
        const err = res.reason as Error;
        reportMap.set(ticker, {
          status: "error",
          message: err?.message ?? "Analyse fehlgeschlagen",
        });
      }
    });

    // Sort successes by composite_score desc; errors at the end
    const sorted = [...effectiveTickers].sort((a, b) => {
      const sa = reportMap.get(a);
      const sb = reportMap.get(b);
      if (sa?.status === "success" && sb?.status === "success") {
        return sb.report.composite_score - sa.report.composite_score;
      }
      if (sa?.status === "success") return -1;
      if (sb?.status === "success") return 1;
      return 0;
    });

    setOrderedTickers(sorted);
    setStates(reportMap);
  }, [effectiveTickers, shareKey]);

  const buildShareUrl = () => {
    if (typeof window === "undefined") return "";
    const url = new URL(window.location.href);
    url.searchParams.set("tickers", effectiveTickers.join(","));
    if (shareKey) url.searchParams.set("key", shareKey);
    else url.searchParams.delete("key");
    return url.toString();
  };

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(buildShareUrl());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API unavailable — silently ignore
    }
  };

  const body = (
    <div className={standalone ? "max-w-4xl mx-auto px-4 py-6 space-y-5" : "space-y-5"}>
      {/* Top disclaimer — always visible, not dismissable */}
      <DisclaimerBanner />

      {/* Input card */}
      <GlassCard>
        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <label className="block text-xs font-semibold tracking-wider text-slate-500">
                TICKER-SYMBOLE — kommagetrennt, max. {MAX_TICKERS} Stück
              </label>
              {!standalone && (
                <button
                  onClick={handleShare}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex-shrink-0"
                  style={{
                    background: "rgba(0,255,136,0.1)",
                    border: "1px solid rgba(0,255,136,0.3)",
                    color: "#00FF88",
                  }}
                >
                  <Share2 className="w-3 h-3" />
                  {copied ? "Kopiert!" : "Link teilen"}
                </button>
              )}
            </div>
            <textarea
              value={tickerInput}
              onChange={(e) => setTickerInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void analyze();
              }}
              rows={3}
              placeholder="AAPL, MSFT, NVDA, TSLA, AMZN…"
              className="w-full rounded-xl px-4 py-3 text-sm font-mono text-slate-200 placeholder-slate-600 outline-none resize-none"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            />
          </div>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-xs text-slate-500 space-y-0.5">
              {effectiveTickers.length > 0 && (
                <p>
                  Erkannte Ticker:{" "}
                  <span className="font-mono text-slate-300">
                    {effectiveTickers.join(", ")}
                  </span>
                </p>
              )}
              {tooMany && (
                <p className="text-amber-400">
                  Mehr als {MAX_TICKERS} Ticker erkannt — nur die ersten {MAX_TICKERS} werden analysiert.
                </p>
              )}
              <p className="text-slate-600">Tipp: Ctrl+Enter startet die Analyse</p>
            </div>
            <button
              onClick={() => void analyze()}
              disabled={!effectiveTickers.length || isLoading}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-40"
              style={{
                background: "linear-gradient(135deg, rgba(0,255,136,0.2), rgba(0,212,255,0.1))",
                border: "1px solid rgba(0,255,136,0.4)",
                color: "#00FF88",
              }}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <LineChart className="w-4 h-4" />
              )}
              {isLoading ? "Analysiere…" : "Analysieren"}
            </button>
          </div>
        </div>
      </GlassCard>

      {/* Results */}
      {hasAnalyzed && orderedTickers.length > 0 && (
        <div className="space-y-4">
          <SectionLabel>Analyseergebnisse — sortiert nach Composite Score</SectionLabel>
          {orderedTickers.map((ticker) => (
            <ReportCard
              key={ticker}
              ticker={ticker}
              state={states.get(ticker) ?? { status: "idle" }}
            />
          ))}
        </div>
      )}

      {/* Footer disclaimer — always visible */}
      <DisclaimerBanner />
      {standalone && (
        <p className="text-center text-xs text-slate-700 pb-6">
          Neural Trading OS · KI-Analysen vollautomatisch erstellt · Keine Haftung für
          Handelsentscheidungen
        </p>
      )}
    </div>
  );

  if (!standalone) return body;

  return (
    <div
      className="min-h-screen"
      style={{ background: "linear-gradient(135deg, #080B14 0%, #0D1117 100%)" }}
    >
      {/* Minimal public header */}
      <div
        className="sticky top-0 z-10 flex items-center justify-between px-6 py-4"
        style={{
          borderBottom: "1px solid rgba(0,212,255,0.1)",
          background: "rgba(8,11,20,0.9)",
          backdropFilter: "blur(20px)",
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, rgba(0,255,136,0.2), rgba(0,212,255,0.15))",
              border: "1px solid rgba(0,255,136,0.3)",
            }}
          >
            <LineChart className="w-3.5 h-3.5" style={{ color: "#00FF88" }} />
          </div>
          <div>
            <p className="text-sm font-bold text-white leading-none">Aktienanalyse</p>
            <p className="text-xs leading-none mt-0.5" style={{ color: "rgba(0,255,136,0.7)" }}>
              Neural Trading OS
            </p>
          </div>
        </div>
        <button
          onClick={handleShare}
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all"
          style={{
            background: "rgba(0,255,136,0.1)",
            border: "1px solid rgba(0,255,136,0.3)",
            color: "#00FF88",
          }}
        >
          <Share2 className="w-3.5 h-3.5" />
          {copied ? "Kopiert!" : "Link teilen"}
        </button>
      </div>

      {body}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public export — Suspense boundary required for useSearchParams in App Router
// ---------------------------------------------------------------------------

export function StockReport({ standalone = false }: { standalone?: boolean }) {
  return (
    <Suspense
      fallback={
        standalone ? (
          <div
            className="min-h-screen flex items-center justify-center"
            style={{ background: "#080B14" }}
          >
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: "#00FF88" }} />
          </div>
        ) : (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: "#00FF88" }} />
          </div>
        )
      }
    >
      <StockReportInner standalone={standalone} />
    </Suspense>
  );
}
