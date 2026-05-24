export default function PortfolioLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg" style={{ background: "rgba(123,47,255,0.1)" }} />
            <div className="h-7 w-28 rounded" style={{ background: "rgba(255,255,255,0.06)" }} />
            <div className="h-5 w-24 rounded-full" style={{ background: "rgba(123,47,255,0.08)" }} />
          </div>
          <div className="h-3 w-64 rounded" style={{ background: "rgba(255,255,255,0.03)" }} />
        </div>
        <div className="h-8 w-20 rounded-xl" style={{ background: "rgba(255,255,255,0.04)" }} />
      </div>

      {/* Hero stats — 4 cols */}
      <div className="grid grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-xl p-4 space-y-3"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <div className="w-8 h-8 rounded-lg" style={{ background: "rgba(255,255,255,0.06)" }} />
            <div className="h-3 w-20 rounded" style={{ background: "rgba(255,255,255,0.04)" }} />
            <div className="h-7 w-28 rounded" style={{ background: "rgba(255,255,255,0.07)" }} />
          </div>
        ))}
      </div>

      {/* Equity curve */}
      <div
        className="rounded-2xl p-5"
        style={{ background: "rgba(8,11,20,0.7)", border: "1px solid rgba(0,212,255,0.1)" }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="h-3 w-36 rounded" style={{ background: "rgba(255,255,255,0.06)" }} />
          <div className="h-3 w-16 rounded" style={{ background: "rgba(0,255,136,0.08)" }} />
        </div>
        <div className="h-48 rounded-xl" style={{ background: "rgba(0,212,255,0.04)" }} />
      </div>

      {/* Positions table */}
      <div
        className="rounded-2xl p-4"
        style={{ background: "rgba(8,11,20,0.7)", border: "1px solid rgba(255,255,255,0.07)" }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="h-3 w-28 rounded" style={{ background: "rgba(255,255,255,0.06)" }} />
          <div className="h-5 w-28 rounded-full" style={{ background: "rgba(123,47,255,0.08)" }} />
        </div>
        <div className="space-y-0">
          {/* Table header */}
          <div
            className="flex gap-4 py-2"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
          >
            {[40, 24, 28, 28, 32, 28, 20].map((w, i) => (
              <div key={i} className={`h-3 w-${w} rounded`} style={{ background: "rgba(255,255,255,0.04)" }} />
            ))}
          </div>
          {/* Rows */}
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="flex items-center gap-4 py-3"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}
            >
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg" style={{ background: "rgba(255,255,255,0.06)" }} />
                <div className="space-y-1">
                  <div className="h-3 w-12 rounded" style={{ background: "rgba(255,255,255,0.07)" }} />
                  <div className="h-2.5 w-10 rounded" style={{ background: "rgba(255,255,255,0.04)" }} />
                </div>
              </div>
              <div className="h-3 w-10 rounded" style={{ background: "rgba(255,255,255,0.05)" }} />
              <div className="h-3 w-16 rounded" style={{ background: "rgba(255,255,255,0.05)" }} />
              <div className="h-3 w-16 rounded" style={{ background: "rgba(255,255,255,0.06)" }} />
              <div className="h-3 w-16 rounded" style={{ background: "rgba(255,255,255,0.05)" }} />
              <div className="space-y-1">
                <div className="h-3 w-16 rounded" style={{ background: i % 2 === 0 ? "rgba(0,255,136,0.1)" : "rgba(255,0,128,0.1)" }} />
                <div className="h-2.5 w-12 rounded" style={{ background: "rgba(255,255,255,0.04)" }} />
              </div>
              <div className="flex items-center gap-2">
                <div className="w-16 h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }} />
                <div className="h-2.5 w-8 rounded" style={{ background: "rgba(255,255,255,0.04)" }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Analytics panel */}
      <div
        className="rounded-2xl p-5 space-y-4"
        style={{ background: "rgba(8,11,20,0.7)", border: "1px solid rgba(123,47,255,0.1)" }}
      >
        <div className="flex items-center justify-between">
          <div className="h-3 w-48 rounded" style={{ background: "rgba(255,255,255,0.06)" }} />
          <div className="h-7 w-7 rounded-lg" style={{ background: "rgba(255,255,255,0.04)" }} />
        </div>
        <div className="grid grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl p-3 space-y-2" style={{ background: "rgba(255,255,255,0.03)" }}>
              <div className="h-3 w-20 rounded" style={{ background: "rgba(255,255,255,0.04)" }} />
              <div className="h-6 w-16 rounded" style={{ background: "rgba(255,255,255,0.07)" }} />
              <div className="h-2.5 w-24 rounded" style={{ background: "rgba(255,255,255,0.03)" }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
