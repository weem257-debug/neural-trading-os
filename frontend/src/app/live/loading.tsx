import { SkeletonBlock, SkeletonCard, SkeletonChart } from "@/components/ui/Skeleton";

export default function LiveAnalysisLoading() {
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <SkeletonBlock height={32} width={32} rounded="rounded-xl" />
            <SkeletonBlock height={28} width={200} />
            <SkeletonBlock height={22} width={70} rounded="rounded-full" />
          </div>
          <SkeletonBlock height={14} width={280} />
        </div>
      </div>

      {/* Watchlist chips */}
      <div
        className="rounded-2xl p-4 flex flex-wrap gap-2"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
      >
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonBlock key={i} height={32} width={80} rounded="rounded-xl" />
        ))}
      </div>

      {/* Price header + signal row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SkeletonCard />
        <SkeletonCard />
      </div>

      {/* Indicator tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>

      {/* Chart */}
      <SkeletonChart height={420} />
    </div>
  );
}
