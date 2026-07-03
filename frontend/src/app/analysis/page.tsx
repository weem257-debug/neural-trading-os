import { redirect } from "next/navigation";

/**
 * "Elliott-Wellen" now lives as a collapsible section on /live (see
 * components/analysis/ElliottWave.tsx). This route is kept so existing
 * bookmarks / deep links don't break — it redirects server-side, which also
 * works correctly on direct navigation (no client-side flash).
 */
export default function AnalysisPage() {
  redirect("/live");
}
