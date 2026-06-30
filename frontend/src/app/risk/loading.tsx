import { SkeletonBlock, SkeletonCard, SkeletonChart } from "@/components/ui/Skeleton";

export default function RiskLoading() {
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <SkeletonBlock height={32} width={32} rounded="rounded-xl" />
            <SkeletonBlock height={28} width={140} />
            <SkeletonBlock height={22} width={80} rounded="rounded-full" />
          </div>
          <SkeletonBlock height={14} width={260} />
        </div>
        <SkeletonBlock height={36} width={90} rounded="rounded-xl" />
      </div>

      {/* Tachometer gauges row */}
      <div
        className="rounded-2xl p-5"
        style={{
          background: "linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015))",
          border: "1px solid rgba(255,0,128,0.1)",
        }}
      >
        <SkeletonBlock height={10} width={100} className="mb-5" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl p-5 flex flex-col items-center"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <SkeletonBlock height={110} width={180} rounded="rounded-xl" className="mb-2" />
              <SkeletonBlock height={12} width={100} />
              <SkeletonBlock height={20} width={70} rounded="rounded-full" className="mt-2" />
            </div>
          ))}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>

      {/* Risk bar sections */}
      <div className="grid grid-cols-2 gap-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl p-5"
            style={{
              background: "linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015))",
              border: "1px solid rgba(0,212,255,0.1)",
            }}
          >
            <SkeletonBlock height={10} width={120} className="mb-4" />
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="space-y-2">
                  <div className="flex justify-between">
                    <SkeletonBlock height={10} width={140} />
                    <SkeletonBlock height={10} width={50} />
                  </div>
                  <SkeletonBlock height={8} rounded="rounded-full" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
