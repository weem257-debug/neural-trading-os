"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Bell,
  Plus,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Activity,
} from "lucide-react";
import { api, API_BASE } from "@/lib/api";
import type { PriceAlertRecord } from "@/types";
import {
  ExplanationModal,
  InfoButton,
  type ExplanationContent,
} from "@/components/ui/ExplanationModal";

const EXPLAIN_PRICE_ALERTS: ExplanationContent = {
  title: "Preisalarme",
  subtitle: "Automatische Benachrichtigung bei Kurszielen",
  color: "cyan",
  theory:
    "Preisalarme überwachen einen Ticker dauerhaft und lösen aus, sobald der aktuelle Kurs eine definierte Bedingung erfüllt. Das Backend prüft die Kurse in Echtzeit und sendet beim Auslösen ein WebSocket-Event an alle verbundenen Clients — der Alert-Status wechselt sofort auf 'fired'.",
  diagram: (
    <svg viewBox="0 0 320 120" className="w-full" style={{ maxHeight: 120 }}>
      <defs>
        <linearGradient id="al-price" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#00D4FF" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#00D4FF" stopOpacity="0.4" />
        </linearGradient>
      </defs>
      {/* Threshold line */}
      <line x1="0" y1="50" x2="320" y2="50" stroke="#FFD700" strokeWidth="1.5" strokeDasharray="6 4" />
      <text x="6" y="44" fontSize="9" fill="#FFD700" fontFamily="monospace">THRESHOLD $200</text>
      {/* Price curve going up and crossing */}
      <polyline
        points="0,90 50,85 100,80 140,60 165,50 190,38 230,30 280,25 320,20"
        fill="none" stroke="#00D4FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      />
      {/* Crossing point */}
      <circle cx="165" cy="50" r="5" fill="#00FF88" style={{ filter: "drop-shadow(0 0 6px #00FF88)" }} />
      <text x="172" y="46" fontSize="8" fill="#00FF88" fontFamily="monospace">FIRED!</text>
      {/* Labels */}
      <text x="4" y="112" fontSize="8" fill="rgba(100,116,139,0.7)" fontFamily="monospace">t=0</text>
      <text x="290" y="112" fontSize="8" fill="rgba(100,116,139,0.7)" fontFamily="monospace">now</text>
    </svg>
  ),
  keyPoints: [
    "Above-Alarm: feuert, wenn der Kurs über die Schwelle steigt",
    "Below-Alarm: feuert, wenn der Kurs unter die Schwelle fällt",
    "Change %-Alarm: reagiert auf prozentuale Kursveränderung im Tages-Vergleich",
    "WebSocket-Push: Status ändert sich sofort auf 'fired' — kein Reload nötig",
  ],
  practicalTip:
    "Setze Alarme knapp über Widerstandsniveaus oder unter Support-Linien — so erhältst du Signale genau beim Ausbruch.",
};

const EXPLAIN_RISK_ALERTS: ExplanationContent = {
  title: "Live Risiko-Alarme",
  subtitle: "Echtzeit-Monitoring via WebSocket",
  color: "yellow",
  theory:
    "Das Backend überwacht laufend Risikoparameter: Drawdown, Konzentration, Volatilitätsspitzen und Korrelationsbrüche. Überschreitet ein Wert die konfigurierte Schwelle, sendet der Server sofort ein 'risk_alert'-Event über die WebSocket-Verbindung. Kritische Alarme (rot) erfordern sofortige Aufmerksamkeit, Warnungen (gelb) dienen zur Beobachtung.",
  diagram: (
    <svg viewBox="0 0 320 100" className="w-full" style={{ maxHeight: 100 }}>
      <defs>
        <radialGradient id="ws-glow" cx="50%" cy="50%">
          <stop offset="0%" stopColor="#FFD700" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#FFD700" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* Backend node */}
      <rect x="10" y="35" width="80" height="30" rx="6" fill="rgba(255,215,0,0.1)" stroke="#FFD700" strokeWidth="1" />
      <text x="50" y="54" fontSize="9" fill="#FFD700" textAnchor="middle" fontFamily="monospace">BACKEND</text>
      {/* WebSocket arrow */}
      <line x1="92" y1="50" x2="228" y2="50" stroke="#FFD700" strokeWidth="1.5" strokeDasharray="5 3" />
      <polygon points="228,46 238,50 228,54" fill="#FFD700" />
      <text x="160" y="44" fontSize="8" fill="rgba(255,215,0,0.7)" textAnchor="middle" fontFamily="monospace">WebSocket</text>
      {/* Frontend node */}
      <rect x="240" y="35" width="70" height="30" rx="6" fill="rgba(255,215,0,0.1)" stroke="#FFD700" strokeWidth="1" />
      <text x="275" y="54" fontSize="9" fill="#FFD700" textAnchor="middle" fontFamily="monospace">UI</text>
      {/* Risk levels */}
      <circle cx="160" cy="78" r="5" fill="#f87171" />
      <text x="168" y="82" fontSize="8" fill="#f87171" fontFamily="monospace">CRITICAL</text>
      <circle cx="220" cy="78" r="5" fill="#fbbf24" />
      <text x="228" y="82" fontSize="8" fill="#fbbf24" fontFamily="monospace">WARNING</text>
    </svg>
  ),
  keyPoints: [
    "Persistente WebSocket-Verbindung — keine Polling-Latenz",
    "Kritische Alarme (rot) bei schwerem Drawdown oder Portfoliokonzentration > Limit",
    "Warnungen (gelb) bei erhöhter Volatilität oder Korrelationsanstieg",
    "Maximal 20 Alarme gespeichert — älteste werden automatisch verdrängt",
  ],
  practicalTip:
    "Bei kritischen Risiko-Alarmen: sofort offene Positionen prüfen und Stop-Loss-Level nachziehen.",
};

