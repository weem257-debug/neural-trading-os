export default function PerformanceLoading() {
  return (
    <div className="min-h-screen px-4 py-12 max-w-5xl mx-auto space-y-10">
      {/* Heading */}
      <div className="text-center space-y-3">
        <div className="h-8 w-64 mx-auto rounded-xl animate-pulse" style={{ background: "rgba(0,212,255,0.1)" }} />
        <div className="h-4 w-80 mx-auto rounded animate-pulse" style={{ background: "rgba(100,116,139,0.15)" }} />
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-2xl p-5 animate-pulse" style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-4 h-4 rounded" style={{ background: "rgba(0,212,255,0.15)" }} />
              <div className="h-3 w-20 rounded" style={{ background: "rgba(100,116,139,0.15)" }} />
            </div>
            <div className="h-8 w-24 rounded-lg mb-1" style={{ background: "rgba(255,255,255,0.07)" }} />
            <div className="h-3 w-16 rounded" style={{ background: "rgba(100,116,139,0.1)" }} />
          </div>
        ))}
      </div>

      {/* Signal table skeleton */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="px-5 py-4 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          <div className="h-4 w-40 rounded animate-pulse" style={{ background: "rgba(255,255,255,0.07)" }} />
        </div>
        <div className="divide-y" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3 animate-pulse">
              <div className="h-4 w-14 rounded" style={{ background: "rgba(255,255,255,0.06)" }} />
              <div className="h-4 w-10 rounded" style={{ background: "rgba(0,212,255,0.08)" }} />
              <div className="flex-1 h-3 rounded" style={{ background: "rgba(100,116,139,0.1)" }} />
              <div className="h-4 w-12 rounded" style={{ background: "rgba(0,255,136,0.1)" }} />
            </div>
          ))}
        </div>
      </div>

      {/* CTA skeleton */}
      <div className="flex justify-center">
        <div className="h-12 w-52 rounded-xl animate-pulse" style={{ background: "rgba(0,212,255,0.1)" }} />
      </div>
    </div>
  );
}
