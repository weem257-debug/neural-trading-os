import { SkeletonCard, SkeletonChart, SkeletonTable } from "@/components/ui/Skeleton";

export default function DashboardLoading() {
  return (
    <div className="space-y-5">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div
            className="h-7 w-56 rounded-xl"
            style={{ background: "rgba(0,212,255,0.05)", border: "1px solid rgba(0,212,255,0.07)" }}
          />
          <div
            className="h-4 w-40 rounded-lg"
            style={{ background: "rgba(0,212,255,0.03)", border: "1px solid rgba(0,212,255,0.05)" }}
          />
        </div>
        <div
          className="h-9 w-28 rounded-xl"
          style={{ background: "rgba(0,212,255,0.04)", border: "1px solid rgba(0,212,255,0.08)" }}
        />
      </div>

      {/* Stat cards row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>

      {/* Main chart */}
      <SkeletonChart height={280} />

      {/* Two-column row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SkeletonChart height={200} showLegend={false} />
        <SkeletonChart height={200} showLegend={false} />
      </div>

      {/* Positions table */}
      <SkeletonTable rows={4} columns={6} />
    </div>
  );
}
