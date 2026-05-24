"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";
import type { SentimentSummary } from "@/types";
import {
  Newspaper, Loader2, TrendingUp, TrendingDown, Minus,
  AlertTriangle, CheckCircle, Clock,
} from "lucide-react";
import { GlassCard, SectionLabel, NeonBadge } from "@/components/ui/GlassCard";
import { ExplanationModal, InfoButton } from "@/components/ui/ExplanationModal";
import type { ExplanationContent } from "@/components/ui/ExplanationModal";

/* ---- Mock sentiment data ---- */
const MOCK_SENTIMENT: SentimentSummary[] = [
  {
    ticker: "AAPL",
    overall_sentiment: "positive",
    overall_score: 0.62,
    news_count: 18,
    positive_count: 12,
    negative_count: 3,
    neutral_count: 3,
    generated_at: new Date().toISOString(),
    news_items: [
      { id: "1", headline: "Apple Vision Pro sales exceed Q3 expectations by 40%", source: "Bloomberg", url: "", published_at: new Date().toISOString(), tickers: ["AAPL"], sentiment: "positive", sentiment_score: 0.82, summary: "" },
      { id: "2", headline: "iPhone 17 launch sees record pre-orders in emerging markets", source: "Reuters", url: "", published_at: new Date().toISOString(), tickers: ["AAPL"], sentiment: "positive", sentiment_score: 0.75, summary: "" },
      { id: "3", headline: "Apple faces antitrust scrutiny in EU over App Store policies", source: "FT", url: "", published_at: new Date().toISOString(), tickers: ["AAPL"], sentiment: "negative", sentiment_score: -0.45, summary: "" },
    ],
  },
  {
    ticker: "NVDA",
    overall_sentiment: "positive",
    overall_score: 0.88,
    news_count: 24,
    positive_count: 21,
    negative_count: 1,
    neutral_count: 2,
    generated_at: new Date().toISOString(),
    news_items: [
      { id: "4", headline: "NVIDIA Blackwell GPU demand far outstrips supply — analysts raise targets", source: "WSJ", url: "", published_at: new Date().toISOString(), tickers: ["NVDA"], sentiment: "positive", sentiment_score: 0.91, summary: "" },
      { id: "5", headline: "Jensen Huang signals AI infrastructure super-cycle through 2027", source: "CNBC", url: "", published_at: new Date().toISOString(), tickers: ["NVDA"], sentiment: "positive", sentiment_score: 0.85, summary: "" },
    ],
  },
];

/* ---- Sentiment score badge ---- */
function SentimentBadge({ score }: { score: number }) {
  if (score > 0.1) return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl" style={{ background: "rgba(0,255,136,0.12)", border: "1px solid rgba(0,255,136,0.3)" }}>
      <TrendingUp className="w-3.5 h-3.5" style={{ color: "#00FF88" }} />
      <span className="font-mono font-bold text-sm" style={{ color: "#00FF88" }}>+{(score * 100).toFixed(0)}</span>
    </div>
  );
  if (score < -0.1) return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl" style={{ background: "rgba(255,0,128,0.12)", border: "1px solid rgba(255,0,128,0.3)" }}>
      <TrendingDown className="w-3.5 h-3.5" style={{ color: "#FF0080" }} />
      <span className="font-mono font-bold text-sm" style={{ color: "#FF0080" }}>{(score * 100).toFixed(0)}</span>
    </div>
  );
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl" style={{ background: "rgba(100,116,139,0.12)", border: "1px solid rgba(100,116,139,0.3)" }}>
      <Minus className="w-3.5 h-3.5 text-slate-500" />
      <span className="font-mono font-bold text-sm text-slate-400">{(score * 100).toFixed(0)}</span>
    </div>
  );
}

