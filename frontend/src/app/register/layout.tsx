import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Registrieren — Neural Trading OS",
  description: "Kostenloses Konto erstellen. Sofortiger Zugang zu KI-Handelssignalen, Paper Trading und Portfolio-Tracking.",
  robots: { index: true, follow: true },
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}

// F-03/F-25: force dynamic rendering so the CSP middleware nonce is
// injected into this route's <script> tags (required to ENFORCE the
// nonce policy instead of Report-Only).
export const dynamic = "force-dynamic";
