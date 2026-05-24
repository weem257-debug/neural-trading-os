export default function BacktestLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg" style={{ background: "rgba(0,212,255,0.08)" }} />
        <div className="h-7 w-40 rounded" style={{ background: "rgba(255,255,255,0.06)" }} />
        <div className="h-5 w-16 rounded-full" style={{ background: "rgba(0,212,255,0.08)" }} />
      </div>

      {/* Form card skeleton */}
      <div
        className="rounded-2xl p-5"
        style={{ background: "rgba(8,11,20,0.7)", border: "1px solid rgba(0,212,255,0.1)" }}
      >
        <div className="h-3 w-24 rounded mb-4" style={{ background: "rgba(255,255,255,0.06)" }} />
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="h-3 w-16 rounded" style={{ background: "rgba(255,255,255,0.04)" }} />
              <div className="h-9 rounded-xl" style={{ background: "rgba(255,255,255,0.05)" }} />
            </div>
          ))}
        </div>
        <div className="mt-4 flex gap-3">
          <div className="h-10 w-36 rounded-xl" style={{ background: "rgba(0,212,255,0.08)" }} />
          <div className="h-10 w-40 rounded-xl" style={{ background: "rgba(0,255,136,0.06)" }} />
        </div>
      </div>

      {/* Engine info cards */}
      <div className="grid grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl p-3 flex items-center gap-3"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <div className="w-8 h-8 rounded-lg flex-shrink-0" style={{ background: "rgba(255,255,255,0.06)" }} />
            <div className="space-y-1.5 flex-1">
              <div className="h-3.5 w-24 rounded" style={{ background: "rgba(255,255,255,0.06)" }} />
              <div className="h-3 w-32 rounded" style={{ background: "rgba(255,255,255,0.04)" }} />
            </div>
          </div>
        ))}
      </div>

      {/* Job list skeleton */}
      <div className="space-y-3">
        <div className="h-3 w-32 rounded" style={{ background: "rgba(255,255,255,0.05)" }} />
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl p-4"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex-shrink-0" style={{ background: "rgba(0,212,255,0.08)" }} />
              <div className="space-y-1.5 flex-1">
                <div className="h-4 w-40 rounded" style={{ background: "rgba(255,255,255,0.07)" }} />
                <div className="h-3 w-64 rounded" style={{ background: "rgba(255,255,255,0.04)" }} />
              </div>
              <div className="h-6 w-16 rounded-full" style={{ background: "rgba(0,255,136,0.08)" }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
