"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Check, Zap, Shield, Crown, TrendingUp, BarChart2,
  Brain, ArrowRight, Star, Cpu,
} from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import Link from "next/link";

const PLANS = [
  {
    id: "basic",
    name: "Basic",
    price: 29,
    period: "mo",
    color: "cyan",
    icon: TrendingUp,
    badge: null,
    description: "For active retail traders getting started with AI signals.",
    features: [
      "5 watched tickers",
      "10 AI signals per day",
      "Paper trading (100k virtual)",
      "Real-time WebSocket prices",
      "Price alerts (DB-backed)",
      "News sentiment analysis",
      "Basic risk metrics (VaR, Drawdown)",
    ],
    cta: "Start Free Trial",
    ctaHref: "/landing#waitlist",
  },
  {
    id: "pro",
    name: "Pro",
    price: 99,
    period: "mo",
    color: "purple",
    icon: Brain,
    badge: "Most Popular",
    description: "For serious traders who want the full AI toolkit.",
    features: [
      "Unlimited tickers",
      "50 AI signals per day (Claude Sonnet)",
      "Backtesting: Jesse + Qlib + Vibe-Trading",
      "Multi-portfolio (stocks, crypto, P2P)",
      "Self-learning AI (RAG feedback loop)",
      "P2P portfolio tracking (Mintos, Bondora)",
      "Advanced risk: Sharpe, concentration alerts",
      "Webhook integrations",
      "Priority support",
    ],
    cta: "Start Free Trial",
    ctaHref: "/landing#waitlist",
  },
  {
    id: "institutional",
    name: "Institutional",
    price: 299,
    period: "mo",
    color: "pink",
    icon: Crown,
    badge: "Enterprise",
    description: "White-label API access for fintechs and trading desks.",
    features: [
      "Everything in Pro",
      "REST API access (rate-limited)",
      "White-label dashboard",
      "Custom signal model fine-tuning",
      "Live trading: Nautilus Trader (15+ brokers)",
      "SLA 99.9% uptime",
      "Dedicated onboarding",
      "Custom integrations on request",
    ],
    cta: "Contact Sales",
    ctaHref: "mailto:weem257@gmail.com?subject=Neural Trading OS — Institutional",
  },
];

const SIGNAL_MARKETPLACE = {
  price: 19,
  signals: 10,
  tickers: ["AAPL", "MSFT", "NVDA", "TSLA", "META", "AMD", "BTC", "ETH"],
  features: [
    "10 AI signals/day (TradingAgents multi-agent consensus)",
    "Win-rate, Sharpe, Max-Drawdown track record",
    "No dashboard required — signals via API or email",
    "Upsell path into full dashboard",
  ],
};

const colorMap: Record<string, { border: string; glow: string; text: string; bg: string; badge: string }> = {
  cyan: {
    border: "rgba(0,212,255,0.35)",
    glow: "0 0 40px rgba(0,212,255,0.1)",
    text: "#00D4FF",
    bg: "rgba(0,212,255,0.08)",
    badge: "rgba(0,212,255,0.15)",
  },
  purple: {
    border: "rgba(123,47,255,0.5)",
    glow: "0 0 60px rgba(123,47,255,0.2)",
    text: "#7B2FFF",
    bg: "rgba(123,47,255,0.1)",
    badge: "rgba(123,47,255,0.2)",
  },
  pink: {
    border: "rgba(255,0,128,0.35)",
    glow: "0 0 40px rgba(255,0,128,0.1)",
    text: "#FF0080",
    bg: "rgba(255,0,128,0.08)",
    badge: "rgba(255,0,128,0.15)",
  },
};

