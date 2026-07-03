"use client";

/**
 * Collapsible section — accessible, animated (framer-motion) expand/collapse
 * container matching the app's dark-neon glass design system (see GlassCard.tsx,
 * Sidebar.tsx for the same border/glow/blur language).
 *
 * Used to compose several previously-standalone pages into one page with
 * expandable sections (e.g. /live, /depot) without changing any of the
 * wrapped business logic.
 */
import { useId, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { clsx } from "clsx";

export interface CollapsibleProps {
  /** Header title — usually a short label string, but any node is allowed. */
  title: ReactNode;
  /** Section content, only mounted while open (unmounts on collapse). */
  children: ReactNode;
  /** Whether the section starts expanded. Defaults to false. */
  defaultOpen?: boolean;
  /** Optional leading icon element (e.g. <Radio className="w-3.5 h-3.5" />). */
  icon?: ReactNode;
  /** Optional trailing content in the header row (e.g. a NeonBadge). */
  badge?: ReactNode;
  /** Optional subtitle shown under the title. */
  subtitle?: ReactNode;
  className?: string;
}

export function Collapsible({
  title,
  children,
  defaultOpen = false,
  icon,
  badge,
  subtitle,
  className,
}: CollapsibleProps) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();

  return (
    <div
      className={clsx("relative overflow-hidden rounded-xl", className)}
      style={{
        background:
          "linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)",
        border: "1px solid rgba(255,255,255,0.08)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        boxShadow:
          "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={contentId}
        className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40"
      >
        <span className="flex items-center gap-2.5 min-w-0">
          {icon && (
            <span
              className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center"
              style={{
                background: "rgba(0,212,255,0.12)",
                border: "1px solid rgba(0,212,255,0.25)",
              }}
              aria-hidden="true"
            >
              {icon}
            </span>
          )}
          <span className="min-w-0">
            <span className="block text-sm font-bold text-slate-100 truncate">
              {title}
            </span>
            {subtitle && (
              <span className="block text-xs text-slate-500 truncate mt-0.5">
                {subtitle}
              </span>
            )}
          </span>
        </span>

        <span className="flex items-center gap-3 flex-shrink-0">
          {badge}
          <motion.span
            animate={{ rotate: open ? 180 : 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="flex items-center justify-center"
          >
            <ChevronDown className="w-4 h-4 text-slate-500" />
          </motion.span>
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            id={contentId}
            role="region"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div
              className="px-4 pb-4 pt-3"
              style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
            >
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
