import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Learning Hub — Neural Trading OS",
  description:
    "AI-curated trading knowledge: YouTube video insights, trade retrospectives and pattern learning powered by Claude Sonnet 4.6.",
  openGraph: {
    title: "AI Learning Hub — Neural Trading OS",
    description: "YouTube insights + trade retrospectives curated by Claude AI.",
    type: "website",
  },
  robots: { index: false, follow: false },
};

export default function LearningLayout({ children }: { children: React.ReactNode }) {
  return children;
}
