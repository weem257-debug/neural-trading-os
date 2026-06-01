export default function AccountLoading() {
  return (
    <div className="max-w-sm mx-auto w-full space-y-4 animate-pulse pt-4">
      {/* Profile card */}
      <div
        className="rounded-2xl p-6"
        style={{ background: "rgba(8,11,20,0.6)", border: "1px solid rgba(0,212,255,0.1)" }}
      >
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl flex-shrink-0" style={{ background: "rgba(0,212,255,0.08)" }} />
          <div className="flex-1 space-y-2">
            <div className="h-5 w-32 rounded" style={{ background: "rgba(255,255,255,0.08)" }} />
            <div className="h-3 w-44 rounded" style={{ background: "rgba(255,255,255,0.04)" }} />
            <div className="h-3 w-24 rounded" style={{ background: "rgba(255,255,255,0.04)" }} />
            <div className="flex gap-2 mt-1">
              <div className="h-5 w-5 rounded" style={{ background: "rgba(0,212,255,0.08)" }} />
              <div className="h-5 w-16 rounded" style={{ background: "rgba(0,212,255,0.06)" }} />
            </div>
          </div>
        </div>
      </div>

      {/* Signal usage */}
      <div
        className="rounded-2xl p-5"
        style={{ background: "rgba(8,11,20,0.6)", border: "1px solid rgba(0,212,255,0.1)" }}
      >
        <div className="h-3 w-40 rounded mb-3" style={{ background: "rgba(255,255,255,0.04)" }} />
        <div className="flex items-baseline justify-between mb-2">
          <div className="h-7 w-20 rounded" style={{ background: "rgba(255,255,255,0.08)" }} />
          <div className="h-4 w-12 rounded" style={{ background: "rgba(255,255,255,0.04)" }} />
        </div>
        <div className="w-full h-2 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }} />
        <div className="h-3 w-48 rounded mt-2" style={{ background: "rgba(255,255,255,0.03)" }} />
      </div>

      {/* Quick links */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: "rgba(8,11,20,0.6)", border: "1px solid rgba(255,255,255,0.07)" }}
      >
        {[0, 1].map((i) => (
          <div
            key={i}
            className="flex items-center gap-4 px-5 py-4"
            style={{ borderTop: i > 0 ? "1px solid rgba(255,255,255,0.05)" : undefined }}
          >
            <div className="w-8 h-8 rounded-lg" style={{ background: "rgba(255,255,255,0.05)" }} />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 w-24 rounded" style={{ background: "rgba(255,255,255,0.07)" }} />
              <div className="h-2.5 w-40 rounded" style={{ background: "rgba(255,255,255,0.04)" }} />
            </div>
            <div className="w-4 h-4 rounded" style={{ background: "rgba(255,255,255,0.05)" }} />
          </div>
        ))}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="rounded-xl p-4 text-center"
            style={{ background: "rgba(8,11,20,0.6)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            <div className="h-5 w-10 rounded mx-auto mb-1" style={{ background: "rgba(255,255,255,0.08)" }} />
            <div className="h-2.5 w-full rounded" style={{ background: "rgba(255,255,255,0.04)" }} />
          </div>
        ))}
      </div>

      {/* Referral link */}
      <div
        className="rounded-2xl p-5"
        style={{ background: "rgba(8,11,20,0.6)", border: "1px solid rgba(0,255,136,0.1)" }}
      >
        <div className="h-3 w-32 rounded mb-3" style={{ background: "rgba(255,255,255,0.04)" }} />
        <div className="h-10 rounded-xl" style={{ background: "rgba(255,255,255,0.05)" }} />
        <div className="h-9 rounded-xl mt-2" style={{ background: "rgba(0,255,136,0.06)" }} />
      </div>
    </div>
  );
}
