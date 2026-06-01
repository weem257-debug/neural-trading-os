import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TrendingUp, TrendingDown, Minus, ArrowRight, Zap, ExternalLink, Clock } from "lucide-react";
import Link from "next/link";
import { ShareButtons } from "./ShareButtons";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ??
  process.env.BACKEND_URL ??
  "http://localhost:8000";

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://neuraltrading.io";

type SignalDirection = "BUY" | "STRONG_BUY" | "SELL" | "STRONG_SELL" | "HOLD";

interface TradingSignal {
  id: string;
  ticker: string;
  direction: SignalDirection;
  confidence: number;
  reasoning: string;
  source: string;
  generated_at: string;
  price_target: number | null;
  stop_loss: number | null;
  time_horizon: string | null;
  agents_consensus?: Record<string, string>;
}

const DIR_CONFIG: Record<SignalDirection, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  BUY:         { label: "KAUFEN",       color: "#22c55e", bg: "rgba(34,197,94,0.12)",  icon: <TrendingUp className="w-5 h-5" /> },
  STRONG_BUY:  { label: "STARK KAUFEN", color: "#00ff88", bg: "rgba(0,255,136,0.12)",  icon: <TrendingUp className="w-5 h-5" /> },
  SELL:        { label: "VERKAUFEN",    color: "#ef4444", bg: "rgba(239,68,68,0.12)",  icon: <TrendingDown className="w-5 h-5" /> },
  STRONG_SELL: { label: "STARK VERK.",  color: "#ff2222", bg: "rgba(255,34,34,0.12)",  icon: <TrendingDown className="w-5 h-5" /> },
  HOLD:        { label: "HALTEN",       color: "#f59e0b", bg: "rgba(245,158,11,0.12)", icon: <Minus className="w-5 h-5" /> },
};

const VOTE_DE: Record<string, string> = {
  STRONG_BUY: "STARK KAUFEN", BUY: "KAUFEN", HOLD: "HALTEN",
  SELL: "VERKAUFEN", STRONG_SELL: "STARK VERK.",
};

