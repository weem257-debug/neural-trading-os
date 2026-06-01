import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Einladung — Neural Trading OS",
  description: "Du wurdest zu Neural Trading OS eingeladen. Kostenlos registrieren und 3 KI-Handelssignale täglich erhalten.",
  robots: { index: false, follow: false },
};

export default function InviteLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
