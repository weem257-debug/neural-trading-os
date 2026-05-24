export default function AlertsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg" style={{ background: "rgba(251,191,36,0.08)" }} />
        <div className="space-y-1.5">
          <div className="h-4 w-32 rounded" style={{ background: "rgba(255,255,255,0.06)" }} />
          <div className="h-3 w-20 rounded" style={{ background: "rgba(255,255,255,0.04)" }} />
        </div>
      </div>

      {/* Form skeleton */}
      <div
        className="rounded-xl p-5"
        style={{ background: "rgba(8,11,20,0.7)", border: "1px solid rgba(0,212,255,0.08)" }}
      >
        <div className="h-4 w-24 rounded mb-4" style={{ background: "rgba(255,255,255,0.06)" }} />
        <div className="flex flex-wrap gap-3">
          {[120, 140, 120, 100].map((w, i) => (
            <div key={i} className="h-9 rounded-lg" style={{ width: w, background: "rgba(255,255,255,0.05)" }} />
          ))}
        </div>
      </div>

      {/* Table skeleton */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ background: "rgba(8,11,20,0.7)", border: "1px solid rgba(0,212,255,0.08)" }}
      >
        <div className="px-5 py-3" style={{ borderBottom: "1px solid rgba(0,212,255,0.06)" }}>
          <div className="h-4 w-24 rounded" style={{ background: "rgba(255,255,255,0.06)" }} />
        </div>
        <div className="divide-y" style={{ borderColor: "rgba(255,255,255,0.03)" }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3">
              <div className="h-4 w-14 rounded" style={{ background: "rgba(255,255,255,0.08)" }} />
              <div className="h-4 w-16 rounded" style={{ background: "rgba(255,255,255,0.05)" }} />
              <div className="h-4 w-20 rounded" style={{ background: "rgba(255,255,255,0.05)" }} />
              <div className="h-5 w-16 rounded-full" style={{ background: "rgba(0,212,255,0.08)" }} />
              <div className="h-4 w-28 rounded ml-auto" style={{ background: "rgba(255,255,255,0.04)" }} />
            </div>
          ))}
        </div>
      </div>

      {/* Risk alerts skeleton */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ background: "rgba(8,11,20,0.7)", border: "1px solid rgba(251,191,36,0.08)" }}
      >
        <div className="px-5 py-3" style={{ borderBottom: "1px solid rgba(251,191,36,0.06)" }}>
          <div className="h-4 w-32 rounded" style={{ background: "rgba(255,255,255,0.06)" }} />
        </div>
        <div className="flex items-center justify-center h-20">
          <div className="h-3 w-48 rounded" style={{ background: "rgba(255,255,255,0.04)" }} />
        </div>
      </div>
    </div>
  );
}
