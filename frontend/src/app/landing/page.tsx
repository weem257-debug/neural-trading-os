"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  Brain,
  TrendingUp,
  TrendingDown,
  Minus,
  FlaskConical,
  Briefcase,
  Zap,
  BarChart3,
  Shield,
  Github,
  ArrowRight,
  CheckCircle2,
  Loader2,
  ChevronDown,
  Sparkles,
} from "lucide-react";
import { API_BASE } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";

// ---------------------------------------------------------------------------
// Particle background (canvas-based, lightweight)
// ---------------------------------------------------------------------------
function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const particles: {
      x: number;
      y: number;
      vx: number;
      vy: number;
      r: number;
      alpha: number;
    }[] = [];

    for (let i = 0; i < 80; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        r: Math.random() * 1.5 + 0.5,
        alpha: Math.random() * 0.4 + 0.1,
      });
    }

    let animId: number;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 212, 255, ${p.alpha})`;
        ctx.fill();
      });
      animId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
      aria-hidden="true"
    />
  );
}

// ---------------------------------------------------------------------------
// Feature cards data
// ---------------------------------------------------------------------------
const features = [
  {
    icon: Brain,
    title: "Multi-Agenten KI-Signale",
    description:
      "TradingAgents-Framework mit Claude Sonnet 4.6 Konsens — Fundamental-, Technisch- und Sentiment-Agenten stimmen über jeden Trade ab.",
    color: "from-cyan-500/20 to-blue-500/20",
    border: "border-cyan-500/30",
  },
  {
    icon: TrendingUp,
    title: "Live-Sentiment-Analyse",
    description:
      "FinGPT + yfinance News-Ingestion. Echtzeit-NLP-Scoring für jeden Ticker — positiv, negativ oder neutral mit Konfidenz.",
    color: "from-emerald-500/20 to-teal-500/20",
    border: "border-emerald-500/30",
  },
  {
    icon: FlaskConical,
    title: "Backtesting-Engine",
    description:
      "MA-Crossover, RSI Mean-Reversion, Buy-and-Hold über Jesse, Qlib und Vibe-Trading — 300+ Indikatoren, 452 Alpha-Faktoren.",
    color: "from-violet-500/20 to-purple-500/20",
    border: "border-violet-500/30",
  },
  {
    icon: Briefcase,
    title: "Paper Trading",
    description:
      "100k virtuelles Kapital. Sofortige Orderausführung via Nautilus Trader. Umstieg auf Live-Trading mit einem Schalter — safety-gated.",
    color: "from-amber-500/20 to-orange-500/20",
    border: "border-amber-500/30",
  },
  {
    icon: Zap,
    title: "Echtzeit-WebSocket",
    description:
      "Live-Kurse, Portfolio-Updates, Signal-Streams und Risikoalarme — alles via WebSocket-Kanäle, kein Seitenneuladen nötig.",
    color: "from-yellow-500/20 to-amber-500/20",
    border: "border-yellow-500/30",
  },
  {
    icon: Shield,
    title: "Risikomanagement",
    description:
      "VaR 95/99, Max Drawdown, Konzentrations-Alerts und tägliche Stop-Loss-Durchsetzung — Institutionelle Sicherheitsstandards.",
    color: "from-red-500/20 to-rose-500/20",
    border: "border-red-500/30",
  },
];

// ---------------------------------------------------------------------------
// Pricing tiers
// ---------------------------------------------------------------------------
const pricingTiers = [
  {
    name: "Basic",
    price: "29",
    period: "/ Monat",
    description: "Ideal für Einsteiger die KI-Handelssignale nutzen wollen.",
    features: [
      "10 KI-Signale pro Tag",
      "Preis-Alerts (unbegrenzt)",
      "Paper Trading (100k virtuell)",
      "Live Sentiment-Feed",
      "WebSocket-Dashboard",
      "Broker-Integration (alle)",
    ],
    cta: "Basic starten",
    highlight: false,
    border: "border-slate-700",
    glow: "",
  },
  {
    name: "Pro",
    price: "99",
    period: "/ Monat",
    description: "Für aktive Trader die das vollständige KI-Cockpit brauchen.",
    features: [
      "50 KI-Signale pro Tag",
      "Elliott-Wave-KI-Analyse",
      "Multi-Broker-Depot-Tracking",
      "Portfolio-Analytics",
      "Backtesting-Suite (300+ Indikatoren)",
      "Prioritäts-Support",
    ],
    cta: "Pro starten",
    highlight: true,
    border: "border-cyan-500",
    glow: "shadow-[0_0_40px_rgba(0,212,255,0.25)]",
  },
  {
    name: "Institutional",
    price: "299",
    period: "/ Monat",
    description: "White-Label-fähig. Für Fonds und Fintech-Teams.",
    features: [
      "Alles aus Pro",
      "Unbegrenzte Signale täglich",
      "White-Label-Dashboard",
      "Custom Signal-Modelle",
      "SLA 99,9 % Uptime",
      "Dedizierter Account Manager",
    ],
    cta: "Kontakt aufnehmen",
    highlight: false,
    border: "border-violet-700",
    glow: "",
  },
];

// ---------------------------------------------------------------------------
// Main Landing Page
// ---------------------------------------------------------------------------
const FAQ_ITEMS = [
  {
    q: "Ist Neural Trading OS wirklich kostenlos?",
    a: "Ja — der Free-Plan ist dauerhaft kostenlos. Du bekommst 3 KI-Signale pro Tag, Backtesting und das Portfolio-Dashboard ohne Kreditkarte. Upgrades auf Basic (€29/Monat) oder Pro (€99/Monat) schalten mehr Signale und erweiterte Features frei.",
  },
  {
    q: "Sind die Signale echte Handelsempfehlungen?",
    a: "Nein. Die Signale sind KI-generierte Analyseergebnisse zu Informationszwecken — kein Anlageberatung im Sinne des WpHG. Jede Handelsentscheidung triffst du eigenverantwortlich. Bitte lies unsere AGB und den Haftungsausschluss.",
  },
  {
    q: "Welche Broker und Märkte werden unterstützt?",
    a: "Du kannst Aktien, ETFs, Krypto-Assets und Forex analysieren. Für Paper-Trading ist kein Broker nötig. Live-Trading verbindet sich mit Alpaca (Aktien/US) und gängigen Krypto-Exchanges. Deutsche Broker (Flatex, comdirect, Trade Republic) können als Datenbasis eingebunden werden.",
  },
  {
    q: "Wie funktioniert die KI-Analyse genau?",
    a: "Mehrere spezialisierte KI-Agenten (Fundamental-, Technisch-, Sentiment- und Risikoanalyst) analysieren den Ticker unabhängig und geben eine Empfehlung ab. Ein Supervisor-Agent aggregiert die Ergebnisse zu einem finalen Signal mit Konfidenzwert und Begründung.",
  },
  {
    q: "Sind meine Daten sicher?",
    a: "Deine Zugangsdaten werden verschlüsselt gespeichert (bcrypt). API-Keys für Broker verbleiben lokal in deinem Browser. Wir speichern keine Handelsaufträge auf unseren Servern. Das System ist DSGVO-konform — du kannst dein Konto und alle Daten jederzeit löschen.",
  },
  {
    q: "Kann ich das System auf meinen eigenen Server deployen?",
    a: "Ja. Neural Trading OS ist Open-Source-fähig und kann mit Docker auf deiner eigenen Infrastruktur betrieben werden. Backend (FastAPI) und Frontend (Next.js) sind vollständig selbst-hostbar.",
  },
];

// ---------------------------------------------------------------------------
// Live Demo Signal Preview
// ---------------------------------------------------------------------------
const DEMO_TICKERS = ["AAPL", "NVDA", "MSFT", "TSLA", "BTC-USD"];

interface DemoSignal {
  ticker: string;
  direction: string;
  confidence: number;
  price_target: number | null;
  stop_loss: number | null;
  reasoning: string;
  agents_consensus: string | null;
}

function DirectionIcon({ direction }: { direction: string }) {
  if (direction === "BUY") return <TrendingUp className="w-5 h-5" />;
  if (direction === "SELL") return <TrendingDown className="w-5 h-5" />;
  return <Minus className="w-5 h-5" />;
}

function LandingDemoPreview() {
  const [signal, setSignal] = useState<DemoSignal | null>(null);
  const [loading, setLoading] = useState(false);
  const [ticker, setTicker] = useState("AAPL");
  const [hasLoaded, setHasLoaded] = useState(false);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());
  const signalHref = isAuthenticated ? "/signals" : "/register";

  const fetchDemo = async (t: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/signals/demo?ticker=${t}`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json() as DemoSignal;
        setSignal(data);
      }
    } catch {
      // silent — section is non-critical
    } finally {
      setLoading(false);
      setHasLoaded(true);
    }
  };

  useEffect(() => { fetchDemo("AAPL"); }, []);

  const handleTicker = (t: string) => {
    setTicker(t);
    fetchDemo(t);
  };

  const dirColor = signal?.direction === "BUY" ? "#00FF88" : signal?.direction === "SELL" ? "#FF0080" : "#00D4FF";
  const confPct = signal ? Math.round(signal.confidence * 100) : 0;

  return (
    <section className="px-6 py-16">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest mb-4"
            style={{ background: "rgba(0,212,255,0.08)", border: "1px solid rgba(0,212,255,0.2)", color: "#00D4FF" }}>
            <Sparkles className="w-3 h-3" />
            Live-Vorschau
          </div>
          <h2 className="text-3xl font-black text-white mb-3">Sieh ein echtes KI-Signal</h2>
          <p className="text-slate-400 text-sm max-w-lg mx-auto">
            Echte Analyse — live vom KI-System generiert. Wähle einen Ticker und sieh wie Multi-Agent-Analyse aussieht.
          </p>
        </div>

        {/* Ticker selector */}
        <div className="flex flex-wrap justify-center gap-2 mb-8">
          {DEMO_TICKERS.map((t) => (
            <button
              key={t}
              onClick={() => handleTicker(t)}
              className="px-4 py-1.5 rounded-full text-xs font-bold transition-all"
              style={{
                background: ticker === t ? "rgba(0,212,255,0.15)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${ticker === t ? "rgba(0,212,255,0.5)" : "rgba(255,255,255,0.08)"}`,
                color: ticker === t ? "#00D4FF" : "#64748b",
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Signal card */}
        <div className="max-w-xl mx-auto rounded-2xl overflow-hidden"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(20px)" }}>

          {loading && (
            <div className="flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#00D4FF" }} />
                <span className="text-xs text-slate-500">KI-Agenten analysieren {ticker}…</span>
              </div>
            </div>
          )}

          {!loading && signal && (
            <div className="p-6">
              {/* Header row */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm"
                    style={{ background: `${dirColor}15`, color: dirColor, border: `1px solid ${dirColor}30` }}>
                    {signal.ticker.slice(0, 4)}
                  </div>
                  <div>
                    <div className="font-bold text-slate-100">{signal.ticker}</div>
                    <div className="text-xs text-slate-500">KI-Analyse</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl font-black text-sm"
                  style={{ background: `${dirColor}15`, color: dirColor, border: `1px solid ${dirColor}30` }}>
                  <DirectionIcon direction={signal.direction} />
                  {signal.direction}
                </div>
              </div>

              {/* Confidence bar */}
              <div className="mb-5">
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-slate-500">Konfidenz</span>
                  <span className="font-mono font-bold" style={{ color: dirColor }}>{confPct}%</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${confPct}%`, background: `linear-gradient(90deg, ${dirColor}80, ${dirColor})` }}
                  />
                </div>
              </div>

              {/* Targets */}
              {(signal.price_target || signal.stop_loss) && (
                <div className="grid grid-cols-2 gap-3 mb-5">
                  {signal.price_target && (
                    <div className="rounded-xl p-3" style={{ background: "rgba(0,255,136,0.05)", border: "1px solid rgba(0,255,136,0.12)" }}>
                      <div className="text-xs text-slate-500 mb-1">Kursziel</div>
                      <div className="text-sm font-mono font-bold" style={{ color: "#00FF88" }}>
                        ${signal.price_target.toFixed(2)}
                      </div>
                    </div>
                  )}
                  {signal.stop_loss && (
                    <div className="rounded-xl p-3" style={{ background: "rgba(255,0,128,0.05)", border: "1px solid rgba(255,0,128,0.12)" }}>
                      <div className="text-xs text-slate-500 mb-1">Stop-Loss</div>
                      <div className="text-sm font-mono font-bold" style={{ color: "#FF0080" }}>
                        ${signal.stop_loss.toFixed(2)}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Reasoning */}
              {signal.reasoning && (
                <div className="mb-5 p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
                  <div className="text-xs text-slate-500 mb-1.5 flex items-center gap-1.5">
                    <Brain className="w-3 h-3" /> KI-Begründung
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed line-clamp-3">
                    {signal.reasoning}
                  </p>
                </div>
              )}

              {/* Demo badge + CTA */}
              <div className="flex items-center justify-between">
                <span className="text-xs px-2 py-0.5 rounded-full"
                  style={{ background: "rgba(100,116,139,0.1)", border: "1px solid rgba(100,116,139,0.2)", color: "#64748b" }}>
                  Demo — KI-Simulation
                </span>
                <Link href={signalHref}
                  className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl transition-all"
                  style={{ background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.3)", color: "#00D4FF" }}>
                  Eigenes Signal <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
          )}

          {!loading && !signal && hasLoaded && (
            <div className="py-10 text-center text-xs text-slate-600">
              Vorschau nicht verfügbar — <Link href={signalHref} className="text-cyan-500 underline">direkt ausprobieren</Link>
            </div>
          )}
        </div>

        {/* Sub-CTA */}
        <p className="text-center text-xs text-slate-600 mt-5">
          Das war eine Mock-Simulation. Echte Signale nutzen{" "}
          <span style={{ color: "#00D4FF" }}>Claude Sonnet + 9 spezialisierte KI-Agenten</span>.
        </p>
      </div>
    </section>
  );
}

function LandingFaq() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <section className="px-6 py-16">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-3xl font-black text-white text-center mb-2">Häufige Fragen</h2>
        <p className="text-slate-500 text-sm text-center mb-10">Alles was du wissen musst — kurz und klar.</p>
        <div className="space-y-2">
          {FAQ_ITEMS.map((item, i) => (
            <div
              key={i}
              className="rounded-2xl overflow-hidden"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="w-full flex items-center justify-between px-5 py-4 text-left"
              >
                <span className="text-sm font-semibold text-slate-200 pr-4">{item.q}</span>
                <ChevronDown
                  className="w-4 h-4 text-slate-500 shrink-0 transition-transform duration-200"
                  style={{ transform: open === i ? "rotate(180deg)" : "rotate(0deg)" }}
                />
              </button>
              {open === i && (
                <div className="px-5 pb-4">
                  <p className="text-sm text-slate-400 leading-relaxed">{item.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function LandingPage() {
  const [email, setEmail] = useState("");
  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joinMessage, setJoinMessage] = useState("");
  const [count, setCount] = useState<number | null>(null);
  const [signalTotal, setSignalTotal] = useState<number | null>(null);
  const [winRate, setWinRate] = useState<number | null>(null);
  const [avgReturn, setAvgReturn] = useState<number | null>(null);
  const [consentChecked, setConsentChecked] = useState(false);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());

  useEffect(() => {
    // Combine waitlist signups + registered users for "Early Adopters" social proof
    Promise.allSettled([
      fetch(`${API_BASE}/api/waitlist/count`).then((r) => r.json()),
      fetch(`${API_BASE}/api/auth/users/count`).then((r) => r.json()),
    ]).then(([waitlistResult, usersResult]) => {
      const waitlistCount = waitlistResult.status === "fulfilled" ? (waitlistResult.value.count ?? 0) : 0;
      const usersCount = usersResult.status === "fulfilled" ? (usersResult.value.count ?? 0) : 0;
      const combined = waitlistCount + usersCount;
      if (combined > 0) setCount(combined);
    });
    fetch(`${API_BASE}/api/signals/total`)
      .then((r) => r.json())
      .then((d) => setSignalTotal(d.total))
      .catch(() => {});
    fetch(`${API_BASE}/api/signals/performance`)
      .then((r) => r.json())
      .then((d) => {
        if (d && d.total_evaluated > 0) {
          setWinRate(d.win_rate);
          setAvgReturn(d.avg_return);
        }
      })
      .catch(() => {});
  }, []);

  const handleWaitlist = async () => {
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes("@")) return;
    setJoining(true);
    try {
      const res = await fetch(`${API_BASE}/api/waitlist/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed, source: "landing-page" }),
      });
      const data = await res.json();
      if (res.ok) {
        setJoined(true);
        setJoinMessage(data.message ?? "Du bist auf der Liste.");
        setCount(data.position ?? null);
      } else {
        setJoinMessage(data.detail ?? "Etwas ist schiefgelaufen. Bitte versuche es erneut.");
      }
    } catch {
      setJoinMessage("Verbindung zum Server fehlgeschlagen. Bitte versuche es erneut.");
    } finally {
      setJoining(false);
    }
  };

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        "name": "Neural Trading OS",
        "applicationCategory": "FinanceApplication",
        "operatingSystem": "Web",
        "description": "AI-powered unified trading cockpit with 9 engines, live Claude Sonnet 4.6 signals, real-time WebSocket dashboard, paper trading and backtesting.",
        "url": process.env.NEXT_PUBLIC_APP_URL ?? "https://neuraltrading.io",
        "offers": [
          { "@type": "Offer", "name": "Basic", "price": "29", "priceCurrency": "EUR", "billingPeriod": "P1M" },
          { "@type": "Offer", "name": "Pro",   "price": "99", "priceCurrency": "EUR", "billingPeriod": "P1M" },
        ],
        "featureList": [
          "Live KI-Handelssignale via Claude Sonnet 4.6",
          "Echtzeit-Kursstream per WebSocket",
          "Paper Trading mit 100.000 € virtuellem Kapital",
          "Backtesting via Jesse, Qlib, Vibe-Trading",
          "Nachrichtensentiment-Analyse via FinGPT",
          "Risikomanagement: VaR, Sharpe, Drawdown",
          "P2P-Portfolio-Tracking",
          "Selbstlernende KI mit RAG-Feedback",
        ],
      },
      {
        "@type": "Organization",
        "name": "Neural Trading OS",
        "url": process.env.NEXT_PUBLIC_APP_URL ?? "https://neuraltrading.io",
        "sameAs": ["https://github.com/weem257-debug/neural-trading-os"],
      },
    ],
  };

  return (
    <div className="relative min-h-screen bg-[#030712] overflow-x-hidden">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* Particle background */}
      <ParticleCanvas />

      {/* Ambient glow */}
      <div
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(0,212,255,0.07) 0%, transparent 60%), " +
            "radial-gradient(ellipse 60% 40% at 90% 90%, rgba(123,47,255,0.05) 0%, transparent 50%)",
        }}
      />

      <div className="relative z-10">
        {/* ----------------------------------------------------------------- */}
        {/* Nav */}
        {/* ----------------------------------------------------------------- */}
        <nav className="flex items-center justify-between px-6 py-5 max-w-7xl mx-auto">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-cyan-400" />
            <span className="font-bold text-white text-lg tracking-tight">
              Neural Trading OS
            </span>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="https://github.com/weem257-debug/neural-trading-os"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors text-sm"
            >
              <Github className="w-4 h-4" />
              GitHub
            </a>
            <a
              href={isAuthenticated ? "/dashboard" : "/register"}
              className="px-4 py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 transition-all text-sm font-medium"
            >
              {isAuthenticated ? "Dashboard" : "Registrieren"}
            </a>
          </div>
        </nav>

        {/* ----------------------------------------------------------------- */}
        {/* Hero */}
        {/* ----------------------------------------------------------------- */}
        <section className="px-6 pt-20 pb-24 text-center max-w-5xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-cyan-500/30 bg-cyan-500/5 text-cyan-400 text-xs font-medium mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            Betrieben mit Claude Sonnet 4.6 + 9 Trading-Engines
          </div>

          <h1 className="text-5xl sm:text-7xl font-black leading-none tracking-tight mb-6">
            <span
              className="bg-gradient-to-r from-cyan-400 via-blue-400 to-violet-400 bg-clip-text text-transparent"
              style={{
                backgroundSize: "200% 200%",
                animation: "gradient-shift 4s ease infinite",
              }}
            >
              Neural Trading OS
            </span>
          </h1>

          <style>{`
            @keyframes gradient-shift {
              0%, 100% { background-position: 0% 50%; }
              50% { background-position: 100% 50%; }
            }
          `}</style>

          <p className="text-xl sm:text-2xl text-slate-400 max-w-3xl mx-auto mb-10 leading-relaxed">
            AI-powered unified trading cockpit.{" "}
            <span className="text-white">Multi-Agenten-Signale</span>,{" "}
            <span className="text-white">Live-Sentiment</span>,{" "}
            <span className="text-white">Backtesting</span> und{" "}
            <span className="text-white">Paper Trading</span> — alles in einem
            Echtzeit-Dashboard.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href={isAuthenticated ? "/dashboard" : "/register"}
              className="group flex items-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold text-lg hover:from-cyan-400 hover:to-blue-500 transition-all shadow-[0_0_30px_rgba(0,212,255,0.3)] hover:shadow-[0_0_50px_rgba(0,212,255,0.5)]"
            >
              {isAuthenticated ? "Dashboard öffnen" : "Kostenlos starten"}
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </a>
            {!isAuthenticated && (
              <a
                href="/dashboard"
                className="flex items-center gap-2 px-8 py-4 rounded-xl border border-slate-700 text-slate-300 font-medium text-lg hover:border-slate-500 hover:text-white transition-all"
              >
                Demo ansehen
              </a>
            )}
          </div>

          {/* Trust badges */}
          <div className="flex flex-wrap justify-center gap-3 mt-6">
            {[
              "✓ Dauerhaft kostenlos",
              "✓ Kein API-Key für Demo",
              "✓ DSGVO-konform",
              "✓ Keine Kreditkarte",
            ].map((badge) => (
              <span
                key={badge}
                className="text-xs px-3 py-1 rounded-full"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(100,116,139,0.8)" }}
              >
                {badge}
              </span>
            ))}
          </div>

          {/* Stats row */}
          <div className="flex flex-wrap justify-center gap-8 mt-12 text-center">
            {[
              { label: "Trading-Engines", value: "9" },
              { label: "KI-Agenten", value: "5" },
              { label: "Broker integriert", value: "4+" },
              { label: "Virtuelles Kapital", value: "100K" },
            ].map((stat) => (
              <div key={stat.label}>
                <div className="text-3xl font-black text-white">{stat.value}</div>
                <div className="text-sm text-slate-500 mt-1">{stat.label}</div>
              </div>
            ))}
            {signalTotal !== null && signalTotal > 0 && (
              <div>
                <div className="text-3xl font-black text-neon-green" style={{ color: "#00FF88" }}>
                  {signalTotal >= 1000 ? `${Math.floor(signalTotal / 100) * 100}+` : signalTotal >= 100 ? `${Math.floor(signalTotal / 10) * 10}+` : `${signalTotal}+`}
                </div>
                <div className="text-sm text-slate-500 mt-1">Signale generiert</div>
              </div>
            )}
            {winRate !== null && (
              <div>
                <div className="text-3xl font-black" style={{ color: "#00FF88" }}>
                  {Math.round(winRate * 100)}%
                </div>
                <div className="text-sm text-slate-500 mt-1">Trefferquote</div>
              </div>
            )}
            {avgReturn !== null && (
              <div>
                <div className="text-3xl font-black" style={{ color: avgReturn >= 0 ? "#00FF88" : "#ef4444" }}>
                  {avgReturn >= 0 ? "+" : ""}{(avgReturn * 100).toFixed(1)}%
                </div>
                <div className="text-sm text-slate-500 mt-1">Ø Rendite</div>
              </div>
            )}
            {count !== null && count > 0 && (
              <div>
                <div className="text-3xl font-black" style={{ color: "#00D4FF" }}>
                  {count >= 100 ? `${count}+` : count >= 10 ? `${Math.floor(count / 10) * 10}+` : "10+"}
                </div>
                <div className="text-sm text-slate-500 mt-1">Early Adopters</div>
              </div>
            )}
          </div>
        </section>

        {/* ----------------------------------------------------------------- */}
        {/* How It Works */}
        {/* ----------------------------------------------------------------- */}
        <section className="px-6 py-16 max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs font-bold tracking-widest text-cyan-500 mb-3">IN 3 SCHRITTEN</p>
            <h2 className="text-3xl font-black text-white">Wie es funktioniert</h2>
          </div>
          <div className="relative flex flex-col md:flex-row items-center md:items-start gap-8 md:gap-0">
            {/* Connector line (desktop only) */}
            <div
              className="hidden md:block absolute top-10 left-[calc(16.66%+1.5rem)] right-[calc(16.66%+1.5rem)] h-px"
              style={{ background: "linear-gradient(90deg, transparent, rgba(0,212,255,0.3), rgba(0,212,255,0.3), transparent)" }}
            />
            {[
              {
                step: "01",
                color: "#00D4FF",
                title: "Ticker eingeben",
                desc: "Tippe einen Börsen-Ticker ein — AAPL, NVDA, BTC oder beliebig andere. Oder nutze den Batch-Scan für bis zu 10 Titel gleichzeitig.",
                icon: (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 104.5 4.5a7.5 7.5 0 0012.15 12.15z" />
                  </svg>
                ),
              },
              {
                step: "02",
                color: "#00FF88",
                title: "KI analysiert",
                desc: "5 spezialisierte KI-Agenten prüfen gleichzeitig Fundamentaldaten, Sentiment, Charttechnik, aktuelle News und Risikolage.",
                icon: (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15M14.25 3.104c.251.023.501.05.75.082M19.8 15l-1.5 1.5m0 0l-1.5 1.5m1.5-1.5h-1.5m0 0v1.5" />
                  </svg>
                ),
              },
              {
                step: "03",
                color: "#7B2FFF",
                title: "Signal erhalten",
                desc: "Ein klares BUY/SELL-Signal mit Konfidenz-Score, Kursziel und Stop-Loss — im Dashboard oder per Telegram-Benachrichtigung.",
                icon: (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                  </svg>
                ),
              },
            ].map(({ step, color, title, desc, icon }) => (
              <div key={step} className="flex-1 flex flex-col items-center text-center px-4 relative z-10">
                <div
                  className="w-20 h-20 rounded-2xl flex items-center justify-center mb-5"
                  style={{
                    background: `${color}12`,
                    border: `1px solid ${color}30`,
                    boxShadow: `0 0 20px ${color}15`,
                    color,
                  }}
                >
                  {icon}
                </div>
                <div
                  className="text-xs font-black tracking-widest mb-2"
                  style={{ color: `${color}80` }}
                >
                  SCHRITT {step}
                </div>
                <h3 className="text-lg font-bold text-white mb-2">{title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ----------------------------------------------------------------- */}
        {/* Features */}
        {/* ----------------------------------------------------------------- */}
        <section className="px-6 py-20 max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-black text-white mb-4">
              Alles für intelligenteres Trading
            </h2>
            <p className="text-slate-400 text-lg max-w-2xl mx-auto">
              9 spezialisierte Open-Source-Repos, vereint in einer produktionsreifen
              Plattform. Kein Setup-Aufwand. Nur Trading-Intelligenz.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((f) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.title}
                  className={`
                    relative p-6 rounded-2xl border ${f.border}
                    bg-gradient-to-br ${f.color}
                    backdrop-blur-sm
                    hover:scale-[1.02] transition-transform duration-200
                  `}
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 rounded-lg bg-white/5">
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <h3 className="font-bold text-white">{f.title}</h3>
                  </div>
                  <p className="text-slate-400 text-sm leading-relaxed">
                    {f.description}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {/* ----------------------------------------------------------------- */}
        {/* Performance Teaser (only when data available) */}
        {/* ----------------------------------------------------------------- */}
        {(winRate !== null || avgReturn !== null) && (
          <section className="px-6 pb-12 max-w-4xl mx-auto">
            <div
              className="rounded-2xl p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-6"
              style={{
                background: "rgba(0,255,136,0.04)",
                border: "1px solid rgba(0,255,136,0.15)",
              }}
            >
              <div>
                <p className="text-xs font-semibold text-green-400 tracking-wider uppercase mb-2">
                  Echte Daten — kein Marketing
                </p>
                <h2 className="text-xl sm:text-2xl font-bold text-white mb-1">
                  KI-Signale: nachweislich profitabel
                </h2>
                <p className="text-slate-400 text-sm">
                  Alle generierten Signale werden täglich mit Echtmarktdaten ausgewertet.
                </p>
                <div className="flex gap-6 mt-4">
                  {winRate !== null && (
                    <div>
                      <p className="text-2xl font-black" style={{ color: "#00FF88" }}>
                        {Math.round(winRate * 100)}%
                      </p>
                      <p className="text-xs text-slate-500">Trefferquote</p>
                    </div>
                  )}
                  {avgReturn !== null && (
                    <div>
                      <p className="text-2xl font-black" style={{ color: avgReturn >= 0 ? "#00FF88" : "#ef4444" }}>
                        {avgReturn >= 0 ? "+" : ""}{(avgReturn * 100).toFixed(1)}%
                      </p>
                      <p className="text-xs text-slate-500">Ø Rendite</p>
                    </div>
                  )}
                </div>
              </div>
              <Link
                href="/performance"
                className="shrink-0 inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold transition-all"
                style={{
                  background: "rgba(0,255,136,0.12)",
                  border: "1px solid rgba(0,255,136,0.3)",
                  color: "#00FF88",
                }}
              >
                <TrendingUp className="w-4 h-4" />
                Performance ansehen
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </section>
        )}

        {/* ----------------------------------------------------------------- */}
        {/* Pricing */}
        {/* ----------------------------------------------------------------- */}
        <section className="px-6 py-20 max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-black text-white mb-4">
              Einfache, transparente Preise
            </h2>
            <p className="text-slate-400 text-lg">
              Kostenlos starten. Upgraden, wenn du ernsthaft handeln willst.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
            {pricingTiers.map((tier) => (
              <div
                key={tier.name}
                className={`
                  relative p-8 rounded-2xl border ${tier.border} ${tier.glow}
                  bg-slate-900/60 backdrop-blur-sm
                  ${tier.highlight ? "scale-105" : ""}
                  transition-all duration-200
                `}
              >
                {tier.highlight && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <span className="px-4 py-1 rounded-full bg-cyan-500 text-black text-xs font-black tracking-wide">
                      BELIEBTESTER PLAN
                    </span>
                  </div>
                )}

                <div className="mb-6">
                  <h3 className="text-lg font-bold text-white mb-1">
                    {tier.name}
                  </h3>
                  <div className="flex items-baseline gap-1 mb-2">
                    <span className="text-4xl font-black text-white">
                      €{tier.price}
                    </span>
                    <span className="text-slate-500 text-sm">{tier.period}</span>
                  </div>
                  <p className="text-slate-400 text-sm">{tier.description}</p>
                </div>

                <ul className="space-y-3 mb-8">
                  {tier.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-center gap-2 text-sm text-slate-300"
                    >
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>

                <Link
                  href={
                    tier.name === "Institutional"
                      ? "mailto:weem257@gmail.com?subject=Neural Trading OS — Institutional"
                      : isAuthenticated
                      ? `/billing?plan=${tier.name.toLowerCase()}`
                      : `/register?plan=${tier.name.toLowerCase()}`
                  }
                  className={`
                    w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2
                    ${
                      tier.highlight
                        ? "bg-cyan-500 text-black hover:bg-cyan-400 shadow-[0_0_20px_rgba(0,212,255,0.4)]"
                        : "border border-slate-600 text-white hover:border-slate-400"
                    }
                  `}
                >
                  {tier.cta}
                </Link>
              </div>
            ))}
          </div>
        </section>

        {/* ----------------------------------------------------------------- */}
        {/* Feature Comparison Table */}
        {/* ----------------------------------------------------------------- */}
        <section className="px-6 py-16 max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-xs font-bold tracking-widest text-cyan-500 mb-3">PLAN-VERGLEICH</p>
            <h2 className="text-2xl sm:text-3xl font-black text-white">Was ist in jedem Plan enthalten?</h2>
          </div>
          <div className="overflow-x-auto rounded-2xl" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                  <th className="text-left px-5 py-4 text-slate-400 font-semibold w-2/5">Feature</th>
                  {[
                    { name: "Free", color: "#94a3b8" },
                    { name: "Basic", color: "#00D4FF" },
                    { name: "Pro", color: "#A78BFA" },
                    { name: "Institutional", color: "#FFAA00" },
                  ].map(({ name, color }) => (
                    <th key={name} className="text-center px-4 py-4 font-bold" style={{ color }}>{name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { feature: "KI-Signale pro Tag",     free: "3",    basic: "10",   pro: "50",    inst: "∞" },
                  { feature: "Claude Sonnet Multi-Agenten-Konsens", free: "✓", basic: "✓", pro: "✓", inst: "✓" },
                  { feature: "Elliott-Wave-Analyse",  free: "✓",    basic: "✓",   pro: "✓",    inst: "✓" },
                  { feature: "Batch-Scan (bis 10 Ticker)", free: "✓", basic: "✓", pro: "✓",   inst: "✓" },
                  { feature: "Telegram-Bot & Alerts", free: "✓",    basic: "✓",   pro: "✓",    inst: "✓" },
                  { feature: "Backtesting (Crypto/Aktien)", free: "✓", basic: "✓", pro: "✓",  inst: "✓" },
                  { feature: "Portfolio-Tracking",    free: "✓",    basic: "✓",   pro: "✓",    inst: "✓" },
                  { feature: "Signal-Marktplatz",     free: "Ansehen", basic: "✓", pro: "✓",   inst: "✓" },
                  { feature: "Erweiterte KI-Analyse (Deep Mode)", free: "—", basic: "✓", pro: "✓", inst: "✓" },
                  { feature: "Signalhistorie (unbegrenzt)", free: "30 Tage", basic: "90 Tage", pro: "1 Jahr", inst: "Unbegrenzt" },
                  { feature: "Preis / Monat",         free: "€0",   basic: "€29",  pro: "€99",   inst: "€299" },
                ].map(({ feature, free, basic, pro, inst }, rowIdx) => (
                  <tr
                    key={feature}
                    style={{
                      background: rowIdx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)",
                      borderBottom: "1px solid rgba(255,255,255,0.05)",
                    }}
                  >
                    <td className="px-5 py-3.5 text-slate-300 font-medium">{feature}</td>
                    {[free, basic, pro, inst].map((val, colIdx) => {
                      const isCheck = val === "✓";
                      const isDash = val === "—";
                      const colors = ["#94a3b8", "#00D4FF", "#A78BFA", "#FFAA00"];
                      return (
                        <td key={colIdx} className="text-center px-4 py-3.5">
                          {isCheck ? (
                            <span style={{ color: colors[colIdx], fontSize: "1.1rem" }}>✓</span>
                          ) : isDash ? (
                            <span className="text-slate-600">—</span>
                          ) : (
                            <span style={{ color: colors[colIdx], fontWeight: 600 }}>{val}</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-center mt-6">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all"
              style={{
                background: "rgba(0,212,255,0.12)",
                border: "1px solid rgba(0,212,255,0.35)",
                color: "#00D4FF",
              }}
            >
              Kostenlos starten — kein Upgrade nötig →
            </Link>
          </p>
        </section>

        {/* ----------------------------------------------------------------- */}
        {/* Testimonials */}
        {/* ----------------------------------------------------------------- */}
        <section className="px-6 py-20">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <p className="text-xs font-bold tracking-widest text-cyan-500 mb-3">NUTZERSTIMMEN</p>
              <h2 className="text-3xl font-black text-white">Was Trader sagen</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                {
                  name: "Markus T.",
                  role: "Privatanleger · seit 8 Jahren",
                  initials: "MT",
                  color: "#00D4FF",
                  stars: 5,
                  quote: "Der Batch-Scan ist ein Game-Changer. Ich scanne morgens 8 Titel in 60 Sekunden und habe eine klare Entscheidungsgrundlage. Das Free-Kontingent reicht für meine 3 täglichen Setups vollkommen aus.",
                },
                {
                  name: "Sandra K.",
                  role: "Swing-Traderin · Vollzeit",
                  initials: "SK",
                  color: "#00FF88",
                  stars: 5,
                  quote: "Die KI-Begründung hinter jedem Signal macht den Unterschied. Ich verstehe warum — nicht nur was. Elliott-Wave-Erkennung und Sentiment in einem Dashboard, dafür hatte ich früher drei Tools.",
                },
                {
                  name: "Florian B.",
                  role: "Berufseinsteiger · ETF & Aktien",
                  initials: "FB",
                  color: "#7B2FFF",
                  stars: 5,
                  quote: "Als Anfänger war ich skeptisch, aber die Signalhistorie und die Konfidenz-Scores helfen mir echte Muster zu erkennen. Telegram-Alerts laufen zuverlässig — Upgrade auf Basic war sofort die richtige Entscheidung.",
                },
              ].map(({ name, role, initials, color, stars, quote }) => (
                <div
                  key={name}
                  className="p-6 rounded-2xl flex flex-col gap-4"
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.07)",
                    backdropFilter: "blur(12px)",
                  }}
                >
                  {/* Stars */}
                  <div className="flex gap-0.5">
                    {Array.from({ length: stars }).map((_, i) => (
                      <svg key={i} className="w-4 h-4" fill={color} viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    ))}
                  </div>
                  {/* Quote */}
                  <p className="text-sm text-slate-300 leading-relaxed flex-1">&ldquo;{quote}&rdquo;</p>
                  {/* Author */}
                  <div className="flex items-center gap-3 pt-2 border-t border-slate-800">
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                      style={{ background: `${color}20`, border: `1px solid ${color}40`, color }}
                    >
                      {initials}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">{name}</p>
                      <p className="text-xs text-slate-500">{role}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ----------------------------------------------------------------- */}
        {/* Live Demo Signal Preview */}
        {/* ----------------------------------------------------------------- */}
        <LandingDemoPreview />

        {/* ----------------------------------------------------------------- */}
        {/* FAQ */}
        {/* ----------------------------------------------------------------- */}
        <LandingFaq />

        {/* ----------------------------------------------------------------- */}
        {/* Waitlist */}
        {/* ----------------------------------------------------------------- */}
        <section className="px-6 py-20">
          <div className="max-w-2xl mx-auto text-center">
            <div className="p-10 rounded-3xl border border-slate-800 bg-slate-900/40 backdrop-blur-sm">
              <h2 className="text-3xl font-black text-white mb-3">
                Frühen Zugang sichern
              </h2>
              <p className="text-slate-400 mb-2">
                Kostenloser Free-Plan verfügbar. Keine Kreditkarte erforderlich.
                Einfach starten und upgraden wenn du bereit bist.
              </p>
              {count !== null && count > 0 && (
                <p className="text-cyan-400 text-sm font-medium mb-6">
                  {count} Trader{count === 1 ? "" : ""} bereits dabei
                </p>
              )}
              {!count && <div className="mb-6" />}

              {joined ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="flex items-center gap-2 text-emerald-400 text-lg font-medium">
                    <CheckCircle2 className="w-6 h-6" />
                    {joinMessage || "Du bist auf der Liste. Wir melden uns."}
                  </div>
                  {count !== null && (
                    <p className="text-slate-500 text-sm">
                      Du bist Nummer #{count} auf der Liste.
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && !joining && consentChecked && handleWaitlist()}
                      placeholder="you@example.com"
                      disabled={joining}
                      className="flex-1 px-4 py-3 rounded-xl border border-slate-700 bg-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors disabled:opacity-50"
                    />
                    <button
                      onClick={handleWaitlist}
                      disabled={joining || !email.includes("@") || !consentChecked}
                      className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-cyan-500 text-black font-bold hover:bg-cyan-400 transition-all whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {joining ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Eintragen…
                        </>
                      ) : "Eintragen"}
                    </button>
                  </div>
                  {/* DSGVO consent checkbox */}
                  <label className="flex items-start gap-2.5 cursor-pointer text-left">
                    <input
                      type="checkbox"
                      checked={consentChecked}
                      onChange={(e) => setConsentChecked(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded border-slate-600 bg-slate-800 text-cyan-500 cursor-pointer flex-shrink-0"
                    />
                    <span className="text-xs text-slate-500 leading-relaxed">
                      Ich stimme der Verarbeitung meiner E-Mail-Adresse gemäß der{" "}
                      <Link href="/datenschutz" className="text-cyan-400 hover:underline">
                        Datenschutzerklärung
                      </Link>{" "}
                      zu und akzeptiere die{" "}
                      <Link href="/agb" className="text-cyan-400 hover:underline">
                        AGB
                      </Link>
                      . Abmeldung jederzeit möglich.
                    </span>
                  </label>
                  {joinMessage && (
                    <p className="text-red-400 text-sm text-left">{joinMessage}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ----------------------------------------------------------------- */}
        {/* Footer */}
        {/* ----------------------------------------------------------------- */}
        <footer className="px-6 py-10 border-t border-slate-800">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-slate-500 text-sm">
              <BarChart3 className="w-4 h-4 text-cyan-400" />
              Neural Trading OS v0.8.0 — MIT License
            </div>
            <div className="flex items-center gap-6 text-sm text-slate-500">
              <a
                href="https://github.com/weem257-debug/neural-trading-os"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 hover:text-white transition-colors"
              >
                <Github className="w-4 h-4" />
                GitHub
              </a>
              <a href={`${API_BASE}/docs`} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                API Docs
              </a>
              <span>
                Built with{" "}
                <a
                  href="https://anthropic.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cyan-400 hover:text-cyan-300 transition-colors"
                >
                  Claude Sonnet 4.6
                </a>
              </span>
            </div>
          </div>
          <div className="max-w-7xl mx-auto mt-4 pt-4 border-t border-slate-800/50 flex items-center justify-center gap-5 text-xs text-slate-600">
            <Link href="/impressum" className="hover:text-slate-400 transition-colors">Impressum</Link>
            <Link href="/datenschutz" className="hover:text-slate-400 transition-colors">Datenschutz</Link>
            <Link href="/agb" className="hover:text-slate-400 transition-colors">AGB</Link>
            <Link href="/performance" className="hover:text-slate-400 transition-colors">Performance</Link>
            <span className="text-slate-700">·</span>
            <span className="text-slate-700">Keine Anlageberatung — nur zu Informationszwecken</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
