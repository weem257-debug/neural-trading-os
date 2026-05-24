/**
 * Global Zustand store — central state for the trading dashboard.
 * Holds latest data from all modules.
 */

import { create } from "zustand";
import type {
  TradingSignal,
  PortfolioSnapshot,
  SentimentSummary,
  RiskMetrics,
  BacktestJob,
  OrderResponse,
  AnyOrder,
} from "@/types";

interface TradingStore {
  // Signals
  signals: TradingSignal[];
  addSignal: (signal: TradingSignal) => void;
  setSignals: (signals: TradingSignal[]) => void;

  // Portfolio
  portfolio: PortfolioSnapshot | null;
  setPortfolio: (portfolio: PortfolioSnapshot) => void;

  // Sentiment
  sentimentMap: Record<string, SentimentSummary>;
  setSentiment: (ticker: string, summary: SentimentSummary) => void;

  // Risk
  riskMetrics: RiskMetrics | null;
  setRiskMetrics: (metrics: RiskMetrics) => void;

  // Backtesting
  backtestJobs: BacktestJob[];
  setBacktestJobs: (jobs: BacktestJob[]) => void;
  addBacktestJob: (job: BacktestJob) => void;
  updateBacktestJob: (job: BacktestJob) => void;

  // Orders
  recentOrders: AnyOrder[];
  addOrder: (order: OrderResponse) => void;
  setRecentOrders: (orders: AnyOrder[]) => void;

  // Alerts
  alerts: Array<{ id: string; message: string; level: string; ts: string }>;
  addAlert: (message: string, level?: string) => void;
  clearAlerts: () => void;

  // Prices
  prices: Record<string, { price: number; change_pct: number; ts: string }>;
  updatePrice: (ticker: string, price: number, change_pct: number) => void;

  // UI state
  selectedTicker: string;
  setSelectedTicker: (ticker: string) => void;
}

export const useTradingStore = create<TradingStore>((set) => ({
  // Signals
  signals: [],
  addSignal: (signal) =>
    set((state) => ({
      signals: [signal, ...state.signals].slice(0, 50),
    })),
  setSignals: (signals) => set({ signals }),

  // Portfolio
  portfolio: null,
  setPortfolio: (portfolio) => set({ portfolio }),

  // Sentiment
  sentimentMap: {},
  setSentiment: (ticker, summary) =>
    set((state) => ({
      sentimentMap: { ...state.sentimentMap, [ticker]: summary },
    })),

  // Risk
  riskMetrics: null,
  setRiskMetrics: (riskMetrics) => set({ riskMetrics }),

  // Backtesting
  backtestJobs: [],
  setBacktestJobs: (backtestJobs) => set({ backtestJobs }),
  addBacktestJob: (job) =>
    set((state) => ({ backtestJobs: [job, ...state.backtestJobs] })),
  updateBacktestJob: (job) =>
    set((state) => ({
      backtestJobs: state.backtestJobs.map((j) =>
        j.id === job.id ? job : j
      ),
    })),

  // Orders — mix of OrderResponse (new submissions) and OrderHistoryItem (from DB)
  recentOrders: [],
  addOrder: (order) =>
    set((state) => ({
      recentOrders: [order, ...state.recentOrders].slice(0, 50),
    })),
  setRecentOrders: (orders) => set({ recentOrders: orders.slice(0, 50) }),

  // Alerts
  alerts: [],
  addAlert: (message, level = "warning") =>
    set((state) => ({
      alerts: [
        { id: Date.now().toString(), message, level, ts: new Date().toISOString() },
        ...state.alerts,
      ].slice(0, 100),
    })),
  clearAlerts: () => set({ alerts: [] }),

  // Prices
  prices: {},
  updatePrice: (ticker, price, change_pct) =>
    set((state) => ({
      prices: {
        ...state.prices,
        [ticker]: { price, change_pct, ts: new Date().toISOString() },
      },
    })),

  // UI
  selectedTicker: "AAPL",
  setSelectedTicker: (selectedTicker) => set({ selectedTicker }),
}));
