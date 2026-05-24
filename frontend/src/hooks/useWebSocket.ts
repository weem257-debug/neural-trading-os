/**
 * React hook for WebSocket subscriptions.
 * Handles connect/disconnect on mount/unmount and re-renders on new events.
 */

"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { TradingWebSocket } from "@/lib/websocket";
import type { WSEvent } from "@/types";

interface UseWebSocketOptions {
  autoConnect?: boolean;
}

export function useWebSocket(
  channel: string,
  options: UseWebSocketOptions = {}
) {
  const { autoConnect = true } = options;
  const socketRef = useRef<TradingWebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<WSEvent | null>(null);
  const [events, setEvents] = useState<WSEvent[]>([]);

  useEffect(() => {
    if (!autoConnect) return;

    const socket = new TradingWebSocket(channel);
    socketRef.current = socket;

    const unsubscribe = socket.on((event) => {
      setLastEvent(event);
      setEvents((prev) => [event, ...prev].slice(0, 100)); // keep last 100

      if (event.type === "connected") {
        setConnected(true);
      }
    });

    socket.connect();

    // Poll connection state every second
    const interval = setInterval(() => {
      setConnected(socket.isConnected);
    }, 1000);

    return () => {
      unsubscribe();
      socket.disconnect();
      clearInterval(interval);
    };
  }, [channel, autoConnect]);

  const send = useCallback((data: string) => {
    socketRef.current?.send(data);
  }, []);

  return { connected, lastEvent, events, send };
}

/**
 * Convenience hooks for specific channels.
 */
export const useSignalsStream = () => useWebSocket("signals");
export const usePortfolioStream = () => useWebSocket("portfolio");
export const useAlertsStream = () => useWebSocket("alerts");
export const usePricesStream = () => useWebSocket("prices");
