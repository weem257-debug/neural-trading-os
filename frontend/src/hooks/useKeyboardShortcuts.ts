"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// ---------------------------------------------------------------------------
// Chord state type — tracks partial key sequences (e.g. "g" in "g d")
// ---------------------------------------------------------------------------
type ChordState = string | null;

export interface UseKeyboardShortcutsReturn {
  showShortcutsModal: boolean;
  closeShortcutsModal: () => void;
}

/**
 * useKeyboardShortcuts
 *
 * Registers global keyboard shortcuts.
 *
 * Navigation chords (prefix key: g):
 *   g d  → /dashboard
 *   g s  → /signals
 *   g p  → /portfolio
 *   g b  → /backtest
 *   g r  → /risk
 *   g e  → /execution
 *
 * Utility:
 *   ?    → opens Keyboard-Shortcuts modal
 *
 * Ignores events when focus is on an input/textarea/select/contenteditable
 * element to avoid interfering with user typing.
 */
export function useKeyboardShortcuts(): UseKeyboardShortcutsReturn {
  const router = useRouter();
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const chordRef = useRef<ChordState>(null);
  const chordTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const closeShortcutsModal = useCallback(() => setShowShortcutsModal(false), []);

  const isInputFocused = (): boolean => {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName.toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return true;
    if ((el as HTMLElement).isContentEditable) return true;
    return false;
  };

  const clearChord = useCallback(() => {
    chordRef.current = null;
    if (chordTimeoutRef.current) {
      clearTimeout(chordTimeoutRef.current);
      chordTimeoutRef.current = null;
    }
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Skip when modifier keys are pressed (allow Ctrl/Cmd/Alt combos to pass through)
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // Skip when focus is in a form element
      if (isInputFocused()) return;

      const key = e.key;

      // Close modal on Escape
      if (key === "Escape") {
        setShowShortcutsModal(false);
        clearChord();
        return;
      }

      // Open shortcuts modal on "?"
      if (key === "?" && !chordRef.current) {
        e.preventDefault();
        setShowShortcutsModal(true);
        return;
      }

      // Start chord on "g"
      if (key === "g" && !chordRef.current) {
        e.preventDefault();
        chordRef.current = "g";

        // Auto-clear chord after 1.5s if no second key is pressed
        chordTimeoutRef.current = setTimeout(() => {
          chordRef.current = null;
        }, 1500);
        return;
      }

      // Resolve chord "g <key>"
      if (chordRef.current === "g") {
        e.preventDefault();
        clearChord();

        switch (key) {
          case "d":
            router.push("/dashboard");
            break;
          case "s":
            router.push("/signals");
            break;
          case "p":
            router.push("/portfolio");
            break;
          case "b":
            router.push("/backtest");
            break;
          case "r":
            router.push("/risk");
            break;
          case "e":
            router.push("/execution");
            break;
          default:
            // Unknown chord second key — silently ignore
            break;
        }
      }
    },
    [router, clearChord]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (chordTimeoutRef.current) clearTimeout(chordTimeoutRef.current);
    };
  }, [handleKeyDown]);

  return { showShortcutsModal, closeShortcutsModal };
}
