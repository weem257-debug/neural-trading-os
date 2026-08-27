"use client";

/**
 * Accent panel + parameter list — the HKCM newsletter's visual signature,
 * rebuilt on this app's tokens.
 *
 * HKCM frames every trade setup in a rounded, hairline-bordered box with a
 * thick coloured bar down its left edge, a small caps label at the top, and a
 * list underneath where the NAME is light and the VALUE is bold. That
 * label/value weight contrast is what makes the numbers findable at a glance,
 * and it is the pattern this app reuses wherever a small set of key figures
 * belongs together.
 *
 * The accent colour carries meaning: blue for neutral parameters, green/red
 * where the figures describe a direction.
 */

import { clsx } from "clsx";

export type AccentTone = "accent" | "positive" | "negative" | "warning" | "violet" | "muted";

const TONE_VARS: Record<AccentTone, string> = {
  accent: "var(--accent)",
  positive: "var(--positive)",
  negative: "var(--negative)",
  warning: "var(--warning)",
  violet: "var(--violet)",
  muted: "var(--text-dim)",
};

export function toneColor(tone: AccentTone): string {
  return TONE_VARS[tone];
}

export function AccentPanel({
  label,
  tone = "accent",
  children,
  className,
  dense = false,
}: {
  /** Small caps heading inside the box, e.g. "Handelsparameter". Optional. */
  label?: string;
  tone?: AccentTone;
  children: React.ReactNode;
  className?: string;
  /** Tighter padding for use inside an already-padded card. */
  dense?: boolean;
}) {
  return (
    <div
      className={clsx("relative rounded-lg overflow-hidden", className)}
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
      }}
    >
      {/* The left bar. Absolute rather than a border-left so the padding below
          stays symmetric and the bar keeps its full height when the content
          wraps. */}
      <span
        aria-hidden="true"
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{ background: TONE_VARS[tone] }}
      />
      <div className={dense ? "pl-4 pr-3 py-2.5" : "pl-5 pr-4 py-4"}>
        {label && (
          <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>
            {label}
          </p>
        )}
        {children}
      </div>
    </div>
  );
}

/**
 * One "Bezeichnung: **Wert**" row.
 *
 * Rendered as a definition list rather than a bulleted <ul> like the mail: the
 * pairing is the actual semantics, and a screen reader then announces name and
 * value together instead of reading a list of run-on sentences.
 */
export function ParameterRow({
  name,
  value,
  valueColor,
  note,
}: {
  name: string;
  value: React.ReactNode;
  valueColor?: string;
  note?: string;
}) {
  return (
    <div className="flex items-baseline gap-2 py-1">
      <span
        aria-hidden="true"
        className="w-1 h-1 rounded-full flex-shrink-0 self-center"
        style={{ background: "var(--text-dim)" }}
      />
      <dt className="text-sm" style={{ color: "var(--text-muted)" }}>
        {name}:
      </dt>
      <dd
        className="text-sm font-bold font-mono ml-auto text-right"
        style={{ color: valueColor ?? "var(--foreground)" }}
      >
        {value}
        {note && (
          <span className="block text-xs font-normal font-sans" style={{ color: "var(--text-dim)" }}>
            {note}
          </span>
        )}
      </dd>
    </div>
  );
}

export function ParameterList({ children }: { children: React.ReactNode }) {
  return <dl className="space-y-0">{children}</dl>;
}
