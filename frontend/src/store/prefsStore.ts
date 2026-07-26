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
 */
interface PrefsState {
  demoData: boolean;
  setDemoData: (on: boolean) => void;
  toggleDemoData: () => void;
}

export const usePrefsStore = create<PrefsState>()(
  persist(
    (set, get) => ({
      demoData: true,
      setDemoData: (on: boolean) => set({ demoData: on }),
      toggleDemoData: () => set({ demoData: !get().demoData }),
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
