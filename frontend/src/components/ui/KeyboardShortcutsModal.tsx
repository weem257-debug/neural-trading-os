"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Keyboard } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ShortcutEntry {
  keys: string[];
  description: string;
}

interface ShortcutGroup {
  group: string;
  entries: ShortcutEntry[];
}

// ---------------------------------------------------------------------------
// Shortcut definitions
// ---------------------------------------------------------------------------
const SHORTCUTS: ShortcutGroup[] = [
  {
    group: "Navigation",
    entries: [
      { keys: ["g", "d"], description: "Go to Dashboard" },
      { keys: ["g", "s"], description: "Go to Signals" },
      { keys: ["g", "p"], description: "Go to Portfolio" },
      { keys: ["g", "b"], description: "Go to Backtest" },
      { keys: ["g", "r"], description: "Go to Risk" },
      { keys: ["g", "e"], description: "Go to Execution" },
    ],
  },
  {
    group: "General",
    entries: [
      { keys: ["?"], description: "Show this shortcuts panel" },
      { keys: ["Esc"], description: "Close modal / cancel" },
    ],
  },
];

// ---------------------------------------------------------------------------
// Key badge component
// ---------------------------------------------------------------------------
function KeyBadge({ label }: { label: string }) {
  return (
    <kbd
      className="inline-flex items-center justify-center min-w-[1.75rem] h-7 px-2 rounded text-xs font-mono font-bold"
      style={{
        background: "rgba(0,212,255,0.08)",
        border: "1px solid rgba(0,212,255,0.35)",
        color: "#00D4FF",
        boxShadow: "0 1px 0 rgba(0,212,255,0.2), inset 0 1px 0 rgba(255,255,255,0.05)",
        textShadow: "0 0 8px rgba(0,212,255,0.6)",
      }}
    >
      {label}
    </kbd>
  );
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------
interface KeyboardShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

export function KeyboardShortcutsModal({ open, onClose }: KeyboardShortcutsModalProps) {
  // Close on backdrop click
  const handleBackdrop = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  // Prevent scroll behind modal
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={handleBackdrop}
        >
          <motion.div
            className="relative w-full max-w-lg rounded-2xl overflow-hidden"
            style={{
              background:
                "linear-gradient(135deg, rgba(10,15,28,0.98), rgba(6,10,20,0.98))",
              border: "1px solid rgba(0,212,255,0.3)",
              boxShadow:
                "0 0 60px rgba(0,212,255,0.12), 0 25px 50px rgba(0,0,0,0.6)",
            }}
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 12 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Glow accent */}
            <div
              className="absolute inset-x-0 top-0 h-px"
              style={{
                background:
                  "linear-gradient(90deg, transparent, rgba(0,212,255,0.8) 30%, rgba(123,47,255,0.6) 70%, transparent)",
              }}
            />

            {/* Header */}
            <div
              className="flex items-center justify-between px-6 py-4"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{
                    background: "rgba(0,212,255,0.1)",
                    border: "1px solid rgba(0,212,255,0.25)",
                  }}
                >
                  <Keyboard className="w-4 h-4" style={{ color: "#00D4FF" }} />
                </div>
                <div>
                  <h2
                    className="text-sm font-bold tracking-wide"
                    style={{ color: "#00D4FF" }}
                  >
                    Keyboard Shortcuts
                  </h2>
                  <p className="text-xs text-slate-500">Neural Trading OS</p>
                </div>
              </div>

              <button
                onClick={onClose}
                className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                style={{ color: "#64748B" }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#E2E8F0")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#64748B")}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-6">
              {SHORTCUTS.map((group) => (
                <div key={group.group}>
                  <p
                    className="text-xs font-semibold uppercase tracking-widest mb-3"
                    style={{ color: "#7B2FFF" }}
                  >
                    {group.group}
                  </p>
                  <div className="space-y-2">
                    {group.entries.map((entry, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between py-1"
                      >
                        <span className="text-sm text-slate-300">
                          {entry.description}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {entry.keys.map((k, ki) => (
                            <span key={ki} className="flex items-center gap-1">
                              <KeyBadge label={k} />
                              {ki < entry.keys.length - 1 && (
                                <span className="text-slate-600 text-xs">then</span>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div
              className="px-6 py-3 text-xs text-slate-600 text-center"
              style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
            >
              Press{" "}
              <kbd
                className="inline px-1.5 py-0.5 rounded text-xs font-mono"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}
              >
                Esc
              </kbd>{" "}
              to close
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
