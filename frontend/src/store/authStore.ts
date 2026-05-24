"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AuthState {
  token: string | null;
  username: string | null;
  login: (token: string, username: string) => void;
  logout: () => void;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      username: null,
      login: (token: string, username: string) => {
        set({ token, username });
      },
      logout: () => {
        set({ token: null, username: null });
      },
      isAuthenticated: () => {
        const state = get();
        return !!state.token;
      },
    }),
    {
      name: "neural-auth-storage",
      partialize: (state) => ({
        token: state.token,
        username: state.username,
      }),
    }
  )
);