/* ---- Sentiment heatmap tile ---- */
function HeatTile({ ticker, score }: { ticker: string; score: number }) {
  const intensity = Math.abs(score);
  const positive = score >= 0;
  const color = positive ? `rgba(0,255,136,${0.1 + intensity * 0.5})` : `rgba(255,0,128,${0.1 + intensity * 0.5})`;
  const borderColor = positive ? `rgba(0,255,136,${0.2 + intensity * 0.4})` : `rgba(255,0,128,${0.2 + intensity * 0.4})`;
  const textColor = positive ? "#00FF88" : "#FF0080";

  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      whileHover={{ scale: 1.05 }}
      className="aspect-square rounded-xl flex flex-col items-center justify-center cursor-pointer"
      style={{ background: color, border: `1px solid ${borderColor}` }}
    >
      <span className="text-xs font-bold text-slate-200">{ticker}</span>
      <span className="text-sm font-bold font-mono mt-0.5" style={{ color: textColor }}>
        {positive ? "+" : ""}{(score * 100).toFixed(0)}
      </span>
    </motion.div>
  );
}

/* ---- News item card ---- */
function NewsCard({ item, index }: { item: SentimentSummary["news_items"][0]; index: number }) {
  const positive = item.sentiment === "positive";
  const negative = item.sentiment === "negative";
  const color = positive ? "#00FF88" : negative ? "#FF0080" : "#64748B";
  const Icon = positive ? CheckCircle : negative ? AlertTriangle : Minus;

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.06 }}
      className="flex items-start gap-3 p-3 rounded-xl"
      style={{
        background: `${color}06`,
        border: `1px solid ${color}15`,
      }}
    >
      <Icon className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color }} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-300 leading-snug">{item.headline}</p>
        <div className="flex items-center gap-3 mt-1.5">
          <span className="text-xs text-slate-600">{item.source}</span>
          <span className="flex items-center gap-1 text-xs text-slate-600">
            <Clock className="w-3 h-3" />
            {new Date(item.published_at).toLocaleTimeString()}
          </span>
        </div>
      </div>
      <div
        className="flex-shrink-0 text-xs font-mono font-bold px-2 py-1 rounded-lg"
        style={{ background: `${color}15`, color, border: `1px solid ${color}30` }}
      >
        {item.sentiment_score > 0 ? "+" : ""}{(item.sentiment_score * 100).toFixed(0)}
      </div>
    </motion.div>
  );
}

