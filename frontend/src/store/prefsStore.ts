"use client";

import { useEffect, useState } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * UI preferences that survive reloads.
 *
 * `demoData` controls whether the app may fall back to the bundled demo
 * datasets (demo portfolio, demo signal feed, demo risk metrics) when the
 * backend returns nothing. With it off, empty stays empty — the user sees the
 * real state of their account instead of a plausible-looking simulation.
 * Defaults to on so first-time visitors still get a populated UI.
 *
 * `stockView` picks how a list of stocks is drawn: "cards" is a responsive
 * tile grid (readable on a phone), "table" is a dense sortable table with a
 * performance heatmap (better once the list grows past ~15 symbols). Both
 * render the same data — this is purely a display preference, so it belongs
 * next to demoData rather than in per-page state.
 */
export type StockView = "cards" | "table";

interface PrefsState {
  demoData: boolean;
  setDemoData: (on: boolean) => void;
  toggleDemoData: () => void;
  stockView: StockView;
  setStockView: (view: StockView) => void;
}

export const usePrefsStore = create<PrefsState>()(
  persist(
    (set, get) => ({
      demoData: true,
      setDemoData: (on: boolean) => set({ demoData: on }),
      toggleDemoData: () => set({ demoData: !get().demoData }),
      stockView: "cards",
      setStockView: (view: StockView) => set({ stockView: view }),
    }),
    { name: "neural-prefs-storage" }
  )
);

/**
 * SSR-safe reader for `demoData`.
 *
 * zustand/persist rehydrates from localStorage synchronously on the client, so
 * a component reading the raw store renders the persisted value on its very
 * first client pass while the server rendered the default — a structural
 * hydration mismatch (React #418/#423) for any markup that branches on it.
 * This hook reports the default until after mount, mirroring the mounted-guard
 * pattern already used in AuthGuard and Sidebar.
 */
export function useDemoData(): boolean {
  const demoData = usePrefsStore((s) => s.demoData);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? demoData : true;
}

/**
 * SSR-safe reader for `stockView` — same mounted-guard reasoning as
 * `useDemoData`: the persisted value must not reach the first client render,
 * or the cards/table branch hydrates against different server markup.
 */
export function useStockView(): StockView {
  const stockView = usePrefsStore((s) => s.stockView);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? stockView : "cards";
}
