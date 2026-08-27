import { SkeletonBlock } from "@/components/ui/Skeleton";

export default function ChartsLoading() {
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <SkeletonBlock height={32} width={32} rounded="rounded-lg" />
          <SkeletonBlock height={28} width={120} />
          <SkeletonBlock height={22} width={70} rounded="rounded-full" />
        </div>
        <SkeletonBlock height={14} width={320} />
      </div>

      {/* Chart */}
      <SkeletonBlock height={480} rounded="rounded-xl" />

      {/* Stock board */}
      <div
        className="rounded-xl p-3 space-y-3"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(76,141,246,0.2)" }}
      >
        <div className="flex items-center justify-between">
          <SkeletonBlock height={14} width={100} />
          <SkeletonBlock height={26} width={90} rounded="rounded-lg" />
        </div>
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonBlock key={i} height={96} rounded="rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
