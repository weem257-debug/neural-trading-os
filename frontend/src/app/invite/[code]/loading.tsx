export default function InviteLoading() {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-12"
      style={{ background: "linear-gradient(135deg, #080b14 0%, #0d1117 50%, #080b14 100%)" }}
    >
      <div className="w-full max-w-md space-y-8 animate-pulse">
        {/* Invite banner */}
        <div className="h-10 w-full rounded-xl" style={{ background: "rgba(0,212,255,0.07)", border: "1px solid rgba(0,212,255,0.15)" }} />

        {/* Logo + heading */}
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-2xl" style={{ background: "rgba(0,212,255,0.08)", border: "1px solid rgba(0,212,255,0.15)" }} />
          <div className="h-6 w-64 rounded-xl" style={{ background: "rgba(255,255,255,0.07)" }} />
          <div className="h-4 w-48 rounded" style={{ background: "rgba(100,116,139,0.15)" }} />
        </div>

        {/* Feature list */}
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex-shrink-0" style={{ background: "rgba(0,212,255,0.08)" }} />
              <div className="h-3 flex-1 rounded" style={{ background: "rgba(100,116,139,0.12)" }} />
            </div>
          ))}
        </div>

        {/* CTA button */}
        <div className="h-12 w-full rounded-xl" style={{ background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.2)" }} />

        {/* Login link */}
        <div className="h-3 w-40 mx-auto rounded" style={{ background: "rgba(100,116,139,0.1)" }} />
      </div>
    </div>
  );
}
