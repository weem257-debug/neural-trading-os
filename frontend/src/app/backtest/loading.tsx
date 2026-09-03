import { SkeletonBlock, ShimmerStyleTag } from "@/components/ui/Skeleton";

export default function BacktestLoading() {
  return (
    <div className="space-y-5">
      <ShimmerStyleTag />

      {/* Header */}
      <div className="flex items-center gap-3">
        <SkeletonBlock height={32} width={32} rounded="rounded-lg" />
        <SkeletonBlock height={28} width={160} />
        <SkeletonBlock height={20} width={64} rounded="rounded-full" />
      </div>

      {/* Form card skeleton */}
      <div className="rounded-2xl p-5" style={{ background: "rgba(8,11,20,0.7)", border: "1px solid rgba(76,141,246,0.1)" }}>
        <SkeletonBlock height={12} width={96} className="mb-4" />
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <SkeletonBlock height={12} width={64} />
              <SkeletonBlock height={36} rounded="rounded-xl" />
            </div>
          ))}
        </div>
        <div className="mt-4 flex gap-3">
          <SkeletonBlock height={40} width={144} rounded="rounded-xl" />
          <SkeletonBlock height={40} width={160} rounded="rounded-xl" />
        </div>
      </div>

      {/* Engine info cards */}
      <div className="grid grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl p-3 flex items-center gap-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <SkeletonBlock height={32} width={32} rounded="rounded-lg" className="flex-shrink-0" />
            <div className="space-y-1.5 flex-1">
              <SkeletonBlock height={14} width={96} />
              <SkeletonBlock height={12} width={128} />
            </div>
          </div>
        ))}
      </div>

      {/* Job list skeleton */}
      <div className="space-y-3">
        <SkeletonBlock height={12} width={128} />
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="flex items-center gap-3">
              <SkeletonBlock height={40} width={40} rounded="rounded-xl" className="flex-shrink-0" />
              <div className="space-y-1.5 flex-1">
                <SkeletonBlock height={16} width={160} />
                <SkeletonBlock height={12} width={256} />
              </div>
              <SkeletonBlock height={24} width={64} rounded="rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
