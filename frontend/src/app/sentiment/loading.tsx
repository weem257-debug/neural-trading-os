import { SkeletonBlock } from "@/components/ui/Skeleton";

export default function SentimentLoading() {
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <SkeletonBlock height={32} width={32} rounded="rounded-xl" />
          <SkeletonBlock height={28} width={160} />
          <SkeletonBlock height={22} width={100} rounded="rounded-full" />
        </div>
        <SkeletonBlock height={14} width={280} />
      </div>

      {/* Search panel */}
      <div
        className="rounded-2xl p-5"
        style={{
          background: "linear-gradient(135deg, rgba(123,47,255,0.06), rgba(123,47,255,0.02))",
          border: "1px solid rgba(123,47,255,0.12)",
        }}
      >
        <SkeletonBlock height={10} width={120} className="mb-4" />
        <div className="flex gap-3">
          <SkeletonBlock height={44} className="flex-1" rounded="rounded-xl" />
          <SkeletonBlock height={44} width={120} rounded="rounded-xl" />
        </div>
      </div>

      {/* Heatmap */}
      <div
        className="rounded-2xl p-5"
        style={{
          background: "linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015))",
          border: "1px solid rgba(0,212,255,0.1)",
        }}
      >
        <SkeletonBlock height={10} width={140} className="mb-4" />
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="aspect-square rounded-xl"
              style={{
                background: "rgba(0,212,255,0.04)",
                border: "1px solid rgba(0,212,255,0.07)",
                opacity: 1 - i * 0.03,
              }}
            />
          ))}
        </div>
      </div>

      {/* Result cards */}
      {Array.from({ length: 2 }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl p-5"
          style={{
            background: "linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015))",
            border: "1px solid rgba(0,212,255,0.1)",
            opacity: 1 - i * 0.2,
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <SkeletonBlock height={40} width={40} rounded="rounded-xl" />
              <div className="space-y-1.5">
                <SkeletonBlock height={18} width={60} />
                <SkeletonBlock height={11} width={110} />
              </div>
            </div>
            <SkeletonBlock height={34} width={70} rounded="rounded-xl" />
          </div>

          {/* Sentiment bar */}
          <SkeletonBlock height={12} rounded="rounded-full" className="mb-3" />
          <div className="flex gap-4">
            {Array.from({ length: 3 }).map((_, j) => (
              <SkeletonBlock key={j} height={10} width={80} />
            ))}
          </div>

          {/* News items */}
          <div className="mt-4 space-y-2">
            <SkeletonBlock height={10} width={120} className="mb-3" />
            {Array.from({ length: 2 }).map((_, j) => (
              <div
                key={j}
                className="flex items-start gap-3 p-3 rounded-xl"
                style={{ background: "rgba(0,212,255,0.03)", border: "1px solid rgba(0,212,255,0.07)" }}
              >
                <SkeletonBlock height={16} width={16} rounded="rounded-full" />
                <div className="flex-1 space-y-2">
                  <SkeletonBlock height={12} />
                  <SkeletonBlock height={10} width="60%" />
                </div>
                <SkeletonBlock height={26} width={40} rounded="rounded-lg" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
