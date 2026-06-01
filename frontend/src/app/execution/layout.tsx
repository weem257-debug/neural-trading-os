import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Order-Ausführung — Neural Trading OS",
  description: "KI-gestützte Order-Ausführung mit Echtzeit-Orderverwaltung, Slippage-Schätzung und automatischen Risikoschranken.",
  robots: { index: false, follow: false },
};

export default function ExecutionLayout({ children }: { children: React.ReactNode }) {
  return children;
}
