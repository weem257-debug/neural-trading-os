import { redirect } from "next/navigation";

/**
 * "Broker & Depots" now lives as a collapsible section on /depot (see
 * components/depot/BrokersSection.tsx). This route is kept so existing
 * bookmarks / deep links don't break — it redirects server-side, which also
 * works correctly on direct navigation (no client-side flash).
 */
export default function BrokersPage() {
  redirect("/depot");
}
