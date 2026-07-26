"use client";

import { FlaskConical } from "lucide-react";
import { usePrefsStore, useDemoData } from "@/store/prefsStore";

/**
 * Generic sliding toggle. Renders a real <button role="switch"> so screen
 * readers and keyboard users get the same semantics as a native checkbox.
 */
export function Switch({
  checked,
  onChange,
  label,
  id,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  id?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2"
      style={{
        background: checked ? "var(--accent)" : "rgba(255,255,255,0.12)",
        border: `1px solid ${checked ? "var(--accent)" : "rgba(255,255,255,0.16)"}`,
      }}
    >
      <span
        className="inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform duration-200"
        style={{ transform: checked ? "translateX(19px)" : "translateX(3px)" }}
      />
    </button>
  );
}

/**
 * Demo-data kill switch.
 *
 * When off, every surface that would otherwise fall back to the bundled demo
 * portfolio / demo signal feed / demo risk metrics shows its real (possibly
 * empty) state instead. Rendered in the dashboard header and on /settings.
 */
export function DemoDataSwitch({ variant = "inline" }: { variant?: "inline" | "row" }) {
  const demoData = useDemoData();
  const setDemoData = usePrefsStore((s) => s.setDemoData);

  if (variant === "row") {
    return (
      <div className="flex items-start justify-between gap-4 py-3">
        <div className="min-w-0">
          <label htmlFor="demo-data-switch" className="text-sm font-medium text-slate-200">
            Demodaten anzeigen
          </label>
          <p className="text-xs text-slate-500 mt-0.5">
            Aus: Kennzahlen, Positionen und Signale kommen ausschließlich aus deinem Konto.
            Leere Bereiche bleiben leer statt mit Beispieldaten gefüllt zu werden.
          </p>
        </div>
        <Switch
          id="demo-data-switch"
          checked={demoData}
          onChange={setDemoData}
          label="Demodaten anzeigen"
        />
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-md"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      title={
        demoData
          ? "Demodaten sind aktiv — leere Bereiche werden mit Beispieldaten gefüllt"
          : "Demodaten aus — es werden ausschließlich echte Kontodaten angezeigt"
      }
    >
      <FlaskConical
        className="w-3.5 h-3.5 flex-shrink-0"
        style={{ color: demoData ? "var(--warning)" : "var(--text-dim)" }}
      />
      <span
        className="text-xs font-medium whitespace-nowrap"
        style={{ color: demoData ? "var(--text-muted)" : "var(--text-dim)" }}
      >
        Demodaten
      </span>
      <Switch checked={demoData} onChange={setDemoData} label="Demodaten anzeigen" />
    </div>
  );
}
