import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Neues Passwort setzen — Neural Trading OS",
  description: "Setze dein neues Passwort für dein Neural Trading OS Konto.",
  robots: { index: false, follow: false },
};

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
