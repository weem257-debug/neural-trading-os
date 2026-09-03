import { SkeletonBlock, ShimmerStyleTag } from "@/components/ui/Skeleton";

export default function ExecutionLoading() {
  return (
    <div className="space-y-5">
      <ShimmerStyleTag />

      {/* Header */}
      <div className="flex items-center gap-3">
        <SkeletonBlock height={32} width={32} rounded="rounded-lg" />
        <SkeletonBlock height={28} width={144} />
        <SkeletonBlock height={20} width={64} rounded="rounded-full" />
      </div>

      {/* Mode banner skeleton */}
      <div className="rounded-xl p-4 flex items-center gap-3" style={{ background: "rgba(76,141,246,0.05)", border: "1px solid rgba(76,141,246,0.15)" }}>
        <SkeletonBlock height={20} width={20} rounded="rounded-full" className="flex-shrink-0" />
        <div className="space-y-1.5 flex-1">
          <SkeletonBlock height={16} width={224} />
          <SkeletonBlock height={12} width={288} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        {/* Order form skeleton — 7 cols */}
        <div className="md:col-span-7">
          <div className="rounded-2xl p-5 space-y-4" style={{ background: "rgba(8,11,20,0.7)", border: "1px solid rgba(63,185,80,0.1)" }}>
            <SkeletonBlock height={12} width={96} />
            {/* Buy/Sell toggle */}
            <div className="flex gap-2">
              <SkeletonBlock className="flex-1" height={48} rounded="rounded-xl" />
              <SkeletonBlock className="flex-1" height={48} rounded="rounded-xl" />
            </div>
            {/* Fields */}
            <div className="grid grid-cols-2 gap-3">
              {[1, 2].map((i) => (
                <div key={i} className="space-y-1.5">
                  <SkeletonBlock height={12} width={64} />
                  <SkeletonBlock height={36} rounded="rounded-xl" />
                </div>
              ))}
            </div>
            {/* Slider */}
            <div className="space-y-2">
              <SkeletonBlock height={12} width={112} />
              <SkeletonBlock height={8} rounded="rounded-full" />
              <div className="flex gap-2">
                {[1, 2, 3, 4].map((i) => (
                  <SkeletonBlock key={i} className="flex-1" height={28} rounded="rounded-lg" />
                ))}
              </div>
            </div>
            {/* Submit button */}
            <SkeletonBlock height={48} rounded="rounded-xl" />
          </div>
        </div>

        {/* Order book + recent — 5 cols */}
        <div className="md:col-span-5 space-y-4">
          <div className="rounded-2xl p-5" style={{ background: "rgba(8,11,20,0.7)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <SkeletonBlock height={12} width={128} className="mb-4" />
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="flex justify-between py-1 px-2">
                <SkeletonBlock height={12} width={64} />
                <SkeletonBlock height={12} width={48} />
              </div>
            ))}
          </div>
          <div className="rounded-2xl p-5" style={{ background: "rgba(8,11,20,0.7)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <SkeletonBlock height={12} width={112} className="mb-4" />
            <div className="flex items-center justify-center h-16">
              <SkeletonBlock height={12} width={128} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
