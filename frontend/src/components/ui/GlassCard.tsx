"use client";

import { motion } from "framer-motion";
import { clsx } from "clsx";

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  variant?: "default" | "cyan" | "green" | "pink" | "purple";
  hover?: boolean;
  animate?: boolean;
  delay?: number;
  padding?: string;
}

const variantStyles: Record<string, { border: string; glow: string }> = {
  default: {
    border: "rgba(255,255,255,0.08)",
    glow: "transparent",
  },
  cyan: {
    border: "rgba(0,212,255,0.25)",
    glow: "rgba(0,212,255,0.05)",
  },
  green: {
    border: "rgba(0,255,136,0.25)",
    glow: "rgba(0,255,136,0.05)",
  },
  pink: {
    border: "rgba(255,0,128,0.25)",
    glow: "rgba(255,0,128,0.05)",
  },
  purple: {
    border: "rgba(123,47,255,0.25)",
    glow: "rgba(123,47,255,0.05)",
  },
};

export function GlassCard({
  children,
  className,
  variant = "default",
  hover = false,
  animate = true,
  delay = 0,
  padding = "p-4",
}: GlassCardProps) {
  const v = variantStyles[variant];

  const baseStyle = {
    background: `linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)`,
    border: `1px solid ${v.border}`,
    borderRadius: "12px",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    boxShadow: `0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05), 0 0 0 0 ${v.glow}`,
  };

  if (animate) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay, ease: "easeOut" }}
        whileHover={hover ? { borderColor: v.border.replace("0.25", "0.5"), scale: 1.005 } : undefined}
        style={baseStyle}
        className={clsx("relative overflow-hidden", padding, className)}
      >
        {children}
      </motion.div>
    );
  }

  return (
    <div
      style={baseStyle}
      className={clsx("relative overflow-hidden", padding, className)}
    >
      {children}
    </div>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="section-label mb-3">{children}</p>
  );
}

export function NeonBadge({
  children,
  color = "cyan",
}: {
  children: React.ReactNode;
  color?: "cyan" | "green" | "pink" | "purple" | "yellow";
}) {
  const colorMap: Record<string, { bg: string; border: string; text: string }> = {
    cyan:   { bg: "rgba(0,212,255,0.12)",   border: "rgba(0,212,255,0.35)",   text: "#00D4FF" },
    green:  { bg: "rgba(0,255,136,0.12)",   border: "rgba(0,255,136,0.35)",   text: "#00FF88" },
    pink:   { bg: "rgba(255,0,128,0.12)",   border: "rgba(255,0,128,0.35)",   text: "#FF0080" },
    purple: { bg: "rgba(123,47,255,0.12)",  border: "rgba(123,47,255,0.35)",  text: "#7B2FFF" },
    yellow: { bg: "rgba(255,215,0,0.12)",   border: "rgba(255,215,0,0.35)",   text: "#FFD700" },
  };
  const c = colorMap[color];
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold"
      style={{
        background: c.bg,
        border: `1px solid ${c.border}`,
        color: c.text,
        textShadow: `0 0 8px ${c.text}60`,
      }}
    >
      {children}
    </span>
  );
}
