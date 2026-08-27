"use client";

/**
 * HKCM panel — the newsletter's take on whatever symbol the chart is showing.
 *
 * HKCM ("Hopf-Klinkmüller Capital Management") mails a daily analysis per
 * instrument: a trade setup (entry / stop / partial exit), the support and
 * resistance levels they consider live, coloured target zones, and four prose
 * sections. The backend parses those mails (`/api/hkcm`); this renders the
 * newest analysis for the active symbol.
 *
 * Silent when HKCM never covered the symbol — a 404 from `forTicker` is the
 * normal case for most tickers, not an error worth showing.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  ChevronDown,
  FileUp,
  Loader2,
  ShieldCheck,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { api } from "@/lib/api";
import type { HkcmAnalysis, HkcmTargetZone } from "@/types";
import { GlassCard, SectionLabel } from "@/components/ui/GlassCard";
import { SkeletonBlock } from "@/components/ui/Skeleton";
import { notify } from "@/store/notificationStore";

const ZONE_COLORS: Record<string, string> = {
  gruen: "#3FB950",
  rot: "#E5534B",
  blau: "#4C8DF6",
};

function fmt(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `$${value.toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Days between `iso` and now, or null when unparseable. */
function ageInDays(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

function Parameter({
  label,
  value,
  note,
  color,
}: {
  label: string;
  value: string;
  note?: string;
  color?: string;
}) {
  return (
    <div
      className="rounded-lg px-3 py-2"
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
    >
      <p className="text-xs uppercase tracking-wider text-slate-500">{label}</p>
      <p className="text-base font-bold font-mono mt-0.5" style={{ color: color ?? "#E2E8F0" }}>
        {value}
      </p>
      {note && <p className="text-xs text-slate-600 mt-0.5">{note}</p>}
    </div>
  );
}

function LevelList({ label, levels, color }: { label: string; levels: number[]; color: string }) {
  if (levels.length === 0) return null;
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-slate-500 mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {levels.map((level) => (
          <span
            key={level}
            className="text-xs font-mono font-bold px-2 py-1 rounded"
            style={{ background: `${color}15`, border: `1px solid ${color}40`, color }}
          >
            {fmt(level)}
          </span>
        ))}
      </div>
    </div>
  );
}

function ZoneBar({ zone }: { zone: HkcmTargetZone }) {
  const color = ZONE_COLORS[zone.color] ?? "#94a3b8";
  return (
    <div className="flex items-center gap-2">
      <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: color }} />
      <span className="text-xs text-slate-400 flex-1 min-w-0 truncate">{zone.label}</span>
      <span className="text-xs font-mono font-bold text-slate-300 whitespace-nowrap">
        {fmt(zone.low)} – {fmt(zone.high)}
      </span>
    </div>
  );
}

