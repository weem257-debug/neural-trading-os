"use client";

import { useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, BookOpen } from "lucide-react";

export interface ExplanationContent {
  title: string;
  subtitle?: string;
  theory: string;
  diagram?: React.ReactNode;
  keyPoints: string[];
  practicalTip?: string;
  color?: "cyan" | "green" | "pink" | "purple" | "yellow";
}

interface ExplanationModalProps {
  open: boolean;
  onClose: () => void;
  content: ExplanationContent;
}

const COLOR_MAP = {
  cyan:   { accent: "#00D4FF", bg: "rgba(0,212,255,0.08)",   border: "rgba(0,212,255,0.2)"  },
  green:  { accent: "#00FF88", bg: "rgba(0,255,136,0.08)",   border: "rgba(0,255,136,0.2)"  },
  pink:   { accent: "#FF0080", bg: "rgba(255,0,128,0.08)",   border: "rgba(255,0,128,0.2)"  },
  purple: { accent: "#7B2FFF", bg: "rgba(123,47,255,0.08)",  border: "rgba(123,47,255,0.2)" },
  yellow: { accent: "#FFD700", bg: "rgba(255,215,0,0.08)",   border: "rgba(255,215,0,0.2)"  },
};

export function ExplanationModal({ open, onClose, content }: ExplanationModalProps) {
  const c = COLOR_MAP[content.color ?? "cyan"];

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  }, [onClose]);

  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleKey);
      return () => document.removeEventListener("keydown", handleKey);
    }
  }, [open, handleKey]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50"
            style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
            onClick={onClose}
          />

          {/* Panel — slides in from right */}
          <motion.aside
            key="panel"
            role="dialog"
            aria-modal="true"
            aria-label={content.title}
            initial={{ x: "100%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 260 }}
            className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-lg flex flex-col overflow-hidden"
            style={{
              background: "linear-gradient(180deg, rgba(8,11,20,0.99) 0%, rgba(13,17,23,0.99) 100%)",
              borderLeft: `1px solid ${c.border}`,
              boxShadow: `-8px 0 40px rgba(0,0,0,0.6), inset -1px 0 0 ${c.border}`,
            }}
          >
            {/* Accent line top */}
            <div className="absolute top-0 left-0 right-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${c.accent}60, transparent)` }} />

            {/* Header */}
            <div className="flex items-start justify-between px-6 pt-6 pb-4" style={{ borderBottom: `1px solid rgba(255,255,255,0.06)` }}>
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: c.bg, border: `1px solid ${c.border}` }}
                >
                  <BookOpen className="w-4 h-4" style={{ color: c.accent }} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white leading-tight">{content.title}</h2>
                  {content.subtitle && (
                    <p className="text-xs mt-0.5" style={{ color: "rgba(100,116,139,0.8)" }}>{content.subtitle}</p>
                  )}
                </div>
              </div>
              <button
                onClick={onClose}
                aria-label="Close explanation"
                className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/8"
                style={{ color: "rgba(100,116,139,0.7)" }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

              {/* Diagram */}
              {content.diagram && (
                <div
                  className="rounded-2xl p-4 overflow-hidden"
                  style={{ background: c.bg, border: `1px solid ${c.border}` }}
                >
                  {content.diagram}
                </div>
              )}

              {/* Theory text */}
              <div>
                <p className="text-xs font-bold tracking-widest mb-2" style={{ color: c.accent }}>THEORIE</p>
                <p className="text-sm text-slate-300 leading-relaxed">{content.theory}</p>
              </div>

              {/* Key points */}
              {content.keyPoints.length > 0 && (
                <div>
                  <p className="text-xs font-bold tracking-widest mb-3" style={{ color: c.accent }}>KERNPUNKTE</p>
                  <ul className="space-y-2">
                    {content.keyPoints.map((pt, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <span
                          className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold mt-0.5"
                          style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.accent }}
                        >
                          {i + 1}
                        </span>
                        <span className="text-sm text-slate-300 leading-snug">{pt}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Practical tip */}
              {content.practicalTip && (
                <div
                  className="rounded-xl p-4"
                  style={{ background: "rgba(255,215,0,0.06)", border: "1px solid rgba(255,215,0,0.2)" }}
                >
                  <p className="text-xs font-bold tracking-widest mb-1.5" style={{ color: "#FFD700" }}>PRAXIS-TIPP</p>
                  <p className="text-sm text-slate-300 leading-relaxed">{content.practicalTip}</p>
                </div>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

/* ---- Trigger button — small "?" icon ---- */
interface InfoButtonProps {
  onClick: () => void;
  color?: keyof typeof COLOR_MAP;
  className?: string;
}

export function InfoButton({ onClick, color = "cyan", className = "" }: InfoButtonProps) {
  const c = COLOR_MAP[color];
  return (
    <button
      onClick={onClick}
      aria-label="Erklärung öffnen"
      className={`flex items-center justify-center w-6 h-6 rounded-lg text-xs font-bold transition-all hover:scale-110 ${className}`}
      style={{
        background: c.bg,
        border: `1px solid ${c.border}`,
        color: c.accent,
        boxShadow: `0 0 8px ${c.accent}20`,
      }}
    >
      ?
    </button>
  );
}
