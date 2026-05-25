import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Trade Execution — Neural Trading OS",
  description: "AI-assisted trade execution with real-time order management, slippage estimation and automated risk gates.",
  robots: { index: false, follow: false },
};

export default function ExecutionLayout({ children }: { children: React.ReactNode }) {
  return children;
}
