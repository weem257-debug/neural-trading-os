export default function SignalViewLoading() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#080b14" }}>
      {/* Header bar */}
      <div className="border-b border-white/5 px-4 py-3 flex items-center justify-between animate-pulse">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded" style={{ background: "rgba(0,212,255,0.15)" }} />
          <div className="h-4 w-32 rounded" style={{ background: "rgba(0,212,255,0.1)" }} />
        </div>
        <div className="h-3 w-28 rounded" style={{ background: "rgba(100,116,139,0.15)" }} />
      </div>

      {/* Signal card */}
      <div className="flex-1 flex items-start justify-center px-4 py-12">
        <div
          className="w-full max-w-lg animate-pulse"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 24 }}
        >
          {/* Ticker + Direction badge */}
          <div className="flex items-center justify-between mb-6">
            <div className="space-y-2">
              <div className="h-8 w-20 rounded" style={{ background: "rgba(255,255,255,0.08)" }} />
              <div className="h-3 w-32 rounded" style={{ background: "rgba(100,116,139,0.12)" }} />
            </div>
            <div className="h-9 w-28 rounded-lg" style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)" }} />
          </div>

          {/* Confidence bar */}
          <div className="mb-6 space-y-2">
            <div className="flex justify-between">
              <div className="h-3 w-16 rounded" style={{ background: "rgba(100,116,139,0.15)" }} />
              <div className="h-3 w-10 rounded" style={{ background: "rgba(100,116,139,0.15)" }} />
            </div>
            <div className="h-2 w-full rounded-full" style={{ background: "rgba(255,255,255,0.05)" }}>
              <div className="h-2 w-3/4 rounded-full" style={{ background: "rgba(34,197,94,0.25)" }} />
            </div>
          </div>

          {/* Price target / Stop Loss / Horizon */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-lg p-3 space-y-1" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="h-2.5 w-full rounded" style={{ background: "rgba(100,116,139,0.15)" }} />
                <div className="h-4 w-3/4 rounded" style={{ background: "rgba(255,255,255,0.07)" }} />
              </div>
            ))}
          </div>

          {/* Reasoning text */}
          <div className="space-y-2 mb-6">
            <div className="h-3 w-full rounded" style={{ background: "rgba(100,116,139,0.1)" }} />
            <div className="h-3 w-full rounded" style={{ background: "rgba(100,116,139,0.08)" }} />
            <div className="h-3 w-4/5 rounded" style={{ background: "rgba(100,116,139,0.06)" }} />
          </div>

          {/* Share buttons */}
          <div className="flex gap-2 pt-4 border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
            <div className="h-9 w-28 rounded-lg" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }} />
            <div className="h-9 w-24 rounded-lg" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }} />
          </div>
        </div>
      </div>
    </div>
  );
}
