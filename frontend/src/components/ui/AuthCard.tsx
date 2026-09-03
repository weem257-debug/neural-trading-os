"use client";

import type { ReactNode } from "react";
import { AlertTriangle, Cpu } from "lucide-react";

/**
 * Shared "glass" card shell for the auth pages (login, register,
 * forgot-password, reset-password, unsubscribe) — the outer card, its top
 * accent line, and the "NEURAL TRADING OS" logo block were byte-identical
 * across all five, differing only in the subtitle line under the logo.
 *
 * NOTE: intentionally does NOT include the outer `min-h-screen flex ...`
 * wrapper — that div's classes differ slightly per page (e.g. login has no
 * vertical padding, others have `py-8`), so it stays in each page.
 */
export function AuthCard({ subtitle, children }: { subtitle: string; children: ReactNode }) {
  return (
    <div
      className="w-full max-w-sm relative"
      style={{
        background: "rgba(8,11,20,0.85)",
        border: "1px solid rgba(76,141,246,0.25)",
        borderRadius: "1rem",
        backdropFilter: "blur(24px)",
        boxShadow:
          "0 0 60px rgba(76,141,246,0.08), 0 25px 50px rgba(0,0,0,0.6), inset 0 1px 0 rgba(76,141,246,0.1)",
      }}
    >
      {/* Top accent line */}
      <div
        className="absolute top-0 left-8 right-8 h-px rounded-full"
        style={{
          background: "linear-gradient(90deg, transparent, rgba(76,141,246,0.6), transparent)",
        }}
      />

      <div className="px-8 py-10">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div
            className="w-14 h-14 rounded-xl flex items-center justify-center mb-4"
            style={{
              background: "linear-gradient(135deg, rgba(76,141,246,0.15), rgba(163,113,247,0.15))",
              border: "1px solid rgba(76,141,246,0.35)",
              boxShadow: "0 0 24px rgba(76,141,246,0.25)",
            }}
          >
            <Cpu
              className="w-7 h-7"
              style={{ color: "#4C8DF6", filter: "drop-shadow(0 0 8px rgba(76,141,246,0.8))" }}
            />
          </div>
          <h1
            className="text-xl font-black tracking-widest"
            style={{
              color: "#4C8DF6",
              textShadow: "0 0 20px rgba(76,141,246,0.6), 0 0 40px rgba(76,141,246,0.3)",
              letterSpacing: "0.15em",
            }}
          >
            NEURAL TRADING OS
          </h1>
          <p className="text-xs mt-1 tracking-wider" style={{ color: "rgba(100,116,139,0.7)" }}>
            {subtitle}
          </p>
        </div>

        {children}
      </div>
    </div>
  );
}

/**
 * Shared error banner (AlertTriangle + red glass background) used across the
 * auth pages. The default props match register's / forgot-password's plain
 * variant; login's variant additionally pulses and glows, and passes a wider
 * text className — pass `pulse`, `glow` and `textClassName` to match.
 */
export function AuthError({
  children,
  className = "mb-5",
  pulse = false,
  glow = false,
  textClassName = "text-sm font-semibold",
}: {
  children: ReactNode;
  className?: string;
  pulse?: boolean;
  glow?: boolean;
  textClassName?: string;
}) {
  return (
    <div
      className={["flex items-center gap-2 px-4 py-3 rounded-lg", className, pulse ? "animate-pulse" : ""]
        .filter(Boolean)
        .join(" ")}
      style={{
        background: "rgba(239,68,68,0.1)",
        border: "1px solid rgba(239,68,68,0.4)",
        ...(glow ? { boxShadow: "0 0 16px rgba(239,68,68,0.15)" } : {}),
      }}
    >
      <AlertTriangle className="w-4 h-4 flex-shrink-0 text-red-400" />
      <span className={textClassName} style={{ color: "#f87171" }}>
        {children}
      </span>
    </div>
  );
}