async function fetchSignal(id: string): Promise<TradingSignal | null> {
  try {
    const res = await fetch(`${API_BASE}/api/signals/by-id/${encodeURIComponent(id)}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data && data.id ? (data as TradingSignal) : null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const signal = await fetchSignal(params.id);
  if (!signal) {
    return {
      title: "Signal nicht gefunden | Neural Trading OS",
      description: "Dieses KI-Handelssignal ist nicht verfügbar oder abgelaufen.",
      robots: { index: false, follow: true },
    };
  }
  const dir = (signal.direction as SignalDirection) in DIR_CONFIG
    ? (signal.direction as SignalDirection)
    : "HOLD";
  const label = DIR_CONFIG[dir].label;
  const confPct = Math.round(signal.confidence * 100);
  const title = `${signal.ticker}: ${label} — ${confPct}% KI-Konfidenz`;
  const description = signal.reasoning
    ? signal.reasoning.slice(0, 155) + (signal.reasoning.length > 155 ? "…" : "")
    : `KI-generiertes Handelssignal für ${signal.ticker}: ${label} bei ${confPct}% Konfidenz. 3 kostenlose Signale täglich.`;
  const url = `${APP_URL}/signals/view/${signal.id}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      url,
      siteName: "Neural Trading OS",
      title: `${title} | Neural Trading OS`,
      description,
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | Neural Trading OS`,
      description,
    },
  };
}

export default async function SignalViewPage({ params }: { params: { id: string } }) {
  const signal = await fetchSignal(params.id);

  if (!signal) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-4" style={{ background: "#080b14", color: "#e2e8f0" }}>
        <p className="text-slate-500 text-sm">Signal nicht gefunden oder abgelaufen.</p>
        <Link href="/register" className="text-cyan-400 hover:text-cyan-300 text-sm flex items-center gap-1">
          Eigenes Signal generieren <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    );
  }

  const dir = (signal.direction as SignalDirection) in DIR_CONFIG
    ? (signal.direction as SignalDirection)
    : "HOLD";
  const cfg = DIR_CONFIG[dir];
  const confPct = Math.round(signal.confidence * 100);
  const date = new Date(signal.generated_at).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: `KI-Signal ${signal.ticker}: ${cfg.label} (${confPct}% Konfidenz)`,
    description: signal.reasoning || `KI-generiertes Handelssignal für ${signal.ticker}: ${cfg.label} bei ${confPct}% Konfidenz.`,
    datePublished: signal.generated_at,
    author: { "@type": "Organization", name: "Neural Trading OS" },
    publisher: {
      "@type": "Organization",
      name: "Neural Trading OS",
      ...(appUrl ? { url: appUrl } : {}),
    },
    ...(appUrl ? { mainEntityOfPage: `${appUrl}/signals/view/${signal.id}` } : {}),
    about: { "@type": "Thing", name: signal.ticker },
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#080b14", color: "#e2e8f0" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      {/* Header */}
      <div className="border-b border-white/5 px-4 py-3 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <Zap className="w-5 h-5" style={{ color: "#00D4FF" }} />
          <span className="text-sm font-semibold" style={{ color: "#00D4FF" }}>Neural Trading OS</span>
        </Link>
        <span className="text-xs text-slate-500">KI-Signal · {date}</span>
      </div>

      {/* Signal Card */}
      <div className="flex-1 flex items-start justify-center px-4 py-12">
        <div
          className="w-full max-w-lg"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 24 }}
        >
          {/* Ticker + Direction */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">{signal.ticker}</h1>
              <p className="text-xs text-slate-500 mt-0.5">{signal.source}</p>
            </div>
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-lg font-bold text-sm"
              style={{ color: cfg.color, background: cfg.bg }}
            >
              {cfg.icon}
              {cfg.label}
            </div>
          </div>

          {/* Confidence */}
          <div className="mb-5">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-slate-500">KI-Konfidenz</span>
              <span className="text-sm font-semibold" style={{ color: confPct >= 75 ? "#22c55e" : confPct >= 55 ? "#f59e0b" : "#ef4444" }}>
                {confPct}%
              </span>
            </div>
            <div className="h-2 rounded-full bg-white/5">
              <div
                className="h-2 rounded-full transition-all"
                style={{ width: `${confPct}%`, background: cfg.color }}
              />
            </div>
          </div>

          {/* Price Targets */}
          {(signal.price_target || signal.stop_loss || signal.time_horizon) && (
            <div className="grid grid-cols-2 gap-3 mb-5">
              {signal.price_target && (
                <div className="rounded-lg p-3" style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.15)" }}>
                  <p className="text-xs text-slate-500 mb-1">Kursziel</p>
                  <p className="font-bold" style={{ color: "#22c55e" }}>${signal.price_target}</p>
                </div>
              )}
              {signal.stop_loss && (
                <div className="rounded-lg p-3" style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)" }}>
                  <p className="text-xs text-slate-500 mb-1">Stop-Loss</p>
                  <p className="font-bold" style={{ color: "#ef4444" }}>${signal.stop_loss}</p>
                </div>
              )}
              {signal.time_horizon && (
                <div className="rounded-lg p-3 col-span-2" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
                    <Clock className="w-3 h-3" />
                    <span>Zeithorizont</span>
                  </div>
                  <p className="font-bold text-slate-300">{signal.time_horizon}</p>
                </div>
              )}
            </div>
          )}

          {/* Reasoning */}
          {signal.reasoning && (
            <div className="mb-6 p-3 rounded-lg" style={{ background: "rgba(0,212,255,0.04)", border: "1px solid rgba(0,212,255,0.1)" }}>
              <p className="text-xs text-slate-500 mb-1.5">KI-Begründung</p>
              <p className="text-sm text-slate-300 leading-relaxed">{signal.reasoning}</p>
            </div>
          )}

          {/* Agents Consensus */}
          {signal.agents_consensus && Object.keys(signal.agents_consensus).length > 0 && (
            <div className="mb-5">
              <p className="text-xs text-slate-500 mb-2">Agenten-Konsens</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(signal.agents_consensus).map(([agent, vote]) => {
                  const isPos = vote.includes("BUY");
                  const isNeg = vote.includes("SELL");
                  const dotColor = isPos ? "#00FF88" : isNeg ? "#FF0080" : "#FFD700";
                  return (
                    <span key={agent} className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: dotColor }} />
                      <span className="text-slate-400">{agent}</span>
                      <span className="font-medium text-slate-300">{VOTE_DE[vote] ?? vote.replace(/_/g, " ")}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Share buttons (client island) */}
          <ShareButtons ticker={signal.ticker} dirLabel={cfg.label} confPct={confPct} />

          {/* WpHG Disclaimer */}
          <p className="text-xs text-slate-600 mb-5">
            Kein Anlageberatung. Alle Signale dienen ausschließlich Informationszwecken (§ 85 WpHG).
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href={`${appUrl}/register`}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-semibold text-sm transition-all hover:opacity-90"
              style={{ background: "#00D4FF", color: "#080b14" }}
            >
              <Zap className="w-4 h-4" />
              Eigenes Signal generieren
            </Link>
            <Link
              href={`${appUrl}/signals/marketplace`}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-semibold text-sm transition-all"
              style={{ background: "rgba(255,255,255,0.06)", color: "#94a3b8", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <ExternalLink className="w-4 h-4" />
              Marktplatz ansehen
            </Link>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-white/5 px-4 py-4 text-center">
        <p className="text-xs text-slate-600">
          Generiert von{" "}
          <Link href={appUrl || "/"} className="hover:text-slate-400" style={{ color: "#00D4FF" }}>
            Neural Trading OS
          </Link>
          {" · "}
          <Link href={`${appUrl}/datenschutz`} className="hover:text-slate-400 text-slate-600">Datenschutz</Link>
        </p>
      </div>
    </div>
  );
}
