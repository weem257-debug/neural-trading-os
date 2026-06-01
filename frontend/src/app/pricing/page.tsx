"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check, Zap, Shield, Crown, TrendingUp,
  Brain, ArrowRight, ChevronDown, Cpu, BadgeCheck,
} from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import Link from "next/link";
import { useAuthStore } from "@/store/authStore";

const PLANS = [
  {
    id: "free",
    name: "Free",
    price: 0,
    period: "Mo.",
    color: "green",
    icon: Zap,
    badge: null,
    description: "Dauerhaft kostenlos. Keine Kreditkarte erforderlich.",
    features: [
      "3 KI-Signale pro Tag",
      "Paper Trading (100k virtuell)",
      "Portfolio-Tracking",
      "Echtzeit WebSocket-Kurse",
      "Signal-Marktplatz (Lesezugriff)",
    ],
    cta: "Kostenlos registrieren",
    ctaHref: "/register",
  },
  {
    id: "basic",
    name: "Basic",
    price: 29,
    period: "Mo.",
    color: "cyan",
    icon: TrendingUp,
    badge: null,
    description: "Für aktive Retail-Trader, die mit KI-Signalen starten.",
    features: [
      "5 beobachtete Ticker",
      "10 KI-Signale täglich",
      "Paper Trading (100k virtuell)",
      "Echtzeit WebSocket-Kurse",
      "Preisalarme (DB-gespeichert)",
      "News-Sentiment-Analyse",
      "Basis-Risikokennzahlen (VaR, Drawdown)",
    ],
    cta: "Jetzt abonnieren",
    ctaHref: "/billing",
  },
  {
    id: "pro",
    name: "Pro",
    price: 99,
    period: "Mo.",
    color: "purple",
    icon: Brain,
    badge: "Beliebtester Plan",
    description: "Für ernsthafte Trader, die das volle KI-Toolkit nutzen wollen.",
    features: [
      "Unbegrenzte Ticker",
      "50 KI-Signale täglich (Claude Sonnet)",
      "Backtesting: Jesse + Qlib + Vibe-Trading",
      "Multi-Portfolio (Aktien, Krypto, P2P)",
      "Selbstlernende KI (RAG-Feedback-Loop)",
      "P2P-Portfolio-Tracking (Mintos, Bondora)",
      "Erweitertes Risiko: Sharpe, Konzentrations-Alerts",
      "Webhook-Integrationen",
      "Prioritäts-Support",
    ],
    cta: "Jetzt abonnieren",
    ctaHref: "/billing",
  },
  {
    id: "institutional",
    name: "Institutional",
    price: 299,
    period: "Mo.",
    color: "pink",
    icon: Crown,
    badge: "Enterprise",
    description: "White-Label-API-Zugang für FinTechs und Trading-Desks.",
    features: [
      "Alles aus Pro",
      "REST-API-Zugang (rate-limited)",
      "White-Label-Dashboard",
      "Custom Signal-Modell-Fine-Tuning",
      "Live-Trading: Nautilus Trader (15+ Broker)",
      "SLA 99,9 % Uptime",
      "Dediziertes Onboarding",
      "Individuelle Integrationen auf Anfrage",
    ],
    cta: "Vertrieb kontaktieren",
    ctaHref: "mailto:weem257@gmail.com?subject=Neural Trading OS — Institutional",
  },
];

const SIGNAL_MARKETPLACE = {
  price: 19,
  signals: 10,
  tickers: ["AAPL", "MSFT", "NVDA", "TSLA", "META", "AMD", "GOOGL", "AMZN", "BTC", "ETH", "SPY", "QQQ"],
  features: [
    "10 KI-Signale/Tag (TradingAgents Multi-Agenten-Konsens)",
    "Trefferquote, Sharpe, Max-Drawdown Track Record",
    "Kein Dashboard erforderlich — Signale via API oder E-Mail",
    "Upgrade-Pfad in das volle Dashboard",
  ],
};

