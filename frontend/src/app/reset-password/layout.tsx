import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Neues Passwort setzen — Neural Trading OS",
  description: "Setze dein neues Passwort für dein Neural Trading OS Konto.",
  robots: { index: false, follow: false },
};

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}

// F-03/F-25: force dynamic rendering so the CSP middleware nonce is
// injected into this route's <script> tags (required to ENFORCE the
// nonce policy instead of Report-Only).
export const dynamic = "force-dynamic";
