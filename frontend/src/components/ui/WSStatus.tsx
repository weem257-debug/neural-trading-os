"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { RefreshCw, Wifi, WifiOff } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ConnectionState = "connected" | "connecting" | "disconnected";

interface WSStatusState {
  status:     ConnectionState;
  latencyMs:  number | null;
  lastPingAt: number | null;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const WS_BASE =
  typeof window !== "undefined"
    ? (process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000")
    : "ws://localhost:8000";

const WS_URL        = `${WS_BASE}/ws/prices`;
const PING_INTERVAL = 5_000;   // ms between pings
const RECONNECT_DELAY = 3_000; // ms before reconnect attempt

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WSStatus() {
  const wsRef           = useRef<WebSocket | null>(null);
  const pingTimerRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const pingTimestampRef = useRef<number | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef      = useRef(true);

  const [state, setState] = useState<WSStatusState>({
    status:     "disconnected",
    latencyMs:  null,
    lastPingAt: null,
  });

  // -----------------------------------------------------------------------
  // Connect / reconnect
  // -----------------------------------------------------------------------
  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;

    // Clean up any old socket
    if (wsRef.current) {
      wsRef.current.onopen    = null;
      wsRef.current.onmessage = null;
      wsRef.current.onclose   = null;
      wsRef.current.onerror   = null;
      try { wsRef.current.close(); } catch {}
      wsRef.current = null;
    }

    setState((s) => ({ ...s, status: "connecting" }));

    let ws: WebSocket;
    try {
      ws = new WebSocket(WS_URL);
    } catch {
      // WebSocket constructor can throw in some environments
      setState((s) => ({ ...s, status: "disconnected" }));
      return;
    }

    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      setState((s) => ({ ...s, status: "connected" }));
      startPinging();
    };

    ws.onmessage = (ev) => {
      if (!mountedRef.current) return;
      // Pong response
      if (ev.data === "pong" && pingTimestampRef.current !== null) {
        const latency = Date.now() - pingTimestampRef.current;
        pingTimestampRef.current = null;
        setState((s) => ({ ...s, latencyMs: latency, lastPingAt: Date.now() }));
      }
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      setState((s) => ({ ...s, status: "disconnected", latencyMs: null }));
      stopPinging();
      // Schedule auto-reconnect
      reconnectTimerRef.current = setTimeout(() => {
        if (mountedRef.current) connect();
      }, RECONNECT_DELAY);
    };

    ws.onerror = () => {
      // onclose fires after onerror — no separate action needed
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // -----------------------------------------------------------------------
  // Ping / pong
  // -----------------------------------------------------------------------
  const startPinging = useCallback(() => {
    if (pingTimerRef.current) clearInterval(pingTimerRef.current);
    pingTimerRef.current = setInterval(() => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        pingTimestampRef.current = Date.now();
        ws.send("ping");
      }
    }, PING_INTERVAL);
  }, []);

  const stopPinging = useCallback(() => {
    if (pingTimerRef.current) {
      clearInterval(pingTimerRef.current);
      pingTimerRef.current = null;
    }
  }, []);

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------
  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      stopPinging();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        wsRef.current.onopen    = null;
        wsRef.current.onmessage = null;
        wsRef.current.onclose   = null;
        wsRef.current.onerror   = null;
        try { wsRef.current.close(); } catch {}
      }
    };
  }, [connect, stopPinging]);

  // -----------------------------------------------------------------------
  // Manual reconnect
  // -----------------------------------------------------------------------
  function handleReconnect() {
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    connect();
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  const { status, latencyMs } = state;

  const dotStyle: React.CSSProperties =
    status === "connected"
      ? {
          width: 6, height: 6, borderRadius: "50%",
          background: "#00D4FF",
          boxShadow: "0 0 6px #00D4FF",
          animation: "glow-pulse-cyan 1.8s ease-in-out infinite",
        }
      : status === "connecting"
      ? {
          width: 6, height: 6, borderRadius: "50%",
          background: "#FFD700",
          boxShadow: "0 0 6px #FFD700",
          animation: "blink 0.8s step-start infinite",
        }
      : {
          width: 6, height: 6, borderRadius: "50%",
          background: "#FF0080",
          boxShadow: "0 0 4px #FF0080",
        };

  const labelColor =
    status === "connected"   ? "#00D4FF"
    : status === "connecting" ? "#FFD700"
    : "#FF0080";

  return (
    <div
      className="flex items-center gap-2 px-3 py-1 rounded-lg select-none"
      style={{
        background: "rgba(255,255,255,0.03)",
        border:     `1px solid ${labelColor}25`,
      }}
      title={`WebSocket: ${status}`}
    >
      {/* Status dot */}
      <div style={dotStyle} />

      {/* Label */}
      <span
        className="text-xs font-semibold font-mono tracking-wide"
        style={{ color: labelColor, fontSize: "10px" }}
      >
        {status === "connected"
          ? "WS"
          : status === "connecting"
          ? "..."
          : "OFF"}
      </span>

      {/* Latency */}
      {status === "connected" && latencyMs !== null && (
        <span className="text-xs font-mono" style={{ color: "#475569", fontSize: "10px" }}>
          {latencyMs}ms
        </span>
      )}

      {/* Reconnect button (disconnected only) */}
      {status === "disconnected" && (
        <button
          onClick={handleReconnect}
          title="Reconnect WebSocket"
          className="p-0.5 rounded transition-all hover:opacity-80"
          style={{ color: "#FF0080" }}
        >
          <RefreshCw className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
