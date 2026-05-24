/**
 * Landing page layout — overrides the root layout.
 * No Sidebar, no TickerBar. Clean full-screen experience.
 *
 * Note: html/body are provided by the root layout (app/layout.tsx).
 * This nested layout only wraps landing page content.
 */
import type { Metadata } from "next";
import { landingMetadata } from "./metadata";

export const metadata: Metadata = landingMetadata;

export default function LandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
