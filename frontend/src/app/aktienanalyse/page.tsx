"use client";

/**
 * Public, no-login stock-analysis page (SEO surface — see Sidebar.tsx which
 * hides the app chrome for anonymous visitors on this route). The actual
 * report tool now lives in components/analysis/StockReport.tsx so the exact
 * same tool can also be embedded as a collapsible section on /live without
 * duplicating any logic. `standalone` restores the full-viewport public
 * chrome (sticky share header + full-screen background) this page always had.
 */
import { StockReport } from "@/components/analysis/StockReport";

export default function AktienanalysePage() {
  return <StockReport standalone />;
}
