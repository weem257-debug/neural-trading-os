import { SkeletonBlock, SkeletonCard } from "@/components/ui/Skeleton";

export default function SignalsLoading() {
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <SkeletonBlock height={32} width={32} rounded="rounded-xl" />
        <SkeletonBlock height={28} width={140} />
        <SkeletonBlock height={22} width={80} rounded="rounded-full" />
      </div>
      <SkeletonBlock height={14} width={300} />

      {/* Generator panel skeleton */}
      <div
        className="rounded-2xl p-5"
        style={{
          background: "linear-gradient(135deg, rgba(0,255,136,0.04), rgba(0,255,136,0.015))",
          border: "1px solid rgba(0,255,136,0.1)",
        }}
      >
        <SkeletonBlock height={10} width={100} className="mb-4" />
        <div className="flex gap-3 items-end">
          <div className="flex-1 space-y-2">
            <SkeletonBlock height={10} width={80} />
            <SkeletonBlock height={44} />
          </div>
          <div className="space-y-2">
            <SkeletonBlock height={10} width={80} />
            <div className="flex gap-2">
              <SkeletonBlock height={44} width={80} rounded="rounded-xl" />
              <SkeletonBlock height={44} width={80} rounded="rounded-xl" />
            </div>
          </div>
          <div className="flex gap-2">
            <SkeletonBlock height={44} width={80} rounded="rounded-xl" />
            <SkeletonBlock height={44} width={110} rounded="rounded-xl" />
          </div>
        </div>
      </div>

      {/* Signal cards skeleton */}
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl p-4"
            style={{
              background: "linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015))",
              border: "1px solid rgba(0,212,255,0.12)",
              opacity: 1 - i * 0.15,
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-4">
                <SkeletonBlock height={48} width={48} rounded="rounded-xl" />
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <SkeletonBlock height={18} width={60} />
                    <SkeletonBlock height={22} width={70} rounded="rounded-full" />
                  </div>
                  <SkeletonBlock height={10} width={140} />
                </div>
              </div>
              <div className="space-y-1.5 text-right">
                <SkeletonBlock height={12} width={90} />
                <SkeletonBlock height={12} width={70} />
              </div>
            </div>
            {/* Confidence bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <SkeletonBlock height={10} width={80} />
                <SkeletonBlock height={10} width={40} />
              </div>
              <SkeletonBlock height={8} rounded="rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
