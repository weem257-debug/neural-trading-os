import { SkeletonCard } from "@/components/ui/Skeleton";

export default function DepotLoading() {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div
          className="h-7 w-40 rounded-xl"
          style={{ background: "rgba(0,212,255,0.05)", border: "1px solid rgba(0,212,255,0.07)" }}
        />
        <div
          className="h-4 w-64 rounded-lg"
          style={{ background: "rgba(0,212,255,0.03)", border: "1px solid rgba(0,212,255,0.05)" }}
        />
      </div>

      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="h-14 rounded-xl"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
        />
      ))}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}
