"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain,
  Youtube,
  TrendingUp,
  RefreshCw,
  Play,
  CheckCircle,
  Clock,
  XCircle,
  Loader2,
  Plus,
  ChevronDown,
  ChevronUp,
  BarChart2,
  Lightbulb,
  Target,
  Search,
  BookOpen,
} from "lucide-react";
import { api } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LearningStats {
  youtube_insights_total: number;
  trade_learnings_total: number;
  learning_jobs_total: number;
  top_performing_patterns: Array<{
    ticker: string;
    direction: string;
    win_rate: number;
    sample_count: number;
    avg_return_pct: number;
  }>;
}

interface YoutubeInsight {
  id: number;
  video_id: string;
  video_title: string;
  channel: string;
  insight_text: string;
  strategy: string;
  timeframe: string;
  market_condition: string;
  asset_class: string;
  confidence_score: number;
  times_validated: number;
  youtube_url: string;
  created_at: string;
}

interface TradeLearning {
  id: number;
  ticker: string;
  direction: string;
  learning_text: string;
  win_rate: number | null;
  sample_count: number;
  avg_return_pct: number | null;
  last_updated: string;
}

interface LearningJob {
  id: number;
  job_type: string;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  items_processed: number;
  error: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, string> = {
  pending: "#FFD700",
  running: "#00D4FF",
  done: "#00FF88",
  failed: "#FF6B6B",
};

const STATUS_ICONS: Record<string, React.ElementType> = {
  pending: Clock,
  running: Loader2,
  done: CheckCircle,
  failed: XCircle,
};

function pct(n: number | null) {
  return n !== null ? `${(n * 100).toFixed(1)} %` : "–";
}

// ---------------------------------------------------------------------------
// StatCard
// ---------------------------------------------------------------------------

function StatCard({ label, value, color, icon: Icon }: { label: string; value: string | number; color: string; icon: React.ElementType }) {
  return (
    <div
      className="rounded-xl border p-4 flex items-center gap-3"
      style={{ borderColor: color + "30", background: color + "08" }}
    >
      <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: color + "20" }}>
        <Icon className="w-5 h-5" style={{ color }} />
      </div>
      <div>
        <p className="text-xl font-bold text-white">{value}</p>
        <p className="text-xs text-slate-500">{label}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// YouTubeInsightCard
// ---------------------------------------------------------------------------

function YoutubeInsightCard({ insight }: { insight: YoutubeInsight }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-4"
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-red-500/20 flex items-center justify-center flex-shrink-0">
          <Youtube className="w-4 h-4 text-red-400" />
        </div>
        <div className="flex-1 min-w-0">
          <a
            href={insight.youtube_url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-white text-sm hover:text-cyan-400 transition-colors line-clamp-1"
          >
            {insight.video_title}
          </a>
          <p className="text-xs text-slate-500 mt-0.5">{insight.channel}</p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {insight.strategy && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                {insight.strategy}
              </span>
            )}
            {insight.timeframe && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-400">
                {insight.timeframe}
              </span>
            )}
            {insight.market_condition && insight.market_condition !== "any" && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-400">
                {insight.market_condition}
              </span>
            )}
            <span
              className="text-xs px-2 py-0.5 rounded-full ml-auto"
              style={{
                background: `rgba(0,212,255,${insight.confidence_score * 0.2})`,
                color: insight.confidence_score >= 0.7 ? "#00D4FF" : "#64748b",
              }}
            >
              {(insight.confidence_score * 100).toFixed(0)}% Konfidenz
            </span>
          </div>
        </div>
      </div>

      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 mt-3 transition-colors"
      >
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {expanded ? "Weniger" : "Mehr lesen"}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="text-xs text-slate-400 mt-2 leading-relaxed"
          >
            {insight.insight_text}
          </motion.p>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// TradeLearningCard
// ---------------------------------------------------------------------------

