"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { X, ArrowRight, Layers, Zap, Send, CheckCircle, Brain } from "lucide-react";
import { useAuthStore } from "@/store/authStore";

const STORAGE_KEY = "onboarding_v1_done";

interface Step {
  icon: React.ElementType;
  color: string;
  title: string;
  description: string;
  cta: string;
  href: string;
}

const STEPS: Step[] = [
  {
    icon: Brain,
    color: "#00D4FF",
    title: "Willkommen bei Neural Trading OS",
    description:
      "KI-gestützte Trading-Signale, Live-Broker-Integration und automatisches Portfolio-Tracking — alles in einem Dashboard.",
    cta: "Los geht's",
    href: "",
  },
  {
    icon: Layers,
    color: "#7B2FFF",
    title: "Depot verbinden",
    description:
      "Verbinde dein Comdirect-, Flatex- oder BitPanda-Depot, damit dein Portfolio automatisch synchronisiert wird.",
    cta: "Broker einrichten",
    href: "/brokers",
  },
  {
    icon: Zap,
    color: "#00FF88",
    title: "Erstes Signal generieren",
    description:
      "Gib einen Ticker ein und lass 9 KI-Agenten gleichzeitig analysieren — inkl. Elliott Wave, Sentiment und Risikoanalyse.",
    cta: "Zum Signal-Generator",
    href: "/signals",
  },
  {
    icon: Send,
    color: "#FF0080",
    title: "Telegram-Alerts aktivieren",
    description:
      "Erhalte Trading-Signale, Preis-Alerts und Portfolio-Updates direkt auf dein Handy via Telegram.",
    cta: "Telegram konfigurieren",
    href: "/settings",
  },
];

export function OnboardingWizard() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated) return;
    const done = localStorage.getItem(STORAGE_KEY);
    if (!done) setVisible(true);
  }, [isAuthenticated]);

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, "1");
    setVisible(false);
  }

  function next() {
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      dismiss();
    }
  }

  function handleCta() {
    const href = STEPS[step].href;
    if (href) {
      dismiss();
      router.push(href);
    } else {
      next();
    }
  }

  if (!visible) return null;

  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          onClick={dismiss}
        />

        {/* Modal */}
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 16, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.97 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-md rounded-2xl p-8 z-10"
          style={{
            background: "linear-gradient(135deg, rgba(15,20,40,0.98) 0%, rgba(10,14,30,0.98) 100%)",
            border: `1px solid ${current.color}40`,
            boxShadow: `0 0 60px ${current.color}18`,
          }}
        >
          {/* Close */}
          <button
            onClick={dismiss}
            className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Step indicator */}
          <div className="flex items-center gap-1.5 mb-6">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className="rounded-full transition-all duration-300"
                style={{
                  width: i === step ? 20 : 6,
                  height: 6,
                  background: i <= step ? current.color : "rgba(255,255,255,0.1)",
                }}
              />
            ))}
          </div>

          {/* Icon */}
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5"
            style={{ background: `${current.color}18`, border: `1px solid ${current.color}35` }}
          >
            <Icon className="w-7 h-7" style={{ color: current.color }} />
          </div>

          {/* Content */}
          <h2 className="text-xl font-bold text-white mb-3">{current.title}</h2>
          <p className="text-sm text-slate-400 leading-relaxed mb-8">{current.description}</p>

          {/* Actions */}
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={dismiss}
              className="text-xs text-slate-600 hover:text-slate-400 transition-colors"
            >
              Überspringen
            </button>

            <div className="flex gap-2">
              {step > 0 && (
                <button
                  onClick={() => setStep((s) => s - 1)}
                  className="px-4 py-2 text-xs rounded-xl text-slate-400 hover:text-slate-200 transition-colors"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  Zurück
                </button>
              )}

              <button
                onClick={handleCta}
                className="flex items-center gap-1.5 px-5 py-2 text-xs font-semibold rounded-xl transition-all duration-200 hover:brightness-110"
                style={{
                  background: current.color,
                  color: "#000",
                }}
              >
                {isLast ? (
                  <><CheckCircle className="w-3.5 h-3.5" /> {current.cta}</>
                ) : (
                  <>{current.cta} <ArrowRight className="w-3.5 h-3.5" /></>
                )}
              </button>
            </div>
          </div>

          {/* Step count */}
          <p className="text-center text-xs text-slate-700 mt-5">
            {step + 1} von {STEPS.length}
          </p>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
