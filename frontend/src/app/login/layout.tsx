import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Anmeldung — Neural Trading OS",
  description: "Sicheres Authentifizierungsportal für Neural Trading OS",
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Note: html/body are provided by the root layout (app/layout.tsx).
  // This nested layout only wraps the login page content.
  return <>{children}</>;
}

// F-03/F-25: force dynamic rendering so the CSP middleware nonce is
// injected into this route's <script> tags (required to ENFORCE the
// nonce policy instead of Report-Only).
export const dynamic = "force-dynamic";
