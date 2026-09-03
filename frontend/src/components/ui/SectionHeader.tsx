"use client";

/**
 * Section header in the HKCM rhythm: a small square badge, the section title in
 * bold beside it, and a quiet right-aligned meta line on the far side.
 *
 * The newsletter uses exactly this row to open every block ("[badge] US-Titans
 * ............ Tägliches Aktien-Update"), and it reads well because the two
 * ends carry different weights — the title anchors, the meta recedes. A hairline
 * under the row separates sections without a heavy divider.
 */

import { clsx } from "clsx";

export function SectionHeader({
  title,
  meta,
  icon,
  tone = "var(--accent)",
  className,
}: {
  title: string;
  /** Quiet right-hand detail — a date, a count, a source. */
  meta?: React.ReactNode;
  icon?: React.ReactNode;
  /** Badge colour; defaults to the app accent. */
  tone?: string;
  className?: string;
}) {
  return (
    <div
      className={clsx("flex items-center gap-3 pb-2 mb-3 flex-wrap", className)}
      style={{ borderBottom: "1px solid var(--border)" }}
    >
      {icon && (
        <span
          className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
          style={{ background: `color-mix(in srgb, ${tone} 14%, transparent)`, border: `1px solid color-mix(in srgb, ${tone} 35%, transparent)`, color: tone }}
        >
          {icon}
        </span>
      )}
      <h2 className="text-lg font-bold leading-none" style={{ color: "var(--foreground)" }}>
        {title}
      </h2>
      {meta && (
        <span className="ml-auto text-xs" style={{ color: "var(--text-dim)" }}>
          {meta}
        </span>
      )}
    </div>
  );
}

/**
 * The newsletter's standalone verdict line — centred, bold, with air around it.
 * Used for a one-phrase summary that should not read as body copy.
 */
export function Verdict({ children, tone }: { children: React.ReactNode; tone?: string }) {
  return (
    <p
      className="text-center text-base font-bold py-3"
      style={{ color: tone ?? "var(--foreground)" }}
    >
      {children}
    </p>
  );
}

/**
 * Small bold label above a block of prose — HKCM's "Was ist passiert?" pattern.
 * The body is set justified like the mail, which is what gives those blocks
 * their even, printed look.
 */
export function ProseBlock({ title, text }: { title: string; text: string }) {
  if (!text.trim()) return null;
  return (
    <div className="mb-4 last:mb-0">
      <p className="text-xs font-bold mb-1.5" style={{ color: "var(--text-muted)" }}>
        {title}
      </p>
      {text.split("\n").map((paragraph, i) => (
        <p
          key={i}
          className="text-sm leading-relaxed mb-2 last:mb-0 text-justify hyphens-auto"
          style={{ color: "var(--text-muted)" }}
          lang="de"
        >
          {paragraph}
        </p>
      ))}
    </div>
  );
}
