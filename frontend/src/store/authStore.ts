"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { API_BASE } from "@/lib/api";

interface AuthState {
  token: string | null;
  username: string | null;
  role: string | null;
  tier: string | null;
  expiresAt: number | null;
  login: (token: string, username: string, role?: string, expiresIn?: number, tier?: string) => void;
  logout: () => void;
  isAuthenticated: () => boolean;
  needsRefresh: () => boolean;
  refreshToken: () => Promise<void>;
  syncUserInfo: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      username: null,
      role: null,
      tier: null,
      expiresAt: null,
      login: (token: string, username: string, role?: string, expiresIn?: number, tier?: string) => {
        const expiresAt = expiresIn ? Date.now() + expiresIn * 1000 : null;
        set({ token, username, role: role ?? null, tier: tier ?? null, expiresAt });
      },
      logout: () => {
        set({ token: null, username: null, role: null, tier: null, expiresAt: null });
      },
      isAuthenticated: () => {
        const state = get();
        if (!state.token) return false;
        if (state.expiresAt && Date.now() > state.expiresAt) return false;
        return true;
      },
      needsRefresh: () => {
        const { token, expiresAt } = get();
        if (!token || !expiresAt) return false;
        return Date.now() > expiresAt - 2 * 60 * 60 * 1000;
      },
      refreshToken: async () => {
        const { token } = get();
        if (!token) return;
        try {
          const resp = await fetch(`${API_BASE}/api/auth/refresh`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!resp.ok) return;
          const data = await resp.json();
          const expiresAt = data.expires_in ? Date.now() + data.expires_in * 1000 : null;
          set({ token: data.access_token, expiresAt });
        } catch {
          // silent — next check will retry
        }
      },
      syncUserInfo: async () => {
        // Fetches fresh tier/role from server — call after Stripe checkout success
        const { token } = get();
        if (!token) return;
        try {
          const resp = await fetch(`${API_BASE}/api/auth/me`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!resp.ok) return;
          const me = await resp.json();
          set({ role: me.role ?? get().role, tier: me.tier ?? get().tier });
        } catch {
          // silent
        }
      },
    }),
    {
      name: "neural-auth-storage",
      partialize: (state) => ({
        token: state.token,
        username: state.username,
        role: state.role,
        tier: state.tier,
        expiresAt: state.expiresAt,
      }),
    }
  )
);
