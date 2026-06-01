export default function LandingLoading() {
  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(135deg, #080b14 0%, #0d1117 50%, #080b14 100%)" }}>
      {/* Nav skeleton */}
      <div className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto">
        <div className="h-5 w-36 rounded animate-pulse" style={{ background: "rgba(0,212,255,0.12)" }} />
        <div className="flex gap-3">
          <div className="h-8 w-20 rounded-lg animate-pulse" style={{ background: "rgba(255,255,255,0.05)" }} />
          <div className="h-8 w-24 rounded-lg animate-pulse" style={{ background: "rgba(0,212,255,0.1)" }} />
        </div>
      </div>

      {/* Hero skeleton */}
      <div className="flex flex-col items-center text-center px-4 pt-16 pb-12 max-w-3xl mx-auto gap-6">
        <div className="h-6 w-48 rounded-full animate-pulse" style={{ background: "rgba(0,212,255,0.1)" }} />
        <div className="space-y-3 w-full">
          <div className="h-10 w-4/5 mx-auto rounded-xl animate-pulse" style={{ background: "rgba(255,255,255,0.06)" }} />
          <div className="h-10 w-3/5 mx-auto rounded-xl animate-pulse" style={{ background: "rgba(255,255,255,0.04)" }} />
        </div>
        <div className="h-4 w-2/3 rounded animate-pulse" style={{ background: "rgba(100,116,139,0.2)" }} />
        <div className="flex gap-3 mt-2">
          <div className="h-12 w-40 rounded-xl animate-pulse" style={{ background: "rgba(0,212,255,0.12)" }} />
          <div className="h-12 w-32 rounded-xl animate-pulse" style={{ background: "rgba(255,255,255,0.05)" }} />
        </div>
      </div>

      {/* Stats row skeleton */}
      <div className="flex justify-center gap-8 py-6 max-w-2xl mx-auto px-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col items-center gap-1.5">
            <div className="h-7 w-20 rounded animate-pulse" style={{ background: "rgba(0,212,255,0.1)" }} />
            <div className="h-3 w-16 rounded animate-pulse" style={{ background: "rgba(100,116,139,0.15)" }} />
          </div>
        ))}
      </div>

      {/* Feature cards skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mx-auto px-6 py-8">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="rounded-2xl p-5 animate-pulse" style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="w-8 h-8 rounded-lg mb-3" style={{ background: "rgba(0,212,255,0.1)" }} />
            <div className="h-4 w-3/4 rounded mb-2" style={{ background: "rgba(255,255,255,0.07)" }} />
            <div className="h-3 w-full rounded mb-1" style={{ background: "rgba(100,116,139,0.12)" }} />
            <div className="h-3 w-2/3 rounded" style={{ background: "rgba(100,116,139,0.08)" }} />
          </div>
        ))}
      </div>
    </div>
  );
}
