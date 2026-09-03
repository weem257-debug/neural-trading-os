import { SkeletonBlock, SkeletonTable, ShimmerStyleTag } from "@/components/ui/Skeleton";

export default function AdminLoading() {
  return (
    <div className="space-y-6">
      <ShimmerStyleTag />

      {/* Header */}
      <div className="space-y-2">
        <SkeletonBlock height={28} width={160} />
        <SkeletonBlock height={12} width={256} />
      </div>

      {/* Top stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-2xl p-5" style={{ background: "rgba(8,11,20,0.7)", border: "1px solid rgba(76,141,246,0.1)" }}>
            <SkeletonBlock height={10} width={80} className="mb-3" />
            <SkeletonBlock height={32} width={64} />
          </div>
        ))}
      </div>

      {/* KPI cards (DAU / Conversion / ARPU / Referrals) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-2xl p-4" style={{ background: "rgba(8,11,20,0.6)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <SkeletonBlock height={10} width={96} className="mb-2" />
            <SkeletonBlock height={28} width={56} />
            <SkeletonBlock height={10} width={80} className="mt-1" />
          </div>
        ))}
      </div>

      {/* Tier breakdown */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-2xl p-4" style={{ background: "rgba(8,11,20,0.6)", border: "1px solid rgba(76,141,246,0.08)" }}>
            <SkeletonBlock height={10} width={64} className="mb-2" />
            <SkeletonBlock height={24} width={40} />
          </div>
        ))}
      </div>

      {/* Growth chart */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(8,11,20,0.7)", border: "1px solid rgba(76,141,246,0.1)" }}>
        <div className="px-4 py-3" style={{ background: "rgba(76,141,246,0.06)", borderBottom: "1px solid rgba(76,141,246,0.1)" }}>
          <SkeletonBlock height={12} width={144} />
        </div>
        <div className="p-4">
          <SkeletonBlock height={160} rounded="rounded-xl" />
        </div>
      </div>

      {/* Email campaign buttons */}
      <div className="flex flex-wrap gap-3">
        {[120, 100, 140, 110, 130, 120].map((w, i) => (
          <SkeletonBlock key={i} height={36} width={w} rounded="rounded-xl" />
        ))}
      </div>

      {/* User table */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(8,11,20,0.7)", border: "1px solid rgba(76,141,246,0.1)" }}>
        <SkeletonTable rows={6} columns={5} />
      </div>
    </div>
  );
}
