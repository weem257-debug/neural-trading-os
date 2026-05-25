"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  Brain,
  TrendingUp,
  FlaskConical,
  Briefcase,
  Zap,
  BarChart3,
  Shield,
  Github,
  ArrowRight,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { API_BASE } from "@/lib/api";

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
    title: "Multi-Agent AI Signals",
    description:
      "TradingAgents framework with claude-sonnet-4-6 consensus — Fundamental, Technical, and Sentiment agents vote on every trade.",
    color: "from-cyan-500/20 to-blue-500/20",
    border: "border-cyan-500/30",
  },
  {
    icon: TrendingUp,
    title: "Live Sentiment Analysis",
    description:
      "FinGPT + yfinance News ingestion. Real-time NLP scoring for any ticker — positive, negative, or neutral with confidence.",
    color: "from-emerald-500/20 to-teal-500/20",
    border: "border-emerald-500/30",
  },
  {
    icon: FlaskConical,
    title: "Backtesting Engine",
    description:
      "MA-Crossover, RSI Mean-Reversion, Buy-and-Hold across Jesse, Qlib, and Vibe-Trading — 300+ indicators, 452 alpha factors.",
    color: "from-violet-500/20 to-purple-500/20",
    border: "border-violet-500/30",
  },
  {
    icon: Briefcase,
    title: "Paper Trading",
    description:
      "100k virtual capital. Instant order execution via Nautilus Trader. Switch to live trading with a single flag — safety-gated.",
    color: "from-amber-500/20 to-orange-500/20",
    border: "border-amber-500/30",
  },
  {
    icon: Zap,
    title: "Real-time WebSocket",
    description:
      "Live prices, portfolio updates, signal streams, and risk alerts — all via WebSocket channels, no page refresh needed.",
    color: "from-yellow-500/20 to-amber-500/20",
    border: "border-yellow-500/30",
  },
  {
    icon: Shield,
    title: "Risk Management",
    description:
      "VaR 95/99, Max Drawdown, position concentration alerts, and daily stop-loss enforcement — institutional-grade guard rails.",
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
    period: "/ month",
    description: "Perfect for retail traders getting started with AI signals.",
    features: [
      "5 Tickers monitored",
      "10 AI Signals per day",
      "Paper Trading (100k virtual)",
      "Live Sentiment Feed",
      "WebSocket Dashboard",
    ],
    cta: "Start Free Trial",
    highlight: false,
    border: "border-slate-700",
    glow: "",
  },
  {
    name: "Pro",
    price: "99",
    period: "/ month",
    description: "For serious traders who want the full AI cockpit.",
    features: [
      "Unlimited Tickers",
      "50 AI Signals per day",
      "Full Backtesting Suite",
      "Fundamental Analysis",
      "API Access (1000 req/day)",
      "Priority Support",
    ],
    cta: "Start Pro Trial",
    highlight: true,
    border: "border-cyan-500",
    glow: "shadow-[0_0_40px_rgba(0,212,255,0.25)]",
  },
  {
    name: "Institutional",
    price: "299",
    period: "/ month",
    description: "White-label ready. Built for funds and fintech teams.",
    features: [
      "Everything in Pro",
      "Unlimited API Access",
      "White-Label Dashboard",
      "Custom Signal Models",
      "SLA 99.9% Uptime",
      "Dedicated Account Manager",
    ],
    cta: "Contact Sales",
    highlight: false,
    border: "border-violet-700",
    glow: "",
  },
];