function TradeLearningCard({ learning }: { learning: TradeLearning }) {
  const winColor = learning.win_rate !== null
    ? learning.win_rate >= 0.6 ? "#00FF88" : learning.win_rate >= 0.4 ? "#FFD700" : "#FF6B6B"
    : "#64748b";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-4"
    >
      <div className="flex items-center gap-3 mb-2">
        <div
          className="px-2 py-0.5 rounded font-mono text-xs font-bold"
          style={{ background: winColor + "15", color: winColor, border: `1px solid ${winColor}30` }}
        >
          {learning.ticker}
        </div>
        <span
          className="text-xs font-semibold"
          style={{ color: learning.direction.includes("BUY") ? "#00FF88" : learning.direction.includes("SELL") ? "#FF6B6B" : "#FFD700" }}
        >
          {learning.direction}
        </span>
        <div className="ml-auto flex items-center gap-3 text-xs">
          {learning.win_rate !== null && (
            <span style={{ color: winColor }}>
              {pct(learning.win_rate)} Treffer
            </span>
          )}
          <span className="text-slate-600">n={learning.sample_count}</span>
          {learning.avg_return_pct !== null && (
            <span style={{ color: learning.avg_return_pct >= 0 ? "#00FF88" : "#FF6B6B" }}>
              {learning.avg_return_pct >= 0 ? "+" : ""}{learning.avg_return_pct.toFixed(2)}%
            </span>
          )}
        </div>
      </div>
      <p className="text-xs text-slate-400 leading-relaxed">{learning.learning_text}</p>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// AddVideoPanel
// ---------------------------------------------------------------------------

function AddVideoPanel({ onAdded }: { onAdded: () => void }) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    setMsg("");
    try {
      const data = await api.learning.processYoutube(url.trim());
      setMsg(`Job ${data.job_id} gestartet — Video wird analysiert...`);
      setUrl("");
      setTimeout(onAdded, 3000);
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "Fehler");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="YouTube URL oder Video-ID eingeben..."
        className="flex-1 bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/50"
      />
      <button
        type="submit"
        disabled={loading || !url.trim()}
        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-black disabled:opacity-50 transition-all"
        style={{ background: "linear-gradient(135deg, #00D4FF, #7B2FFF)" }}
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
        Analysieren
      </button>
      {msg && <p className="text-xs text-cyan-400 mt-1 absolute">{msg}</p>}
    </form>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type Tab = "overview" | "youtube" | "trades" | "jobs" | "kontext";

export default function LearningPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<LearningStats | null>(null);
  const [insights, setInsights] = useState<YoutubeInsight[]>([]);
  const [learnings, setLearnings] = useState<TradeLearning[]>([]);
  const [jobs, setJobs] = useState<LearningJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [s, yi, tl, j] = await Promise.allSettled([
        api.learning.stats(),
        api.learning.youtubeInsights(20),
        api.learning.tradeLearnings(30),
        api.learning.jobs(15),
      ]);
      if (s.status === "fulfilled") setStats(s.value);
      if (yi.status === "fulfilled") setInsights(yi.value);
      if (tl.status === "fulfilled") setLearnings(tl.value);
      if (j.status === "fulfilled") setJobs(j.value);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const triggerJob = async (jobType: string) => {
    setTriggering(jobType);
    try {
      await api.learning.triggerJob(jobType);
      setTimeout(loadAll, 2000);
    } finally {
      setTriggering(null);
    }
  };

  const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: "overview", label: "Übersicht", icon: Brain },
    { key: "youtube", label: "YouTube Insights", icon: Youtube },
    { key: "trades", label: "Trade-Lernkurve", icon: BarChart2 },
    { key: "jobs", label: "Jobs", icon: Clock },
    { key: "kontext", label: "KI-Kontext", icon: BookOpen },
  ];

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Brain className="w-6 h-6 text-neon-purple" />
            Selbstlernender Trading-AI
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Lernt aus YouTube-Videos und echten Trades — verbessert sich kontinuierlich
          </p>
        </div>
        <button
          onClick={loadAll}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-700 text-xs text-slate-400 hover:text-cyan-400 hover:border-cyan-500/40 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Aktualisieren
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-slate-900/50 rounded-xl p-1 border border-slate-800/60">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all flex-1 justify-center"
            style={
              tab === key
                ? { background: "rgba(123,47,255,0.2)", color: "#7B2FFF", border: "1px solid rgba(123,47,255,0.3)" }
                : { color: "#64748b" }
            }
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {loading && tab === "overview" ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 text-neon-purple animate-spin" />
        </div>
      ) : (
        <>
          {/* OVERVIEW TAB */}
          {tab === "overview" && (
            <div className="space-y-6">
              {/* Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <StatCard label="YouTube Insights" value={stats?.youtube_insights_total ?? 0} color="#FF4444" icon={Youtube} />
                <StatCard label="Trade-Learnings" value={stats?.trade_learnings_total ?? 0} color="#00FF88" icon={TrendingUp} />
                <StatCard label="Lern-Jobs" value={stats?.learning_jobs_total ?? 0} color="#7B2FFF" icon={Brain} />
              </div>

              {/* How it works */}
              <div className="rounded-2xl border border-neon-purple/20 p-5" style={{ background: "linear-gradient(135deg, rgba(123,47,255,0.05), transparent)" }}>
                <h2 className="font-bold text-white text-sm mb-4 flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 text-neon-purple" /> Wie der Lernprozess funktioniert
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-slate-400">
                  <div className="space-y-1.5">
                    <p className="font-semibold text-white flex items-center gap-1.5"><Youtube className="w-3.5 h-3.5 text-red-400" /> 1. YouTube-Analyse</p>
                    <p>Täglich um 02:00 UTC werden Trading-Videos analysiert. Claude Haiku extrahiert Strategien, Muster und Marktbedingungen aus den Transkripten.</p>
                  </div>
                  <div className="space-y-1.5">
                    <p className="font-semibold text-white flex items-center gap-1.5"><BarChart2 className="w-3.5 h-3.5 text-green-400" /> 2. Trade-Review</p>
                    <p>Jeden Sonntag werden alle ausgeführten Trades analysiert. Muster wie "BUY NVDA mit 80%+ Confidence hatte 73% Win-Rate" werden gelernt.</p>
                  </div>
                  <div className="space-y-1.5">
                    <p className="font-semibold text-white flex items-center gap-1.5"><Target className="w-3.5 h-3.5 text-cyan-400" /> 3. Signal-Verbesserung</p>
                    <p>Bei jeder neuen Signal-Generierung wird der relevante Kontext aus der Wissensdatenbank via BM25-Suche abgerufen und in den Claude-Prompt injiziert.</p>
                  </div>
                </div>
              </div>

              {/* Top patterns */}
              {stats && stats.top_performing_patterns.length > 0 && (
                <div>
                  <h2 className="font-bold text-white text-sm mb-3 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-neon-green" /> Top-Muster (Win-Rate ≥ 60%, n ≥ 5)
                  </h2>
                  <div className="space-y-2">
                    {stats.top_performing_patterns.map((p, i) => (
                      <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-800/60 bg-slate-900/30 text-xs">
                        <span className="font-mono font-bold text-white">{p.ticker}</span>
                        <span style={{ color: p.direction.includes("BUY") ? "#00FF88" : "#FF6B6B" }}>{{ STRONG_BUY: "S.Kauf", BUY: "Kauf", HOLD: "Halt", SELL: "Verk.", STRONG_SELL: "S.Verk." }[p.direction] ?? p.direction}</span>
                        <span className="text-neon-green">{(p.win_rate * 100).toFixed(0)}% Treffer</span>
                        <span className="text-slate-500">n={p.sample_count}</span>
                        <span style={{ color: p.avg_return_pct >= 0 ? "#00FF88" : "#FF6B6B" }} className="ml-auto">
                          Ø {p.avg_return_pct >= 0 ? "+" : ""}{p.avg_return_pct.toFixed(2)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Quick actions */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => triggerJob("youtube_batch")}
                  disabled={triggering === "youtube_batch"}
                  className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-red-500/30 bg-red-500/5 text-red-400 text-sm hover:bg-red-500/10 transition-colors disabled:opacity-50"
                >
                  {triggering === "youtube_batch" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  YouTube-Batch jetzt starten
                </button>
                <button
                  onClick={() => triggerJob("trade_review")}
                  disabled={triggering === "trade_review"}
                  className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-green-500/30 bg-green-500/5 text-green-400 text-sm hover:bg-green-500/10 transition-colors disabled:opacity-50"
                >
                  {triggering === "trade_review" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  Trade-Review jetzt starten
                </button>
              </div>
            </div>
          )}

          {/* YOUTUBE TAB */}
          {tab === "youtube" && (
            <div className="space-y-4">
              <AddVideoPanel onAdded={loadAll} />
              {insights.length === 0 ? (
                <div className="text-center py-16 text-slate-500">
                  <Youtube className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Noch keine Insights. Starte den YouTube-Batch oder füge ein Video hinzu.</p>
                </div>
              ) : (
                insights.map((yi) => <YoutubeInsightCard key={yi.id} insight={yi} />)
              )}
            </div>
          )}

          {/* TRADES TAB */}
          {tab === "trades" && (
            <div className="space-y-3">
              {learnings.length === 0 ? (
                <div className="text-center py-16 text-slate-500">
                  <BarChart2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Noch keine Trade-Learnings. Führe einen Trade-Review durch sobald genug Signale bewertet wurden.</p>
                </div>
              ) : (
                learnings.map((tl) => <TradeLearningCard key={tl.id} learning={tl} />)
              )}
            </div>
          )}

          {/* JOBS TAB */}
          {tab === "jobs" && (
            <div className="space-y-2">
              {jobs.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-sm">Noch keine Jobs ausgeführt.</div>
              ) : (
                jobs.map((j) => {
                  const StatusIcon = STATUS_ICONS[j.status] ?? Clock;
                  const statusColor = STATUS_COLORS[j.status] ?? "#64748b";
                  return (
                    <div key={j.id} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-800/60 bg-slate-900/40 text-xs">
                      <StatusIcon
                        className="w-4 h-4 flex-shrink-0"
                        style={{ color: statusColor, animation: j.status === "running" ? "spin 1s linear infinite" : undefined }}
                      />
                      <span className="font-mono text-slate-400">#{j.id}</span>
                      <span className="font-medium text-white">{{ youtube_batch: "YouTube-Batch", youtube_single: "YouTube-Video", trade_review: "Trade-Auswertung" }[j.job_type] ?? j.job_type}</span>
                      <span style={{ color: statusColor }}>{{ pending: "Wartend", running: "Läuft", done: "Fertig", failed: "Fehler" }[j.status] ?? j.status}</span>
                      <span className="text-slate-600">{j.items_processed} Einträge</span>
                      <span className="ml-auto text-slate-600">
                        {new Date(j.created_at).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </span>
                      {j.error && <span className="text-red-400 truncate max-w-32">{j.error}</span>}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* KI-KONTEXT TAB */}
          {tab === "kontext" && <KiKontextTab />}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// KiKontextTab — RAG Context Preview
// ---------------------------------------------------------------------------

function KiKontextTab() {
  const [ticker, setTicker] = useState("AAPL");
  const [query, setQuery] = useState("Handelsstrategie und Signalgeneration");
  const [topN, setTopN] = useState(5);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ticker: string; query: string; context: string; has_context: boolean; context_length: number } | null>(null);
  const [error, setError] = useState("");

  const fetchContext = async () => {
    if (!ticker.trim()) return;
    setLoading(true);
    setError("");
    try {
      const data = await api.learning.context(ticker.trim().toUpperCase(), query.trim() || undefined, topN);
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kontext konnte nicht geladen werden");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-5">
        <h3 className="text-sm font-semibold text-white mb-1 flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-purple-400" />
          RAG-Kontext Vorschau
        </h3>
        <p className="text-xs text-slate-500 mb-4">
          Zeigt, welches Wissen die KI aus YouTube-Videos und Trade-Auswertungen für diesen Ticker gelernt hat und in die Signalgeneration einfließt.
        </p>
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div className="col-span-1">
            <label className="block text-xs text-slate-500 mb-1">Ticker</label>
            <input
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              placeholder="AAPL"
              maxLength={10}
              className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-purple-500/50 uppercase"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-xs text-slate-500 mb-1">Suchanfrage</label>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Handelsstrategie und Signalgeneration"
              className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-purple-500/50"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500">Top-N Treffer:</label>
            <select
              value={topN}
              onChange={(e) => setTopN(Number(e.target.value))}
              className="bg-slate-800/60 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white"
            >
              {[3, 5, 8, 10].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <button
            onClick={fetchContext}
            disabled={loading || !ticker.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold text-black transition-opacity disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #7B2FFF, #9B4FFF)" }}
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
            Kontext abrufen
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-red-500/30 bg-red-500/10 text-sm text-red-400">
          <XCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {result && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-purple-500/20 bg-slate-900/40 overflow-hidden"
        >
          <div className="px-5 py-3 border-b border-slate-800/60 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-purple-400" />
              <span className="text-sm font-semibold text-white">{result.ticker}</span>
              <span className="text-xs text-slate-500">— {result.query}</span>
            </div>
            <div className="flex items-center gap-3 text-xs">
              {result.has_context ? (
                <span className="text-purple-400">{result.context_length} Zeichen Kontext</span>
              ) : (
                <span className="text-slate-500">Kein Kontext gefunden</span>
              )}
            </div>
          </div>
          {result.has_context ? (
            <pre className="p-5 text-xs text-slate-300 whitespace-pre-wrap font-mono leading-relaxed overflow-x-auto max-h-96 overflow-y-auto"
              style={{ background: "rgba(0,0,0,0.3)" }}>
              {result.context}
            </pre>
          ) : (
            <div className="p-5 text-center text-slate-500 text-sm">
              <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-30" />
              Für <strong className="text-slate-400">{result.ticker}</strong> wurden noch keine Lernmuster gefunden.
              <p className="text-xs mt-1 text-slate-600">
                Verarbeite YouTube-Videos oder lass eine Trade-Auswertung laufen, um Wissen zu diesem Ticker aufzubauen.
              </p>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
