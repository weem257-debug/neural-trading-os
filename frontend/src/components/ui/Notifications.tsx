"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, CheckCircle, AlertTriangle, XCircle, Info } from "lucide-react";
import { useNotificationStore } from "@/store/notificationStore";
import type { Notification, NotificationType } from "@/store/notificationStore";
import { useAlertsStream } from "@/hooks/useWebSocket";

// ---------------------------------------------------------------------------
// Type configuration
// ---------------------------------------------------------------------------
const TYPE_CONFIG: Record<
  NotificationType,
  { color: string; border: string; bg: string; Icon: React.ElementType }
> = {
  success: {
    color: "#00FF88",
    border: "rgba(0,255,136,0.35)",
    bg: "rgba(0,255,136,0.08)",
    Icon: CheckCircle,
  },
  warning: {
    color: "#FFD700",
    border: "rgba(255,215,0,0.35)",
    bg: "rgba(255,215,0,0.08)",
    Icon: AlertTriangle,
  },
  error: {
    color: "#FF0080",
    border: "rgba(255,0,128,0.35)",
    bg: "rgba(255,0,128,0.08)",
    Icon: XCircle,
  },
  info: {
    color: "#00D4FF",
    border: "rgba(0,212,255,0.35)",
    bg: "rgba(0,212,255,0.08)",
    Icon: Info,
  },
};

// ---------------------------------------------------------------------------
// Single toast card
// ---------------------------------------------------------------------------
function ToastCard({ notification }: { notification: Notification }) {
  const removeNotification = useNotificationStore((s) => s.removeNotification);
  const cfg = TYPE_CONFIG[notification.type];
  const { Icon } = cfg;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 80, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 80, scale: 0.9 }}
      transition={{ type: "spring", stiffness: 380, damping: 28 }}
      className="w-80 rounded-xl overflow-hidden relative"
      style={{
        background: `linear-gradient(135deg, rgba(10,15,28,0.96), rgba(6,10,20,0.96))`,
        border: `1px solid ${cfg.border}`,
        backdropFilter: "blur(24px)",
        boxShadow: `0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px ${cfg.border}40`,
      }}
      role="alert"
      aria-live="polite"
    >
      {/* Top glow line */}
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${cfg.color}90, transparent)` }}
      />

      <div className="flex items-start gap-3 p-4">
        {/* Icon */}
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
          style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}
        >
          <Icon className="w-4 h-4" style={{ color: cfg.color }} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-100 leading-tight">
            {notification.title}
          </p>
          {notification.message && (
            <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
              {notification.message}
            </p>
          )}
        </div>

        {/* Close */}
        <button
          onClick={() => removeNotification(notification.id)}
          className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded transition-colors mt-0.5"
          style={{ color: "#475569" }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#E2E8F0")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#475569")}
          aria-label="Benachrichtigung schließen"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Progress bar — shows remaining duration */}
      {notification.duration && notification.duration > 0 && (
        <motion.div
          className="absolute bottom-0 left-0 h-0.5"
          style={{ background: cfg.color, opacity: 0.6 }}
          initial={{ width: "100%" }}
          animate={{ width: "0%" }}
          transition={{ duration: notification.duration / 1000, ease: "linear" }}
        />
      )}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// WebSocket alert bridge
// — listens to /ws/alerts and fires notifications for risk alerts
// ---------------------------------------------------------------------------
function AlertBridge() {
  const addNotification = useNotificationStore((s) => s.addNotification);
  const { events } = useAlertsStream();

  useEffect(() => {
    if (!events || events.length === 0) return;
    const latest = events[0]; // events[0] = newest (prepended in useWebSocket)
    if (!latest) return;

    if (typeof latest !== "object" || latest === null) return;
    const ev = latest as unknown as Record<string, unknown>;

    // Price alert fired — show success toast
    if (ev.type === "price_alert_fired") {
      const ticker = ev.ticker as string | undefined;
      const condition = ev.condition as string | undefined;
      const threshold = ev.threshold as number | undefined;
      const currentPrice = ev.current_price as number | undefined;

      let msg = ticker ? `${ticker}` : "Alarm ausgelöst";
      if (condition === "above" && threshold !== undefined)
        msg += ` hat $${threshold.toLocaleString()} überschritten`;
      else if (condition === "below" && threshold !== undefined)
        msg += ` ist unter $${threshold.toLocaleString()} gefallen`;
      else if (condition === "change_pct" && threshold !== undefined)
        msg += ` Änderung ≥ ${threshold}%`;
      if (currentPrice !== undefined)
        msg += ` (Kurs: $${currentPrice.toLocaleString()})`;

      addNotification({
        type: "success",
        title: "Preisalarm ausgelöst",
        message: msg,
        duration: 10000,
      });
      return;
    }

    // Only handle genuine risk alert events — skip WS control messages and data broadcasts
    const alertTypes = new Set(["alert", "risk_alert", "risk_warning", "margin_call", "stop_loss"]);
    if (!alertTypes.has(ev.type as string)) return;

    // Determine severity
    const text = (ev.message as string) ?? (ev.detail as string) ?? JSON.stringify(ev);
    const isHigh = ev.severity === "high" || ev.severity === "critical" ||
      /critical|breach|exceeded|margin.?call/i.test(text);

    addNotification({
      type: isHigh ? "error" : "warning",
      title: isHigh ? "Risikoalarm — Handlung erforderlich" : "Risikowarnung",
      message: text.length > 120 ? text.slice(0, 120) + "…" : text,
      duration: isHigh ? 0 : 8000,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events]);

  return null;
}

// ---------------------------------------------------------------------------
// Main Notifications container
// ---------------------------------------------------------------------------
export function Notifications() {
  const notifications = useNotificationStore((s) => s.notifications);

  return (
    <>
      {/* WebSocket alert bridge — no UI */}
      <AlertBridge />

      {/* Toast stack — upper right */}
      <div
        className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none"
        aria-label="Benachrichtigungen"
      >
        <AnimatePresence mode="popLayout">
          {notifications.map((n) => (
            <div key={n.id} className="pointer-events-auto">
              <ToastCard notification={n} />
            </div>
          ))}
        </AnimatePresence>
      </div>
    </>
  );
}
