export default function RegisterLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <div
        className="w-full max-w-sm animate-pulse"
        style={{
          background: "rgba(8,11,20,0.85)",
          border: "1px solid rgba(0,212,255,0.15)",
          borderRadius: "1rem",
          backdropFilter: "blur(24px)",
        }}
      >
        <div className="px-8 py-10 space-y-6">
          {/* Logo skeleton */}
          <div className="flex flex-col items-center gap-3 mb-2">
            <div className="w-14 h-14 rounded-xl" style={{ background: "rgba(0,212,255,0.08)", border: "1px solid rgba(0,212,255,0.15)" }} />
            <div className="h-4 w-40 rounded" style={{ background: "rgba(0,212,255,0.1)" }} />
            <div className="h-3 w-28 rounded" style={{ background: "rgba(100,116,139,0.15)" }} />
          </div>

          {/* Form fields skeleton */}
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-1.5">
              <div className="h-3 w-24 rounded" style={{ background: "rgba(100,116,139,0.2)" }} />
              <div className="h-10 w-full rounded-lg" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(0,212,255,0.12)" }} />
            </div>
          ))}

          {/* DSGVO checkbox skeleton */}
          <div className="flex items-start gap-3">
            <div className="w-4 h-4 mt-0.5 rounded flex-shrink-0" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(0,212,255,0.15)" }} />
            <div className="space-y-1 flex-1">
              <div className="h-3 w-full rounded" style={{ background: "rgba(100,116,139,0.12)" }} />
              <div className="h-3 w-3/4 rounded" style={{ background: "rgba(100,116,139,0.08)" }} />
            </div>
          </div>

          {/* Button skeleton */}
          <div className="h-11 w-full rounded-lg" style={{ background: "rgba(0,212,255,0.08)", border: "1px solid rgba(0,212,255,0.15)" }} />
        </div>
      </div>
    </div>
  );
}
