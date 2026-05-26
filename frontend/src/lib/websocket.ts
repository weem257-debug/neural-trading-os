/**
 * WebSocket client with auto-reconnect and channel subscription.
 * Connects to the FastAPI /ws/{channel} endpoint.
 */

import type { WSEvent } from "@/types";

type EventHandler = (event: WSEvent) => void;

const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30_000;

export class TradingWebSocket {
  private ws: WebSocket | null = null;
  private channel: string;
  private handlers: EventHandler[] = [];
  private reconnectAttempts = 0;
  private shouldReconnect = true;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private get reconnectDelayMs(): number {
    const delay = RECONNECT_BASE_MS * Math.pow(2, this.reconnectAttempts);
    return Math.min(delay, RECONNECT_MAX_MS);
  }

  constructor(channel: string = "all") {
    this.channel = channel;
  }

  private getToken(): string {
    try {
      const raw = localStorage.getItem("neural-auth-storage");
      return (JSON.parse(raw || "{}") as { state?: { token?: string } })?.state?.token ?? "";
    } catch {
      return "";
    }
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    const token = this.getToken();
    const url = `${WS_URL}/ws/${this.channel}${token ? `?token=${encodeURIComponent(token)}` : ""}`;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      console.log(`[WS] Connected to channel: ${this.channel}`);
      this.reconnectAttempts = 0; // reset backoff on successful connect
      this.startPing();
    };

    this.ws.onmessage = (event) => {
      try {
        const data: WSEvent = JSON.parse(event.data);
        if ((data as unknown) === "pong") return; // ping response
        this.handlers.forEach((h) => h(data));
      } catch (e) {
        console.warn("[WS] Failed to parse message", e);
      }
    };

    this.ws.onclose = () => {
      console.log(`[WS] Disconnected from channel: ${this.channel}`);
      this.stopPing();
      if (this.shouldReconnect) {
        const delay = this.reconnectDelayMs;
        this.reconnectAttempts++;
        console.log(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
        this.reconnectTimer = setTimeout(() => this.connect(), delay);
      }
    };

    this.ws.onerror = (error) => {
      console.error("[WS] Error:", error);
    };
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.stopPing();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  on(handler: EventHandler): () => void {
    this.handlers.push(handler);
    // Return unsubscribe function
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
    };
  }

  send(data: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    }
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private startPing(): void {
    this.pingInterval = setInterval(() => {
      this.send("ping");
    }, 30_000); // ping every 30s
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }
}

// Pre-built channel sockets for convenience
export const createSignalsSocket = () => new TradingWebSocket("signals");
export const createPortfolioSocket = () => new TradingWebSocket("portfolio");
export const createAlertsSocket = () => new TradingWebSocket("alerts");
export const createPricesSocket = () => new TradingWebSocket("prices");
export const createAllSocket = () => new TradingWebSocket("all");
