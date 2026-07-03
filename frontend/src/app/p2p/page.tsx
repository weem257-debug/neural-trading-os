import { redirect } from "next/navigation";

/**
 * "P2P Kredite" now lives as a collapsible section on /depot (see
 * components/depot/P2PSection.tsx). This route is kept so existing
 * bookmarks / deep links don't break — it redirects server-side, which also
 * works correctly on direct navigation (no client-side flash).
 */
export default function P2PPage() {
  redirect("/depot");
}
