export default function AdminLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header */}
      <div className="space-y-2">
        <div className="h-7 w-40 rounded" style={{ background: "rgba(255,255,255,0.07)" }} />
        <div className="h-3 w-64 rounded" style={{ background: "rgba(255,255,255,0.04)" }} />
      </div>

      {/* Top stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-2xl p-5"
            style={{ background: "rgba(8,11,20,0.7)", border: "1px solid rgba(0,212,255,0.1)" }}
          >
            <div className="h-2.5 w-20 rounded mb-3" style={{ background: "rgba(255,255,255,0.04)" }} />
            <div className="h-8 w-16 rounded" style={{ background: "rgba(255,255,255,0.08)" }} />
          </div>
        ))}
      </div>

      {/* KPI cards (DAU / Conversion / ARPU / Referrals) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-2xl p-4"
            style={{ background: "rgba(8,11,20,0.6)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            <div className="h-2.5 w-24 rounded mb-2" style={{ background: "rgba(255,255,255,0.04)" }} />
            <div className="h-7 w-14 rounded" style={{ background: "rgba(255,255,255,0.07)" }} />
            <div className="h-2.5 w-20 rounded mt-1" style={{ background: "rgba(255,255,255,0.03)" }} />
          </div>
        ))}
      </div>

      {/* Tier breakdown */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-2xl p-4"
            style={{ background: "rgba(8,11,20,0.6)", border: "1px solid rgba(0,212,255,0.08)" }}
          >
            <div className="h-2.5 w-16 rounded mb-2" style={{ background: "rgba(255,255,255,0.04)" }} />
            <div className="h-6 w-10 rounded" style={{ background: "rgba(255,255,255,0.07)" }} />
          </div>
        ))}
      </div>

      {/* Growth chart */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: "rgba(8,11,20,0.7)", border: "1px solid rgba(0,212,255,0.1)" }}
      >
        <div className="px-4 py-3" style={{ background: "rgba(0,212,255,0.06)", borderBottom: "1px solid rgba(0,212,255,0.1)" }}>
          <div className="h-3 w-36 rounded" style={{ background: "rgba(255,255,255,0.06)" }} />
        </div>
        <div className="p-4">
          <div className="h-40 w-full rounded-xl" style={{ background: "rgba(255,255,255,0.03)" }} />
        </div>
      </div>

      {/* Email campaign buttons */}
      <div className="flex flex-wrap gap-3">
        {[120, 100, 140, 110, 130, 120].map((w, i) => (
          <div key={i} className={`h-9 rounded-xl`} style={{ width: `${w}px`, background: "rgba(255,255,255,0.05)" }} />
        ))}
      </div>

      {/* User table */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: "rgba(8,11,20,0.7)", border: "1px solid rgba(0,212,255,0.1)" }}
      >
        {/* Table header */}
        <div
          className="grid grid-cols-5 gap-4 px-4 py-3"
          style={{ background: "rgba(0,212,255,0.06)", borderBottom: "1px solid rgba(0,212,255,0.1)" }}
        >
          {[80, 120, 60, 60, 80].map((w, i) => (
            <div key={i} className="h-2.5 rounded" style={{ width: `${w}%`, background: "rgba(255,255,255,0.06)" }} />
          ))}
        </div>
        {/* Table rows */}
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="grid grid-cols-5 gap-4 px-4 py-3.5"
            style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
          >
            <div className="h-3 rounded" style={{ width: "70%", background: "rgba(255,255,255,0.06)" }} />
            <div className="h-3 rounded" style={{ width: "90%", background: "rgba(255,255,255,0.04)" }} />
            <div className="h-5 w-14 rounded-full" style={{ background: "rgba(0,212,255,0.08)" }} />
            <div className="h-3 rounded" style={{ width: "60%", background: "rgba(255,255,255,0.04)" }} />
            <div className="h-3 rounded" style={{ width: "80%", background: "rgba(255,255,255,0.04)" }} />
          </div>
        ))}
      </div>
    </div>
  );
}
