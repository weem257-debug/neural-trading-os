import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Access — Neural Trading OS",
  description: "Secure authentication portal for Neural Trading OS",
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
