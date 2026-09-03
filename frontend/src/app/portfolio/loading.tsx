import { SkeletonBlock, SkeletonCard, SkeletonTable, SkeletonChart } from "@/components/ui/Skeleton";

export default function PortfolioLoading() {
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <SkeletonBlock height={32} width={32} rounded="rounded-lg" />
            <SkeletonBlock height={28} width={112} />
            <SkeletonBlock height={20} width={96} rounded="rounded-full" />
          </div>
          <SkeletonBlock height={12} width={256} />
        </div>
        <SkeletonBlock height={32} width={80} rounded="rounded-xl" />
      </div>

      {/* Hero stats — 4 cols */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <SkeletonCard key={i} />
        ))}
      </div>

      {/* Equity curve */}
      <SkeletonChart height={192} showLegend={false} />

      {/* Positions table */}
      <div className="rounded-2xl p-4" style={{ background: "rgba(8,11,20,0.7)", border: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="flex items-center justify-between mb-4">
          <SkeletonBlock height={12} width={112} />
          <SkeletonBlock height={20} width={112} rounded="rounded-full" />
        </div>
        <SkeletonTable rows={5} columns={7} />
      </div>

      {/* Analytics panel */}
      <div className="rounded-2xl p-5 space-y-4" style={{ background: "rgba(8,11,20,0.7)", border: "1px solid rgba(163,113,247,0.1)" }}>
        <div className="flex items-center justify-between">
          <SkeletonBlock height={12} width={192} />
          <SkeletonBlock height={28} width={28} rounded="rounded-lg" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl p-3 space-y-2" style={{ background: "rgba(255,255,255,0.03)" }}>
              <SkeletonBlock height={12} width={80} />
              <SkeletonBlock height={24} width={64} />
              <SkeletonBlock height={10} width={96} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