const colorMap: Record<string, { border: string; glow: string; text: string; bg: string; badge: string }> = {
  green: {
    border: "rgba(0,255,136,0.3)",
    glow: "0 0 30px rgba(0,255,136,0.08)",
    text: "#00FF88",
    bg: "rgba(0,255,136,0.07)",
    badge: "rgba(0,255,136,0.15)",
  },
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

const FAQ_ITEMS = [
  {
    q: "Gibt es einen kostenlosen Einstieg?",
    a: "Ja — der Free-Plan ist dauerhaft kostenlos und enthält 3 KI-Signale pro Tag, Paper Trading und alle Dashboard-Funktionen. Keine Kreditkarte erforderlich. Jederzeit kostenpflichtig upgraden.",
  },
  {
    q: "Welches KI-Modell steckt hinter den Signalen?",
    a: "Claude Sonnet 4.6 (Tiefenanalyse) für Pro/Institutional, Claude Haiku 4.5 (schnell) für Basic. Beide nutzen den TradingAgents Multi-Agenten-Konsens: Fundamental-, Technisch-, Sentiment-, News- und Risiko-Agent arbeiten parallel.",
  },
  {
    q: "Kann ich von Paper Trading auf Live Trading wechseln?",
    a: "Ja — Live Trading ist auf Pro und Institutional via Nautilus Trader (15+ Broker) verfügbar. Ein Safety-Gate verhindert versehentliche Live-Ausführung.",
  },
  {
    q: "Wie läuft die Abrechnung ab?",
    a: "Monatlich oder jährlich (2 Monate gratis) via Stripe. Jederzeit kündbar — keine Mindestlaufzeit. Zahlungsdaten werden ausschließlich von Stripe gespeichert.",
  },
  {
    q: "Welche Datenquellen werden genutzt?",
    a: "Live-Kurse via yfinance (OHLCV), News-Sentiment via FinGPT NLP, P2P-Daten von Mintos, Bondora und PeerBerry, Broker-Integration via FinTS/Comdirect/BitPanda.",
  },
  {
    q: "Ist das eine Anlageberatung?",
    a: "Nein. Neural Trading OS ist ein Informations- und Analysetool. Alle Signale und Analysen dienen ausschließlich Informationszwecken und ersetzen keine individuelle Anlageberatung (§ 2 Abs. 1 WpHG).",
  },
];

function FaqAccordion() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className="space-y-2">
      {FAQ_ITEMS.map(({ q, a }, i) => (
        <div
          key={i}
          className="rounded-xl overflow-hidden"
          style={{ border: "1px solid rgba(255,255,255,0.07)" }}
        >
          <button
            onClick={() => setOpen(open === i ? null : i)}
            className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.02]"
            style={{ background: "rgba(255,255,255,0.03)" }}
          >
            <span className="text-sm font-semibold text-white">{q}</span>
            <ChevronDown
              className="w-4 h-4 text-slate-500 flex-shrink-0 transition-transform duration-200"
              style={{ transform: open === i ? "rotate(180deg)" : "rotate(0deg)" }}
            />
          </button>
          <AnimatePresence initial={false}>
            {open === i && (
              <motion.div
                key="content"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                style={{ overflow: "hidden" }}
              >
                <p className="px-4 pb-4 pt-1 text-sm text-slate-400 leading-relaxed">
                  {a}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );
}

export default function PricingPage() {
  const [annual, setAnnual] = useState(true);
  const discount = 0.17; // ~2 months free
  const tier = useAuthStore((s) => s.tier);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());

  const getPlanCta = (planId: string): { label: string; href: string; current: boolean } => {
    if (isAuthenticated && tier === planId) {
      return { label: "Verwalten", href: "/billing", current: true };
    }
    if (planId === "free") {
      return isAuthenticated
        ? { label: "Dashboard öffnen", href: "/dashboard", current: false }
        : { label: "Kostenlos registrieren", href: "/register", current: false };
    }
    if (planId === "institutional") {
      return { label: "Vertrieb kontaktieren", href: "mailto:weem257@gmail.com?subject=Neural Trading OS — Institutional", current: false };
    }
    return isAuthenticated
      ? { label: "Jetzt abonnieren", href: `/billing?plan=${planId}`, current: false }
      : { label: "Registrieren & abonnieren", href: `/register?plan=${planId}`, current: false };
  };

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
            Preispläne
          </h1>
          <p className="text-slate-400 text-base max-w-xl mx-auto">
            9 KI-Trading-Engines, Live Claude-Signale, Echtzeit-WebSocket-Dashboard.
            Kostenlos starten — jederzeit upgraden.
          </p>
        </motion.div>

        {/* Annual toggle */}
        <motion.div
          className="flex items-center justify-center gap-3 mt-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <span className={`text-sm font-medium ${!annual ? "text-white" : "text-slate-500"}`}>Monatlich</span>
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
            Jährlich
            <span className="ml-1.5 text-xs font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: "rgba(0,255,136,0.15)", color: "#00FF88" }}>
              −17%
            </span>
          </span>
        </motion.div>
      </div>

      {/* Plan cards */}
      <div className="max-w-6xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-14">
        {PLANS.map((plan, i) => {
          const c = colorMap[plan.color];
          const Icon = plan.icon;
          const displayPrice = annual ? Math.round(plan.price * (1 - discount)) : plan.price;
          const cta = getPlanCta(plan.id);
          const isCurrent = cta.current;

          return (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.1 }}
              className="relative flex flex-col rounded-2xl overflow-hidden"
              style={{
                background: isCurrent
                  ? `linear-gradient(135deg, ${c.bg} 0%, rgba(255,255,255,0.02) 100%)`
                  : "linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)",
                border: `1px solid ${isCurrent ? c.text : c.border}`,
                boxShadow: isCurrent ? `${c.glow}, 0 0 0 1px ${c.border}` : c.glow,
              }}
            >
              {isCurrent && (
                <div
                  className="absolute top-3 right-3 flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full"
                  style={{ background: c.badge, color: c.text, border: `1px solid ${c.border}` }}
                >
                  <BadgeCheck className="w-3 h-3" />
                  Aktueller Plan
                </div>
              )}
              {!isCurrent && plan.badge && (
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
                  {plan.id === "free" ? (
                    <>
                      <span className="text-4xl font-bold text-white">€0</span>
                      <span className="text-slate-500 text-sm ml-1">/dauerhaft</span>
                    </>
                  ) : (
                    <>
                      <span className="text-4xl font-bold text-white">€{displayPrice}</span>
                      <span className="text-slate-500 text-sm ml-1">/{plan.period}</span>
                      {annual && plan.price > 0 && (
                        <div className="text-xs text-slate-600 mt-0.5 line-through">€{plan.price}/Mo.</div>
                      )}
                    </>
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
                  href={cta.href}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200"
                  style={{
                    background: isCurrent ? c.bg : plan.id === "pro" ? c.text : c.bg,
                    border: `1px solid ${c.border}`,
                    color: isCurrent ? c.text : plan.id === "pro" ? "#fff" : c.text,
                    opacity: isCurrent ? 0.85 : 1,
                  }}
                >
                  {isCurrent && <BadgeCheck className="w-3.5 h-3.5" />}
                  {cta.label}
                  {!isCurrent && <ArrowRight className="w-3.5 h-3.5" />}
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
                  Verifizierte KI-Signale — €{SIGNAL_MARKETPLACE.price}/Monat
                </h3>
                <p className="text-sm text-slate-400 mb-4">
                  {SIGNAL_MARKETPLACE.signals} Signale/Tag via TradingAgents Multi-Agenten-Konsens (Fundamental + Technisch + Sentiment + Risiko).
                  Kein vollständiges Dashboard erforderlich.
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
                  <div className="text-xs text-slate-500 mb-1">Enthaltene Ticker</div>
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
                  href={isAuthenticated ? "/billing?plan=signals" : "/register?plan=signals"}
                  className="flex items-center justify-center gap-1.5 py-2 px-4 rounded-xl text-sm font-semibold transition-all duration-200"
                  style={{
                    background: "rgba(0,255,136,0.15)",
                    border: "1px solid rgba(0,255,136,0.3)",
                    color: "#00FF88",
                  }}
                >
                  Abonnieren
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
          <h2 className="text-lg font-bold text-white mb-5 text-center">Häufig gestellte Fragen</h2>
          <FaqAccordion />
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
          <h3 className="text-lg font-bold text-white mb-2">Intelligenter handeln?</h3>
          <p className="text-sm text-slate-400 mb-5">
            Starte kostenlos mit 3 KI-Signalen täglich — jederzeit upgraden. Monatliche Abrechnung, jederzeit kündbar.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/register"
              className="flex items-center justify-center gap-2 py-2.5 px-5 rounded-xl text-sm font-bold transition-all duration-200"
              style={{
                background: "linear-gradient(135deg, #00D4FF, #7B2FFF)",
                color: "#fff",
                boxShadow: "0 0 20px rgba(0,212,255,0.3)",
              }}
            >
              <Zap className="w-4 h-4" />
              Kostenlos registrieren
            </Link>
            <Link
              href="/dashboard"
              className="flex items-center justify-center gap-2 py-2.5 px-5 rounded-xl text-sm font-semibold text-slate-300 transition-all duration-200 hover:text-white"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            >
              Demo erkunden
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
