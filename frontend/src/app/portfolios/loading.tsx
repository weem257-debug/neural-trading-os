import { SkeletonCard, SkeletonTable } from "@/components/ui/Skeleton";

export default function PortfoliosLoading() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div
            className="h-7 w-48 rounded-xl"
            style={{ background: "rgba(0,212,255,0.05)", border: "1px solid rgba(0,212,255,0.07)" }}
          />
          <div
            className="h-4 w-32 rounded-lg"
            style={{ background: "rgba(0,212,255,0.03)", border: "1px solid rgba(0,212,255,0.05)" }}
          />
        </div>
        <div
          className="h-9 w-36 rounded-xl"
          style={{ background: "rgba(0,212,255,0.04)", border: "1px solid rgba(0,212,255,0.08)" }}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>

      <SkeletonTable rows={5} columns={5} />
    </div>
  );
}
