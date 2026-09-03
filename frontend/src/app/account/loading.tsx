import { SkeletonBlock, ShimmerStyleTag } from "@/components/ui/Skeleton";

export default function AccountLoading() {
  return (
    <div className="max-w-sm mx-auto w-full space-y-4 pt-4">
      <ShimmerStyleTag />

      {/* Profile card */}
      <div className="rounded-2xl p-6" style={{ background: "rgba(8,11,20,0.6)", border: "1px solid rgba(76,141,246,0.1)" }}>
        <div className="flex items-center gap-4">
          <SkeletonBlock height={64} width={64} rounded="rounded-2xl" className="flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <SkeletonBlock height={20} width={128} />
            <SkeletonBlock height={12} width={176} />
            <SkeletonBlock height={12} width={96} />
            <div className="flex gap-2 mt-1">
              <SkeletonBlock height={20} width={20} />
              <SkeletonBlock height={20} width={64} />
            </div>
          </div>
        </div>
      </div>

      {/* Signal usage */}
      <div className="rounded-2xl p-5" style={{ background: "rgba(8,11,20,0.6)", border: "1px solid rgba(76,141,246,0.1)" }}>
        <SkeletonBlock height={12} width={160} className="mb-3" />
        <div className="flex items-baseline justify-between mb-2">
          <SkeletonBlock height={28} width={80} />
          <SkeletonBlock height={16} width={48} />
        </div>
        <SkeletonBlock height={8} rounded="rounded-full" />
        <SkeletonBlock height={12} width={192} className="mt-2" />
      </div>

      {/* Quick links */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(8,11,20,0.6)", border: "1px solid rgba(255,255,255,0.07)" }}>
        {[0, 1].map((i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-4" style={{ borderTop: i > 0 ? "1px solid rgba(255,255,255,0.05)" : undefined }}>
            <SkeletonBlock height={32} width={32} rounded="rounded-lg" />
            <div className="flex-1 space-y-1.5">
              <SkeletonBlock height={14} width={96} />
              <SkeletonBlock height={10} width={160} />
            </div>
            <SkeletonBlock height={16} width={16} />
          </div>
        ))}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-xl p-4 text-center" style={{ background: "rgba(8,11,20,0.6)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <SkeletonBlock height={20} width={40} className="mx-auto mb-1" />
            <SkeletonBlock height={10} />
          </div>
        ))}
      </div>

      {/* Referral link */}
      <div className="rounded-2xl p-5" style={{ background: "rgba(8,11,20,0.6)", border: "1px solid rgba(63,185,80,0.1)" }}>
        <SkeletonBlock height={12} width={128} className="mb-3" />
        <SkeletonBlock height={40} rounded="rounded-xl" />
        <SkeletonBlock height={36} rounded="rounded-xl" className="mt-2" />
      </div>
    </div>
  );
}
