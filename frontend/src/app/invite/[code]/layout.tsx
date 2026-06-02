import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Einladung — Neural Trading OS",
  description: "Du wurdest zu Neural Trading OS eingeladen. Kostenlos registrieren und 3 KI-Handelssignale täglich erhalten.",
  robots: { index: false, follow: false },
};

// For `output: export` (Capacitor mobile build) the dynamic `[code]` segment
// needs static params. The page itself is fully client-rendered and reads the
// real code from the URL at runtime, so a single placeholder route suffices.
// `generateStaticParams` must live in this server layout (not the client page).
export function generateStaticParams() {
  return [{ code: "_" }];
}

export const dynamicParams = true;

export default function InviteLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