function Prose({ title, text }: { title: string; text: string }) {
  if (!text.trim()) return null;
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-slate-500 mb-1">{title}</p>
      {text.split("\n").map((paragraph, i) => (
        <p key={i} className="text-sm text-slate-400 leading-relaxed mb-1.5 last:mb-0">
          {paragraph}
        </p>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Import control                                                      */
/* ------------------------------------------------------------------ */

function ImportButton({ onDone }: { onDone: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    let imported = 0;
    let skipped = 0;
    const failed: string[] = [];
    // Sequential on purpose: the import is idempotent per mail, and a serial
    // loop keeps the failure message tied to the file that caused it.
    for (const file of Array.from(files)) {
      try {
        const result = await api.hkcm.importMail(file);
        if (result.imported) imported += 1;
        else skipped += 1;
      } catch (e) {
        failed.push(`${file.name}: ${e instanceof Error ? e.message : "Fehler"}`);
      }
    }
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";

    if (imported > 0) {
      notify.success(
        `${imported} HKCM-Ausgabe${imported === 1 ? "" : "n"} importiert`,
        skipped > 0 ? `${skipped} bereits vorhanden` : undefined
      );
      onDone();
    } else if (failed.length === 0) {
      notify.info("Nichts Neues", "Alle Mails waren bereits importiert.");
    }
    if (failed.length > 0) {
      notify.error(`${failed.length} Mail(s) nicht importiert`, failed.slice(0, 3).join(" · "));
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".eml,.html,.htm,message/rfc822,text/html"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
        style={{ background: "rgba(76,141,246,0.12)", border: "1px solid rgba(76,141,246,0.35)", color: "#4C8DF6" }}
        title="HKCM-Mails als .eml oder .html importieren"
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileUp className="w-3.5 h-3.5" />}
        Mails importieren
      </button>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */

export function HkcmPanel({ symbol }: { symbol: string }) {
  const [analysis, setAnalysis] = useState<HkcmAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [covered, setCovered] = useState<string[] | null>(null);
  const [expanded, setExpanded] = useState(false);

  const loadCovered = useCallback(async () => {
    try {
      setCovered(await api.hkcm.tickers());
    } catch {
      // Endpoint not deployed / not reachable — treat as "nothing imported".
      setCovered([]);
    }
  }, []);

  useEffect(() => {
    loadCovered();
  }, [loadCovered]);

  const load = useCallback(async (ticker: string) => {
    if (!ticker) {
      setAnalysis(null);
      return;
    }
    setLoading(true);
    try {
      setAnalysis(await api.hkcm.forTicker(ticker));
    } catch {
      // 404 is the normal answer for a symbol HKCM never covered.
      setAnalysis(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(symbol);
  }, [symbol, load]);

  const handleImported = useCallback(() => {
    loadCovered();
    load(symbol);
  }, [loadCovered, load, symbol]);

  // Nothing imported at all → offer the import instead of an empty card.
  if (covered !== null && covered.length === 0) {
    return (
      <GlassCard padding="p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <SectionLabel>HKCM-Analyse</SectionLabel>
            <p className="text-xs text-slate-500 mt-1">
              Noch keine HKCM-Ausgabe importiert. Mails als <code>.eml</code> oder <code>.html</code> aus
              Outlook exportieren und hier einlesen.
            </p>
          </div>
          <ImportButton onDone={handleImported} />
        </div>
      </GlassCard>
    );
  }

  if (loading && !analysis) {
    return <SkeletonBlock height={180} rounded="rounded-xl" />;
  }

  if (!analysis) {
    return (
      <GlassCard padding="p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <SectionLabel>HKCM-Analyse</SectionLabel>
            <p className="text-xs text-slate-500 mt-1">
              {symbol
                ? `HKCM hat ${symbol} bisher nicht besprochen.`
                : "Kein Symbol gewählt."}
              {covered && covered.length > 0 && (
                <> Vorhanden: <span className="font-mono text-slate-400">{covered.slice(0, 8).join(", ")}</span>
                {covered.length > 8 && ` +${covered.length - 8}`}</>
              )}
            </p>
          </div>
          <ImportButton onDone={handleImported} />
        </div>
      </GlassCard>
    );
  }

  const age = ageInDays(analysis.sent_at);
  const stale = age !== null && age > 14;
  const long = analysis.entry_kind.toLowerCase() === "long";

  return (
    <GlassCard padding="p-0">
      {/* Header */}
      <div
        className="flex items-start justify-between gap-3 px-4 py-3 flex-wrap"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <SectionLabel>HKCM-Analyse</SectionLabel>
            <span className="text-sm font-bold font-mono text-slate-200">{analysis.ticker}</span>
            {analysis.name && <span className="text-xs text-slate-500">{analysis.name}</span>}
            {analysis.category && (
              <span
                className="text-xs font-bold px-2 py-0.5 rounded-full"
                style={{ background: "rgba(163,113,247,0.14)", border: "1px solid rgba(163,113,247,0.4)", color: "#B794FF" }}
              >
                {analysis.category}
              </span>
            )}
          </div>
          {analysis.headline && (
            <p className="text-sm text-slate-300 font-medium mt-1">{analysis.headline}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {analysis.sent_at && (
            <span
              className="flex items-center gap-1 text-xs font-mono px-2 py-1 rounded"
              style={{
                background: stale ? "rgba(245,158,11,0.12)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${stale ? "rgba(245,158,11,0.4)" : "rgba(255,255,255,0.08)"}`,
                color: stale ? "#F59E0B" : "#64748B",
              }}
              title={
                stale
                  ? `Diese Analyse ist ${age} Tage alt — die Handelsparameter können überholt sein.`
                  : undefined
              }
            >
              {stale ? <AlertTriangle className="w-3 h-3" /> : <CalendarClock className="w-3 h-3" />}
              {fmtDate(analysis.sent_at)}
            </span>
          )}
          <ImportButton onDone={handleImported} />
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Trade parameters */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Target className="w-3.5 h-3.5" style={{ color: "#4C8DF6" }} />
            <p className="text-xs uppercase tracking-wider text-slate-500">
              {analysis.entry_potential ? "Potenzielle Handelsparameter" : "Handelsparameter"}
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Parameter
              label={`${analysis.entry_kind || "Einstieg"}-Einstieg`}
              value={fmt(analysis.entry)}
              color={long ? "#3FB950" : "#4C8DF6"}
            />
            <Parameter
              label="Stopp"
              value={analysis.stop !== null ? fmt(analysis.stop) : "—"}
              note={analysis.stop === null ? analysis.stop_note : undefined}
              color="#E5534B"
            />
            <Parameter label="Teil-Ausstieg" value={fmt(analysis.partial_exit)} />
            <Parameter
              label="Risiko"
              value={analysis.risk_note ? analysis.risk_note.split(" ")[0] : "—"}
              note={analysis.risk_note ? "pro Trade" : undefined}
            />
          </div>
        </div>

        {/* Levels + zones */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <LevelList label="Unterstützungen" levels={analysis.supports} color="#3FB950" />
            <LevelList label="Widerstände" levels={analysis.resistances} color="#E5534B" />
          </div>
          {analysis.target_zones.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wider text-slate-500 mb-1.5">Zielzonen</p>
              <div className="space-y-1.5">
                {analysis.target_zones.map((zone, i) => (
                  <ZoneBar key={`${zone.color}-${zone.low}-${zone.high}-${i}`} zone={zone} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Scenario probability */}
        {analysis.alternative_probability !== null && (
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)" }}
          >
            {long ? (
              <TrendingUp className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#F59E0B" }} />
            ) : (
              <TrendingDown className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#F59E0B" }} />
            )}
            <span className="text-xs text-slate-400">
              Alternativszenario mit{" "}
              <span className="font-bold font-mono" style={{ color: "#F59E0B" }}>
                {analysis.alternative_probability}%
              </span>{" "}
              Wahrscheinlichkeit
            </span>
          </div>
        )}

        {/* Prose — collapsed by default, it is a lot of text */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex items-center gap-1.5 text-xs font-semibold transition-colors"
          style={{ color: "#4C8DF6" }}
        >
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
          />
          {expanded ? "Begründung ausblenden" : "Begründung anzeigen"}
        </button>

        {expanded && (
          <div className="space-y-3 pt-1">
            <Prose title="Was ist passiert?" text={analysis.what_happened} />
            <Prose title="Primärszenario" text={analysis.primary_scenario} />
            <Prose title="Alternativszenario" text={analysis.alternative_scenario} />
            <Prose title="Übergeordneter Ausblick" text={analysis.outlook} />
            <Prose title="Handelsmöglichkeiten" text={analysis.opportunities} />

            {analysis.chart_urls.length > 0 && (
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-500 mb-1.5">HKCM-Charts</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {analysis.chart_urls.map((url) => (
                    // Remote newsletter images: plain <img> rather than
                    // next/image, since the host is not in the image config and
                    // these URLs can expire.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={url}
                      src={url}
                      alt={`HKCM-Chart ${analysis.ticker}`}
                      loading="lazy"
                      className="w-full rounded-lg"
                      style={{ border: "1px solid rgba(255,255,255,0.08)" }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* HKCM's own disclaimer, condensed — these are not recommendations. */}
        <p className="flex items-start gap-1.5 text-xs text-slate-600 leading-relaxed pt-1">
          <ShieldCheck className="w-3 h-3 mt-0.5 flex-shrink-0" />
          Fremdanalyse von Hopf-Klinkmüller Capital Management. Keine Anlageberatung und keine
          Aufforderung zum Kauf oder Verkauf.
        </p>
      </div>
    </GlassCard>
  );
}
