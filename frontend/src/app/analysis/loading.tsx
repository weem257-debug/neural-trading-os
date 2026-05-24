export default function AnalysisLoading() {
  return (
    <div className="p-6 space-y-6 animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-6 w-48 rounded-lg bg-white/5" />
          <div className="h-4 w-72 rounded bg-white/5" />
        </div>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-8 w-12 rounded-lg bg-white/5" />
          ))}
          <div className="h-8 w-32 rounded-lg bg-white/5" />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="rounded-2xl p-4 space-y-2"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <div className="h-3 w-20 rounded bg-white/5" />
            <div className="h-6 w-28 rounded bg-white/5" />
            <div className="h-3 w-16 rounded bg-white/5" />
          </div>
        ))}
      </div>

      {/* Chart skeleton */}
      <div
        className="rounded-2xl p-4"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", height: 380 }}
      />

      {/* Bottom grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-2xl p-4 space-y-3"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", height: 220 }}
          >
            <div className="h-4 w-24 rounded bg-white/5" />
            {[1, 2, 3, 4].map((j) => (
              <div key={j} className="h-3 w-full rounded bg-white/5" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
