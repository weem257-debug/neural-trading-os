"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";

const PUBLIC_PATHS = new Set([
  "/",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/landing",
  "/pricing",
  "/signals/marketplace",
  "/performance",
  "/impressum",
  "/datenschutz",
  "/agb",
  "/unsubscribe",
]);

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());

  // Wait for zustand/persist to rehydrate from localStorage before
  // making auth decisions. Without this, isAuthenticated() is always
  // false on the first render, causing a black screen instead of
  // either rendering the page or redirecting to /login.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const isPublic =
    PUBLIC_PATHS.has(pathname) ||
    pathname.startsWith("/signals/view/") ||
    pathname.startsWith("/invite/");

  useEffect(() => {
    if (!mounted) return;
    if (!isPublic && !isAuthenticated) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [mounted, isPublic, isAuthenticated, pathname, router]);

  // Pre-hydration: render a transparent placeholder so the layout
  // (Sidebar, TickerBar, backgrounds) is already visible while we
  // wait for the auth state to be read from localStorage.
  if (!mounted) {
    return <div className="flex-1" aria-hidden="true" />;
  }

  // Post-hydration: hide content for protected routes until the
  // redirect fires (avoids a flash of protected content).
  if (!isPublic && !isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
