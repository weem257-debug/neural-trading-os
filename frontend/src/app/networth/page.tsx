import { redirect } from "next/navigation";

/**
 * "Nettovermögen" now lives as a collapsible section on /depot (see
 * components/depot/NetWorthSection.tsx). This route is kept so existing
 * bookmarks / deep links don't break — it redirects server-side, which also
 * works correctly on direct navigation (no client-side flash).
 */
export default function NetWorthPage() {
  redirect("/depot");
}
