import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Passwort vergessen — Neural Trading OS",
  description: "Passwort zurücksetzen. Gib deine E-Mail-Adresse ein und wir senden dir einen Reset-Link.",
  robots: { index: false, follow: false },
};

export default function ForgotPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}

// F-03/F-25: force dynamic rendering so the CSP middleware nonce is
// injected into this route's <script> tags (required to ENFORCE the
// nonce policy instead of Report-Only).
export const dynamic = "force-dynamic";
