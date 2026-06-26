"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { API_BASE } from "@/lib/api";

// ---------------------------------------------------------------------------
// CSRF helper — reads the non-httpOnly csrf_token cookie set by the server.
// Returns empty string in SSR context or when cookie is absent.
// ---------------------------------------------------------------------------
function getCsrfCookie(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

interface AuthState {
  // token is kept in memory only (NOT persisted to localStorage).
  // The real session lives in the httpOnly access_token cookie set by the server.
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
        // token stored in memory only — httpOnly cookie carries the real session
        set({ token, username, role: role ?? null, tier: tier ?? null, expiresAt });
      },

      logout: () => {
        // Best-effort server logout to clear httpOnly cookie
        fetch(`${API_BASE}/api/auth/logout`, {
          method: "POST",
          credentials: "include",
        }).catch(() => {});
        set({ token: null, username: null, role: null, tier: null, expiresAt: null });
      },

      isAuthenticated: () => {
        const state = get();
        // In-memory token present (same session): use expiry check
        if (state.token) {
          if (state.expiresAt && Date.now() > state.expiresAt) return false;
          return true;
        }
        // After page reload: token gone from memory, but persisted username means
        // the user previously logged in. Cookie auth is still active until the
        // server returns 401, at which point apiFetch fires auth-expired.
        return state.username !== null;
      },

      needsRefresh: () => {
        const { token, expiresAt } = get();
        if (!token || !expiresAt) return false;
        // Refresh if within 2 hours of expiry
        return Date.now() > expiresAt - 2 * 60 * 60 * 1000;
      },

      refreshToken: async () => {
        try {
          const csrf = getCsrfCookie();
          const resp = await fetch(`${API_BASE}/api/auth/refresh`, {
            method: "POST",
            credentials: "include",
            headers: csrf ? { "X-CSRF-Token": csrf } : {},
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
        // Fetches fresh tier/role from server — call after Stripe checkout success.
        // Uses cookie auth (credentials: include); no Bearer header needed.
        try {
          const resp = await fetch(`${API_BASE}/api/auth/me`, {
            credentials: "include",
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
      // token is intentionally excluded: it must NOT be stored in localStorage
      // (XSS protection). The httpOnly cookie set by the server is the real session.
      partialize: (state) => ({
        username: state.username,
        role: state.role,
        tier: state.tier,
      }),
    }
  )
);