export default function PricingPage() {
  const [annual, setAnnual] = useState(false);
  const discount = 0.17; // ~2 months free

  return (
    <div className="min-h-screen p-6 md:p-10" style={{ background: "rgba(8,11,20,0.98)" }}>
      {/* Header */}
      <div className="max-w-5xl mx-auto mb-12 text-center">
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-4"
            style={{ background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.2)" }}>
            <Cpu className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-xs font-semibold text-cyan-400 tracking-wider">NEURAL TRADING OS</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-3">
            Pricing Plans
          </h1>
          <p className="text-slate-400 text-base max-w-xl mx-auto">
            9 AI trading engines, live Claude signals, real-time WebSocket dashboard.
            Start free — upgrade when you&apos;re ready.
          </p>
        </motion.div>

        {/* Annual toggle */}
        <motion.div
          className="flex items-center justify-center gap-3 mt-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <span className={`text-sm font-medium ${!annual ? "text-white" : "text-slate-500"}`}>Monthly</span>
          <button
            onClick={() => setAnnual((v) => !v)}
            className="relative w-11 h-6 rounded-full transition-colors duration-200"
            style={{ background: annual ? "#7B2FFF" : "rgba(255,255,255,0.1)" }}
          >
            <span
              className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform duration-200"
              style={{ transform: annual ? "translateX(22px)" : "translateX(2px)" }}
            />
          </button>
          <span className={`text-sm font-medium ${annual ? "text-white" : "text-slate-500"}`}>
            Annual
            <span className="ml-1.5 text-xs font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: "rgba(0,255,136,0.15)", color: "#00FF88" }}>
              −17%
            </span>
          </span>
        </motion.div>
      </div>

      {/* Plan cards */}
      <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-5 mb-14">
        {PLANS.map((plan, i) => {
          const c = colorMap[plan.color];
          const Icon = plan.icon;
          const displayPrice = annual ? Math.round(plan.price * (1 - discount)) : plan.price;

          return (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.1 }}
              className="relative flex flex-col rounded-2xl overflow-hidden"
              style={{
                background: "linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)",
                border: `1px solid ${c.border}`,
                boxShadow: c.glow,
              }}
            >
              {plan.badge && (
                <div
                  className="absolute top-3 right-3 text-xs font-bold px-2 py-1 rounded-full"
                  style={{ background: c.badge, color: c.text }}
                >
                  {plan.badge}
                </div>
              )}

              <div className="p-5 flex-1">
                {/* Plan header */}
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ background: c.bg, border: `1px solid ${c.border}` }}>
                    <Icon className="w-4 h-4" style={{ color: c.text }} />
                  </div>
                  <span className="text-base font-bold text-white">{plan.name}</span>
                </div>

                <p className="text-xs text-slate-500 mb-4 leading-relaxed">{plan.description}</p>

                {/* Price */}
                <div className="mb-5">
                  <span className="text-4xl font-bold text-white">€{displayPrice}</span>
                  <span className="text-slate-500 text-sm ml-1">/{plan.period}</span>
                  {annual && (
                    <div className="text-xs text-slate-600 mt-0.5 line-through">€{plan.price}/mo</div>
                  )}
                </div>

                {/* Features */}
                <ul className="space-y-2.5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-slate-300">
                      <Check className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: c.text }} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* CTA */}
              <div className="p-5 pt-0">
                <Link
                  href={plan.ctaHref}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200"
                  style={{
                    background: plan.id === "pro" ? c.text : c.bg,
                    border: `1px solid ${c.border}`,
                    color: plan.id === "pro" ? "#fff" : c.text,
                  }}
                >
                  {plan.cta}
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Signal Marketplace add-on */}
      <div className="max-w-5xl mx-auto mb-14">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <GlassCard variant="green" padding="p-6">
            <div className="flex flex-col md:flex-row gap-6 items-start">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="w-4 h-4 text-neon-green" />
                  <span className="text-sm font-bold text-neon-green tracking-wider">SIGNAL MARKETPLACE</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-neon-green/10 text-neon-green font-semibold">Add-on</span>
                </div>
                <h3 className="text-lg font-bold text-white mb-1">
                  Verified AI Signals — €{SIGNAL_MARKETPLACE.price}/mo
                </h3>
                <p className="text-sm text-slate-400 mb-4">
                  {SIGNAL_MARKETPLACE.signals} signals/day via TradingAgents multi-agent consensus (Fundamental + Technical + Sentiment + Risk).
                  No full dashboard required.
                </p>
                <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {SIGNAL_MARKETPLACE.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-slate-300">
                      <Check className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-neon-green" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex flex-col gap-3 min-w-[160px]">
                <div>
                  <div className="text-xs text-slate-500 mb-1">Covered tickers</div>
                  <div className="flex flex-wrap gap-1">
                    {SIGNAL_MARKETPLACE.tickers.map((t) => (
                      <span key={t} className="text-xs px-1.5 py-0.5 rounded font-mono"
                        style={{ background: "rgba(0,255,136,0.1)", color: "#00FF88" }}>
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
                <Link
                  href="/landing#waitlist"
                  className="flex items-center justify-center gap-1.5 py-2 px-4 rounded-xl text-sm font-semibold transition-all duration-200"
                  style={{
                    background: "rgba(0,255,136,0.15)",
                    border: "1px solid rgba(0,255,136,0.3)",
                    color: "#00FF88",
                  }}
                >
                  Join Waitlist
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </GlassCard>
        </motion.div>
      </div>

      {/* FAQ */}
      <div className="max-w-3xl mx-auto mb-10">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          <h2 className="text-lg font-bold text-white mb-5 text-center">Frequently Asked Questions</h2>
          <div className="space-y-3">
            {[
              {
                q: "Is there a free trial?",
                a: "Yes — all plans start with a 14-day free trial. No credit card required during the trial period.",
              },
              {
                q: "What AI model powers the signals?",
                a: "Claude Sonnet 4.6 (deep analysis) for Pro/Institutional, Claude Haiku 4.5 (fast) for Basic daily signals. Both run TradingAgents multi-agent consensus: Fundamental + Technical + Sentiment + News + Risk agents.",
              },
              {
                q: "Can I switch from paper trading to live trading?",
                a: "Yes — live trading is available on Pro and Institutional via Nautilus Trader (15+ brokers). A safety-gated switch prevents accidental live execution.",
              },
              {
                q: "How is billing handled?",
                a: "Monthly or annual billing via Stripe. Cancel any time — no lock-in.",
              },
              {
                q: "What data sources are used?",
                a: "Live market data via yfinance (prices, OHLCV), news sentiment via FinGPT NLP, and P2P data from Mintos/Bondora/PeerBerry APIs.",
              },
            ].map(({ q, a }) => (
              <div key={q} className="rounded-xl p-4"
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.07)",
                }}>
                <div className="flex items-start gap-2 mb-1.5">
                  <Star className="w-3.5 h-3.5 mt-0.5 text-cyan-400 flex-shrink-0" />
                  <span className="text-sm font-semibold text-white">{q}</span>
                </div>
                <p className="text-sm text-slate-400 ml-5.5 leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Bottom CTA */}
      <div className="max-w-xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="rounded-2xl p-8"
          style={{
            background: "linear-gradient(135deg, rgba(0,212,255,0.08), rgba(123,47,255,0.08))",
            border: "1px solid rgba(0,212,255,0.15)",
          }}
        >
          <Shield className="w-8 h-8 mx-auto mb-3 text-cyan-400" />
          <h3 className="text-lg font-bold text-white mb-2">Ready to trade smarter?</h3>
          <p className="text-sm text-slate-400 mb-5">
            Join the waitlist for early-bird pricing — 30% off for the first 100 subscribers.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/landing#waitlist"
              className="flex items-center justify-center gap-2 py-2.5 px-5 rounded-xl text-sm font-bold transition-all duration-200"
              style={{
                background: "linear-gradient(135deg, #00D4FF, #7B2FFF)",
                color: "#fff",
                boxShadow: "0 0 20px rgba(0,212,255,0.3)",
              }}
            >
              <BarChart2 className="w-4 h-4" />
              Join Waitlist — Early Bird 30% Off
            </Link>
            <Link
              href="/dashboard"
              className="flex items-center justify-center gap-2 py-2.5 px-5 rounded-xl text-sm font-semibold text-slate-300 transition-all duration-200 hover:text-white"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            >
              Explore Demo
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