/* ---- Stacked sentiment bar ---- */
function SentimentBar({ positive, negative, neutral, total }: {
  positive: number; negative: number; neutral: number; total: number;
}) {
  if (!total) return null;
  return (
    <div className="space-y-2">
      <div className="flex h-3 rounded-full overflow-hidden gap-px">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${(positive / total) * 100}%` }}
          transition={{ duration: 0.8 }}
          style={{ background: "#00FF88", boxShadow: "0 0 6px rgba(0,255,136,0.4)" }}
        />
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${(neutral / total) * 100}%` }}
          transition={{ duration: 0.8, delay: 0.1 }}
          style={{ background: "rgba(100,116,139,0.5)" }}
        />
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${(negative / total) * 100}%` }}
          transition={{ duration: 0.8, delay: 0.2 }}
          style={{ background: "#FF0080", boxShadow: "0 0 6px rgba(255,0,128,0.4)" }}
        />
      </div>
      <div className="flex gap-4 text-xs">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ background: "#00FF88" }} /><span className="text-slate-500">{positive} bullish</span></span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block bg-slate-600" /><span className="text-slate-500">{neutral} neutral</span></span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ background: "#FF0080" }} /><span className="text-slate-500">{negative} bearish</span></span>
      </div>
    </div>
  );
}

const EXPLAIN_SENTIMENT: ExplanationContent = {
  title: "News-Sentiment-Analyse",
  subtitle: "FinGPT · NLP auf Finanznachrichten",
  color: "yellow",
  theory:
    "Das Sentiment-System verarbeitet aktuelle Finanznachrichten mit FinGPT (Fine-tuned LLM auf Finanzdaten). " +
    "Jeder Artikel wird als positiv / neutral / negativ klassifiziert und mit einem Score von -1.0 bis +1.0 bewertet. " +
    "Der Overall Score ist ein gewichteter Durchschnitt über alle Artikel der letzten 24–72 Stunden.",
  keyPoints: [
    "Score > +0.3: Positives Sentiment — bullisher Newsflow",
    "Score -0.3 bis +0.3: Neutral — gemischte oder fehlende Nachrichten",
    "Score < -0.3: Negatives Sentiment — bearisher Newsflow",
    "Sentiment allein ist kein Handelssignal — immer mit technischer Analyse kombinieren",
    "Höchste Signalkraft: wenn Sentiment UND technisches Signal übereinstimmen",
    "Sentiment kann durch einzelne große Nachrichten (Earnings, CEO-Rücktritt) stark ausschlagen",
  ],
  practicalTip:
    "Extremes negatives Sentiment (< -0.7) bei soliden Fundamentals kann eine antizyklische Kaufchance signalisieren — " +
    "der Markt überreagiert oft kurzfristig auf schlechte News. Aber: Nie gegen starke Trends handeln.",
};

/* ============================================================ */
export default function SentimentPage() {
  const [tickers, setTickers] = useState("AAPL,NVDA,TSLA");
  const [results, setResults] = useState<SentimentSummary[]>(MOCK_SENTIMENT);
  const [isLiveData, setIsLiveData] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [explainOpen, setExplainOpen] = useState(false);

  async function handleAnalyze() {
    setLoading(true);
    setError(null);
    try {
      const list = tickers.split(",").map((t) => t.trim()).filter(Boolean);
      const res = await api.sentiment.getMulti(list);
      setResults(res);
      setIsLiveData(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sentiment analysis failed");
      setIsLiveData(false);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const defaults = tickers.split(",").map((t) => t.trim()).filter(Boolean);
    setLoading(true);
    api.sentiment.getMulti(defaults)
      .then((res) => { setResults(res); setIsLiveData(true); })
      .catch(() => { setIsLiveData(false); })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Heatmap: overlay live API results on top of default baseline
  const DEFAULT_HEAT: Record<string, number> = {
    AAPL: 0.62, NVDA: 0.88, TSLA: -0.34, MSFT: 0.45,
    META: 0.71, AMD: -0.22, AMZN: 0.55, GOOGL: 0.38,
    BTC: 0.67, ETH: 0.42, INTC: -0.51, NFLX: 0.29,
  };
  const liveScores = Object.fromEntries(
    results.map((r) => [r.ticker, r.overall_score])
  );
  const merged = { ...DEFAULT_HEAT, ...liveScores };
  const heatTickers = Object.entries(merged).map(([ticker, score]) => ({ ticker, score }));

  return (
    <div className="space-y-5">
      {/* Header */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <div className="flex items-center gap-3 mb-1">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: "rgba(255,215,0,0.15)", border: "1px solid rgba(255,215,0,0.3)" }}
          >
            <Newspaper className="w-4 h-4" style={{ color: "#FFD700" }} />
          </div>
          <h1 className="text-2xl font-bold text-slate-100">News Sentiment</h1>
          <NeonBadge color="yellow">AI-Powered</NeonBadge>
          {isLiveData ? (
            <NeonBadge color="green">LIVE</NeonBadge>
          ) : (
            <span
              className="text-xs font-bold px-2.5 py-1 rounded-full"
              style={{
                background: "rgba(100,116,139,0.12)",
                border: "1px solid rgba(100,116,139,0.3)",
                color: "#64748B",
              }}
            >
              DEMO
            </span>
          )}
        </div>
        <p className="text-sm text-slate-500">FinGPT + Claude Haiku — real-time news sentiment analysis</p>
      </motion.div>

      {/* Search */}
      <GlassCard variant="purple" delay={0.1}>
        <div className="flex items-center justify-between">
          <SectionLabel>Analyze Tickers</SectionLabel>
          <InfoButton onClick={() => setExplainOpen(true)} color="yellow" className="-mt-2" />
        </div>
        <div className="flex gap-3 mt-3">
          <input
            value={tickers}
            onChange={(e) => setTickers(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
            placeholder="AAPL,TSLA,BTC,NVDA"
            className="flex-1 rounded-xl px-4 py-2.5 text-sm font-mono text-slate-200 placeholder-slate-600 outline-none"
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(123,47,255,0.3)",
            }}
          />
          <button
            onClick={handleAnalyze}
            disabled={loading}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
            style={{
              background: "linear-gradient(135deg, rgba(123,47,255,0.25), rgba(0,212,255,0.15))",
              border: "1px solid rgba(123,47,255,0.4)",
              color: "#7B2FFF",
              boxShadow: "0 0 20px rgba(123,47,255,0.2)",
            }}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Newspaper className="w-4 h-4" />}
            {loading ? "Analyzing..." : "Analyze"}
          </button>
        </div>
      </GlassCard>

      {/* Heatmap */}
      <GlassCard delay={0.15}>
        <SectionLabel>Sentiment Heatmap</SectionLabel>
        <div className="grid grid-cols-6 gap-2 mt-3">
          {heatTickers.map((t, i) => (
            <motion.div
              key={t.ticker}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 + i * 0.03 }}
            >
              <HeatTile ticker={t.ticker} score={t.score} />
            </motion.div>
          ))}
        </div>
        <div className="flex items-center justify-center gap-6 mt-4 text-xs text-slate-500">
          <span className="flex items-center gap-2"><span className="w-10 h-1.5 rounded-full inline-block" style={{ background: "rgba(255,0,128,0.6)" }} />Bearish</span>
          <span className="flex items-center gap-2"><span className="w-10 h-1.5 rounded-full inline-block bg-slate-700" />Neutral</span>
          <span className="flex items-center gap-2"><span className="w-10 h-1.5 rounded-full inline-block" style={{ background: "rgba(0,255,136,0.6)" }} />Bullish</span>
        </div>
      </GlassCard>

      {/* Results */}
      <AnimatePresence>
        {results.map((r, ri) => (
          <GlassCard
            key={r.ticker}
            variant={r.overall_sentiment === "positive" ? "green" : r.overall_sentiment === "negative" ? "pink" : "default"}
            delay={0.25 + ri * 0.1}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl font-bold text-sm flex items-center justify-center"
                  style={{
                    background: r.overall_sentiment === "positive" ? "rgba(0,255,136,0.15)" : r.overall_sentiment === "negative" ? "rgba(255,0,128,0.15)" : "rgba(100,116,139,0.15)",
                    color: r.overall_sentiment === "positive" ? "#00FF88" : r.overall_sentiment === "negative" ? "#FF0080" : "#64748B",
                  }}
                >
                  {r.ticker.slice(0, 3)}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-100">{r.ticker}</h2>
                  <p className="text-xs text-slate-500">{r.news_count} articles analyzed</p>
                </div>
              </div>
              <SentimentBadge score={r.overall_score} />
            </div>

            <SentimentBar
              positive={r.positive_count}
              negative={r.negative_count}
              neutral={r.neutral_count}
              total={r.news_count}
            />

            <div className="mt-4 space-y-2">
              <SectionLabel>Latest Headlines</SectionLabel>
              {r.news_items.map((item, i) => (
                <NewsCard key={item.id} item={item} index={i} />
              ))}
            </div>
          </GlassCard>
        ))}
      </AnimatePresence>

      <ExplanationModal
        open={explainOpen}
        onClose={() => setExplainOpen(false)}
        content={EXPLAIN_SENTIMENT}
      />
    </div>
  );
}