// ---------------------------------------------------------------------------
// Main Landing Page
// ---------------------------------------------------------------------------
export default function LandingPage() {
  const [email, setEmail] = useState("");
  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joinMessage, setJoinMessage] = useState("");
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/waitlist/count`)
      .then((r) => r.json())
      .then((d) => setCount(d.count))
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
        setJoinMessage(data.message ?? "You are on the list.");
        setCount(data.position ?? null);
      } else {
        setJoinMessage(data.detail ?? "Something went wrong. Please try again.");
      }
    } catch {
      setJoinMessage("Could not connect to server. Please try again.");
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-[#030712] overflow-x-hidden">
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
              href="/dashboard"
              className="px-4 py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 transition-all text-sm font-medium"
            >
              Launch Dashboard
            </a>
          </div>
        </nav>

        {/* ----------------------------------------------------------------- */}
        {/* Hero */}
        {/* ----------------------------------------------------------------- */}
        <section className="px-6 pt-20 pb-24 text-center max-w-5xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-cyan-500/30 bg-cyan-500/5 text-cyan-400 text-xs font-medium mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            Powered by Claude Sonnet 4.6 + 9 Trading Engines
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
            <span className="text-white">Multi-agent signals</span>,{" "}
            <span className="text-white">live sentiment</span>,{" "}
            <span className="text-white">backtesting</span>, and{" "}
            <span className="text-white">paper trading</span> — all in one
            real-time dashboard.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="/dashboard"
              className="group flex items-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold text-lg hover:from-cyan-400 hover:to-blue-500 transition-all shadow-[0_0_30px_rgba(0,212,255,0.3)] hover:shadow-[0_0_50px_rgba(0,212,255,0.5)]"
            >
              Launch Dashboard
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </a>
            <a
              href="https://github.com/weem257-debug/neural-trading-os"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-8 py-4 rounded-xl border border-slate-700 text-slate-300 font-medium text-lg hover:border-slate-500 hover:text-white transition-all"
            >
              <Github className="w-5 h-5" />
              Star on GitHub
            </a>
          </div>

          {/* Stats row */}
          <div className="flex flex-wrap justify-center gap-8 mt-16 text-center">
            {[
              { label: "Trading Engines", value: "9" },
              { label: "AI Agents", value: "5" },
              { label: "Tests Passing", value: "159" },
              { label: "Paper Capital", value: "100K" },
            ].map((stat) => (
              <div key={stat.label}>
                <div className="text-3xl font-black text-white">{stat.value}</div>
                <div className="text-sm text-slate-500 mt-1">{stat.label}</div>
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
              Everything you need to trade smarter
            </h2>
            <p className="text-slate-400 text-lg max-w-2xl mx-auto">
              9 specialized open-source repos, unified into one production-grade
              platform. No setup complexity. Just trading intelligence.
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
        {/* Pricing */}
        {/* ----------------------------------------------------------------- */}
        <section className="px-6 py-20 max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-black text-white mb-4">
              Simple, transparent pricing
            </h2>
            <p className="text-slate-400 text-lg">
              Start free. Upgrade when you are ready to trade seriously.
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
                      MOST POPULAR
                    </span>
                  </div>
                )}

                <div className="mb-6">
                  <h3 className="text-lg font-bold text-white mb-1">
                    {tier.name}
                  </h3>
                  <div className="flex items-baseline gap-1 mb-2">
                    <span className="text-4xl font-black text-white">
                      EUR {tier.price}
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
                  href={tier.name === "Institutional" ? "mailto:weem257@gmail.com?subject=Neural Trading OS — Institutional" : "#waitlist"}
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
        {/* Waitlist */}
        {/* ----------------------------------------------------------------- */}
        <section className="px-6 py-20">
          <div className="max-w-2xl mx-auto text-center">
            <div className="p-10 rounded-3xl border border-slate-800 bg-slate-900/40 backdrop-blur-sm">
              <h2 className="text-3xl font-black text-white mb-3">
                Join the waitlist
              </h2>
              <p className="text-slate-400 mb-2">
                Early access. 30% off for the first 100 subscribers. No spam,
                unsubscribe anytime.
              </p>
              {count !== null && count > 0 && (
                <p className="text-cyan-400 text-sm font-medium mb-6">
                  {count} trader{count === 1 ? "" : "s"} already signed up
                </p>
              )}
              {!count && <div className="mb-6" />}

              {joined ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="flex items-center gap-2 text-emerald-400 text-lg font-medium">
                    <CheckCircle2 className="w-6 h-6" />
                    {joinMessage || "You are on the list. We will be in touch."}
                  </div>
                  {count !== null && (
                    <p className="text-slate-500 text-sm">
                      You are #{count} on the list.
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
                      onKeyDown={(e) => e.key === "Enter" && !joining && handleWaitlist()}
                      placeholder="you@example.com"
                      disabled={joining}
                      className="flex-1 px-4 py-3 rounded-xl border border-slate-700 bg-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors disabled:opacity-50"
                    />
                    <button
                      onClick={handleWaitlist}
                      disabled={joining || !email.includes("@")}
                      className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-cyan-500 text-black font-bold hover:bg-cyan-400 transition-all whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {joining ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Joining…
                        </>
                      ) : "Join Waitlist"}
                    </button>
                  </div>
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
              Neural Trading OS v0.7.0 — MIT License
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
        </footer>
      </div>
    </div>
  );
}
