export default function LoginLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
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
            <div className="h-4 w-36 rounded" style={{ background: "rgba(0,212,255,0.1)" }} />
            <div className="h-3 w-24 rounded" style={{ background: "rgba(100,116,139,0.15)" }} />
          </div>

          {/* Username field */}
          <div className="space-y-1.5">
            <div className="h-3 w-20 rounded" style={{ background: "rgba(100,116,139,0.2)" }} />
            <div className="h-10 w-full rounded-lg" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(0,212,255,0.12)" }} />
          </div>

          {/* Password field */}
          <div className="space-y-1.5">
            <div className="h-3 w-16 rounded" style={{ background: "rgba(100,116,139,0.2)" }} />
            <div className="h-10 w-full rounded-lg" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(0,212,255,0.12)" }} />
          </div>

          {/* Button + forgot-pw link */}
          <div className="space-y-3">
            <div className="h-11 w-full rounded-lg" style={{ background: "rgba(0,212,255,0.08)", border: "1px solid rgba(0,212,255,0.15)" }} />
            <div className="h-3 w-32 mx-auto rounded" style={{ background: "rgba(100,116,139,0.12)" }} />
          </div>

          {/* Demo credentials box */}
          <div className="h-16 w-full rounded-lg" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }} />
        </div>
      </div>
    </div>
  );
}
