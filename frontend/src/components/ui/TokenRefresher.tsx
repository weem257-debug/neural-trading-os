"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";

// Runs silently in layout.tsx — checks every 30 min if the JWT is near expiry
// and refreshes it automatically so users are never logged out unexpectedly.
// Also listens for "auth-expired" events dispatched by apiFetch on 401 responses.
export function TokenRefresher() {
  const needsRefresh = useAuthStore((s) => s.needsRefresh);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const logout = useAuthStore((s) => s.logout);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated) return;

    const check = async () => {
      if (needsRefresh()) {
        await refreshToken();
      }
    };

    check();
    const interval = setInterval(check, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [isAuthenticated, needsRefresh, refreshToken]);

  useEffect(() => {
    const handle = () => {
      logout();
      router.push("/login");
    };
    window.addEventListener("auth-expired", handle);
    return () => window.removeEventListener("auth-expired", handle);
  }, [logout, router]);

  return null;
}