// Safely swap only the protocol so path components containing "http" aren't mangled
const WS_BASE = (() => {
  try {
    const u = new URL(API_BASE);
    u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
    return u.toString().replace(/\/$/, "") + "/ws/alerts";
  } catch {
    return API_BASE.replace(/^https/, "wss").replace(/^http/, "ws") + "/ws/alerts";
  }
})();

type AlertCondition = PriceAlertRecord["condition"];
type AlertStatus = PriceAlertRecord["status"] | "expired";

interface RiskAlert {
  id: string;
  message: string;
  level: string;
  timestamp: string;
}

const MAX_RISK_ALERTS = 20;

function statusColor(status: AlertStatus) {
  if (status === "active") return { bg: "rgba(0,212,255,0.1)", border: "rgba(0,212,255,0.35)", text: "#00D4FF" };
  if (status === "fired") return { bg: "rgba(74,222,128,0.1)", border: "rgba(74,222,128,0.35)", text: "#4ade80" };
  return { bg: "rgba(100,116,139,0.1)", border: "rgba(100,116,139,0.25)", text: "#64748b" };
}

function StatusBadge({ status }: { status: AlertStatus }) {
  const c = statusColor(status);
  return (
    <span
      className="text-xs font-semibold px-2 py-0.5 rounded-full"
      style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}
    >
      {status === "active" && <CheckCircle2 className="inline w-3 h-3 mr-1" />}
      {status === "fired" && <Activity className="inline w-3 h-3 mr-1" />}
      {status === "expired" && <Clock className="inline w-3 h-3 mr-1" />}
      {status.toUpperCase()}
    </span>
  );
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<PriceAlertRecord[]>([]);
  const [riskAlerts, setRiskAlerts] = useState<RiskAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [formTicker, setFormTicker] = useState("");
  const [formCondition, setFormCondition] = useState<AlertCondition>("above");
  const [formThreshold, setFormThreshold] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const [explainContent, setExplainContent] = useState<ExplanationContent | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Fetch price alerts
  const fetchAlerts = useCallback(async () => {
    try {
      const data = await api.priceAlerts.list();
      setAlerts(data);
    } catch {
      // silently ignore network errors on poll
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  // WebSocket — handles both price_alert_fired and risk_alert events
  useEffect(() => {
    let ws: WebSocket;
    try {
      ws = new WebSocket(WS_BASE);
      wsRef.current = ws;
      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          if (data?.type === "price_alert_fired") {
            // Refresh the price alerts table so status changes to "fired"
            fetchAlerts();
            return;
          }
          if (data?.type === "risk_alert") {
            const alert: RiskAlert = {
              id: `${Date.now()}-${Math.random()}`,
              message: data.message ?? "",
              level: (data.level ?? "warning").toLowerCase(),
              timestamp: data.timestamp ?? new Date().toISOString(),
            };
            setRiskAlerts((prev) => [alert, ...prev].slice(0, MAX_RISK_ALERTS));
          }
        } catch {
          // ignore parse errors
        }
      };
    } catch {
      // WebSocket not available
    }
    return () => {
      try {
        wsRef.current?.close();
      } catch {
        // ignore
      }
    };
  }, [fetchAlerts]);

  const handleCreateAlert = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setFormError(null);
      const threshold = parseFloat(formThreshold);
      if (isNaN(threshold)) {
        setFormError("Threshold must be a number");
        return;
      }
      if (!formTicker.trim()) {
        setFormError("Ticker is required");
        return;
      }
      setCreating(true);
      try {
        await api.priceAlerts.create({
          ticker: formTicker.trim().toUpperCase(),
          condition: formCondition,
          threshold,
        });
        setFormTicker("");
        setFormThreshold("");
        setFormCondition("above");
        await fetchAlerts();
      } catch (err) {
        setFormError(err instanceof Error ? err.message : "Failed to create alert");
      } finally {
        setCreating(false);
      }
    },
    [formTicker, formCondition, formThreshold, fetchAlerts]
  );

  const handleDelete = useCallback(
    async (alertId: string) => {
      try {
        await api.priceAlerts.delete(alertId);
        setAlerts((prev) => prev.filter((a) => a.alert_id !== alertId));
      } catch {
        setError("Failed to delete alert");
      }
    },
    []
  );

  const activeCount = alerts.filter((a) => a.status === "active").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{
            background: "rgba(251,191,36,0.1)",
            border: "1px solid rgba(251,191,36,0.3)",
          }}
        >
          <Bell className="w-4 h-4 text-yellow-400" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-white">Price Alerts</h1>
          <p className="text-xs" style={{ color: "rgba(100,116,139,0.7)" }}>
            {activeCount} active alert{activeCount !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {error && (
        <div
          className="flex items-center gap-2 px-4 py-3 rounded-lg"
          style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.35)" }}
        >
          <AlertTriangle className="w-4 h-4 text-red-400" />
          <span className="text-sm text-red-400">{error}</span>
        </div>
      )}

      {/* Add Alert Form */}
      <div
        className="rounded-xl p-5"
        style={{
          background: "rgba(8,11,20,0.7)",
          border: "1px solid rgba(0,212,255,0.12)",
        }}
      >
        <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <Plus className="w-4 h-4 text-cyan-400" />
          Add Alert
          <InfoButton onClick={() => setExplainContent(EXPLAIN_PRICE_ALERTS)} color="cyan" className="ml-1" />
        </h2>
        <form onSubmit={handleCreateAlert} className="flex flex-wrap gap-3 items-end">
          {/* Ticker */}
          <div className="flex flex-col gap-1 min-w-[120px]">
            <label className="text-xs tracking-wider" style={{ color: "rgba(100,116,139,0.7)" }}>
              TICKER
            </label>
            <input
              type="text"
              value={formTicker}
              onChange={(e) => setFormTicker(e.target.value)}
              placeholder="AAPL"
              maxLength={10}
              required
              className="px-3 py-2 rounded-lg text-sm text-slate-200 placeholder-slate-600 outline-none uppercase"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(0,212,255,0.15)",
              }}
            />
          </div>

          {/* Condition */}
          <div className="flex flex-col gap-1">
            <label className="text-xs tracking-wider" style={{ color: "rgba(100,116,139,0.7)" }}>
              CONDITION
            </label>
            <select
              value={formCondition}
              onChange={(e) => setFormCondition(e.target.value as AlertCondition)}
              className="px-3 py-2 rounded-lg text-sm text-slate-200 outline-none"
              style={{
                background: "rgba(8,11,20,0.9)",
                border: "1px solid rgba(0,212,255,0.15)",
              }}
            >
              <option value="above">Above</option>
              <option value="below">Below</option>
              <option value="change_pct">Change %</option>
            </select>
          </div>

          {/* Threshold */}
          <div className="flex flex-col gap-1 min-w-[120px]">
            <label className="text-xs tracking-wider" style={{ color: "rgba(100,116,139,0.7)" }}>
              THRESHOLD
            </label>
            <input
              type="number"
              step="any"
              value={formThreshold}
              onChange={(e) => setFormThreshold(e.target.value)}
              placeholder="200.00"
              required
              className="px-3 py-2 rounded-lg text-sm text-slate-200 placeholder-slate-600 outline-none"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(0,212,255,0.15)",
              }}
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={creating}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200"
            style={{
              background: creating ? "rgba(0,212,255,0.07)" : "rgba(0,212,255,0.12)",
              border: "1px solid rgba(0,212,255,0.35)",
              color: "#00D4FF",
            }}
          >
            <Plus className="w-4 h-4" />
            {creating ? "Creating..." : "Create Alert"}
          </button>
        </form>
        {formError && (
          <p className="text-xs text-red-400 mt-2">{formError}</p>
        )}
      </div>

      {/* Price Alerts Table */}
      <div
        className="rounded-xl overflow-hidden"
        style={{
          background: "rgba(8,11,20,0.7)",
          border: "1px solid rgba(0,212,255,0.12)",
        }}
      >
        <div className="px-5 py-3" style={{ borderBottom: "1px solid rgba(0,212,255,0.08)" }}>
          <h2 className="text-sm font-semibold text-white">All Alerts</h2>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-24">
            <div
              className="w-5 h-5 rounded-full border-2 animate-spin"
              style={{ borderColor: "rgba(0,212,255,0.3)", borderTopColor: "#00D4FF" }}
            />
          </div>
        ) : alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-24 gap-2">
            <Bell className="w-5 h-5" style={{ color: "rgba(100,116,139,0.4)" }} />
            <p className="text-xs" style={{ color: "rgba(100,116,139,0.5)" }}>
              No alerts configured
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(0,212,255,0.06)" }}>
                  {["Ticker", "Condition", "Threshold", "Status", "Created", ""].map((h) => (
                    <th
                      key={h}
                      className="px-5 py-3 text-left text-xs tracking-wider"
                      style={{ color: "rgba(100,116,139,0.6)" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {alerts.map((alert) => (
                  <tr
                    key={alert.alert_id}
                    className="transition-colors duration-150 hover:bg-white/[0.02]"
                    style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}
                  >
                    <td className="px-5 py-3 font-bold text-white">{alert.ticker}</td>
                    <td className="px-5 py-3" style={{ color: "rgba(148,163,184,0.9)" }}>
                      {alert.condition === "change_pct" ? "Change %" : alert.condition.charAt(0).toUpperCase() + alert.condition.slice(1)}
                    </td>
                    <td className="px-5 py-3 font-mono" style={{ color: "rgba(148,163,184,0.9)" }}>
                      {alert.condition === "change_pct"
                        ? `${alert.threshold}%`
                        : `$${alert.threshold.toLocaleString()}`}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={alert.status} />
                    </td>
                    <td className="px-5 py-3 text-xs" style={{ color: "rgba(100,116,139,0.6)" }}>
                      {alert.created_at
                        ? new Date(alert.created_at).toLocaleString()
                        : "--"}
                    </td>
                    <td className="px-5 py-3">
                      <button
                        onClick={() => handleDelete(alert.alert_id)}
                        className="p-1.5 rounded-lg transition-all duration-150 hover:bg-red-500/10"
                        style={{ color: "rgba(100,116,139,0.5)" }}
                        aria-label="Delete alert"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Risk Alerts Stream */}
      <div
        className="rounded-xl overflow-hidden"
        style={{
          background: "rgba(8,11,20,0.7)",
          border: "1px solid rgba(251,191,36,0.12)",
        }}
      >
        <div
          className="px-5 py-3 flex items-center gap-2"
          style={{ borderBottom: "1px solid rgba(251,191,36,0.08)" }}
        >
          <Activity className="w-4 h-4 text-yellow-400" />
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            Live Risk Alerts
            <InfoButton onClick={() => setExplainContent(EXPLAIN_RISK_ALERTS)} color="yellow" />
          </h2>
          <span
            className="ml-auto text-xs px-2 py-0.5 rounded-full"
            style={{ background: "rgba(251,191,36,0.1)", color: "#fbbf24" }}
          >
            {riskAlerts.length} / {MAX_RISK_ALERTS}
          </span>
        </div>

        {riskAlerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-20 gap-2">
            <p className="text-xs" style={{ color: "rgba(100,116,139,0.5)" }}>
              No risk alerts received yet — monitoring active
            </p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "rgba(255,255,255,0.03)" }}>
            {riskAlerts.map((ra) => (
              <div key={ra.id} className="px-5 py-3 flex items-start gap-3">
                <AlertTriangle
                  className="w-3.5 h-3.5 mt-0.5 flex-shrink-0"
                  style={{ color: ra.level === "critical" ? "#f87171" : "#fbbf24" }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-300 leading-relaxed">{ra.message}</p>
                  <p className="text-xs mt-0.5" style={{ color: "rgba(100,116,139,0.5)" }}>
                    {new Date(ra.timestamp).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {explainContent && (
        <ExplanationModal
          open={!!explainContent}
          onClose={() => setExplainContent(null)}
          content={explainContent}
        />
      )}
    </div>
  );
}
