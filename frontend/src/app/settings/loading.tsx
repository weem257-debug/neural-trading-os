export default function SettingsLoading() {
  return (
    <div className="space-y-6 max-w-3xl animate-pulse">
      {/* Header */}
      <div className="space-y-2">
        <div className="h-7 w-24 rounded" style={{ background: "rgba(255,255,255,0.07)" }} />
        <div className="h-3 w-96 rounded" style={{ background: "rgba(255,255,255,0.04)" }} />
      </div>

      {/* API Config card */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: "rgba(8,11,20,0.7)", border: "1px solid rgba(76,141,246,0.1)" }}
      >
        <div className="px-4 py-3" style={{ background: "rgba(76,141,246,0.06)", borderBottom: "1px solid rgba(76,141,246,0.1)" }}>
          <div className="h-3 w-32 rounded" style={{ background: "rgba(255,255,255,0.06)" }} />
        </div>
        <div className="p-4 space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-1.5">
              <div className="h-3 w-40 rounded" style={{ background: "rgba(255,255,255,0.04)" }} />
              <div className="h-10 rounded-xl" style={{ background: "rgba(255,255,255,0.05)" }} />
            </div>
          ))}
        </div>
      </div>

      {/* Trading Preferences card */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: "rgba(8,11,20,0.7)", border: "1px solid rgba(63,185,80,0.1)" }}
      >
        <div className="px-4 py-3" style={{ background: "rgba(63,185,80,0.06)", borderBottom: "1px solid rgba(63,185,80,0.1)" }}>
          <div className="h-3 w-40 rounded" style={{ background: "rgba(255,255,255,0.06)" }} />
        </div>
        <div className="p-4 space-y-5">
          <div className="space-y-1.5">
            <div className="h-3 w-32 rounded" style={{ background: "rgba(255,255,255,0.04)" }} />
            <div className="h-10 rounded-xl" style={{ background: "rgba(255,255,255,0.05)" }} />
          </div>
          <div className="space-y-2">
            <div className="h-3 w-28 rounded" style={{ background: "rgba(255,255,255,0.04)" }} />
            <div className="flex gap-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex-1 h-9 rounded-xl" style={{ background: "rgba(255,255,255,0.05)" }} />
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <div className="h-3 w-24 rounded" style={{ background: "rgba(255,255,255,0.04)" }} />
            <div className="flex gap-2">
              <div className="flex-1 h-9 rounded-xl" style={{ background: "rgba(76,141,246,0.08)" }} />
              <div className="flex-1 h-9 rounded-xl" style={{ background: "rgba(255,255,255,0.04)" }} />
            </div>
          </div>
        </div>
      </div>

      {/* Notifications card */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: "rgba(8,11,20,0.7)", border: "1px solid rgba(163,113,247,0.1)" }}
      >
        <div className="px-4 py-3" style={{ background: "rgba(163,113,247,0.06)", borderBottom: "1px solid rgba(163,113,247,0.1)" }}>
          <div className="h-3 w-28 rounded" style={{ background: "rgba(255,255,255,0.06)" }} />
        </div>
        <div className="p-4 divide-y" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center justify-between py-3">
              <div className="space-y-1.5">
                <div className="h-3 w-24 rounded" style={{ background: "rgba(255,255,255,0.06)" }} />
                <div className="h-2.5 w-64 rounded" style={{ background: "rgba(255,255,255,0.04)" }} />
              </div>
              <div className="w-11 h-6 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }} />
            </div>
          ))}
        </div>
      </div>

      {/* Price alerts card */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: "rgba(8,11,20,0.7)", border: "1px solid rgba(76,141,246,0.1)" }}
      >
        <div className="px-4 py-3" style={{ background: "rgba(255,170,0,0.06)", borderBottom: "1px solid rgba(255,170,0,0.1)" }}>
          <div className="h-3 w-24 rounded" style={{ background: "rgba(255,255,255,0.06)" }} />
        </div>
        <div className="p-4 space-y-3">
          <div className="flex gap-3">
            <div className="flex-1 h-9 rounded-xl" style={{ background: "rgba(255,255,255,0.05)" }} />
            <div className="w-28 h-9 rounded-xl" style={{ background: "rgba(255,255,255,0.05)" }} />
            <div className="w-24 h-9 rounded-xl" style={{ background: "rgba(255,255,255,0.05)" }} />
            <div className="w-16 h-9 rounded-xl" style={{ background: "rgba(255,170,0,0.08)" }} />
          </div>
          <div className="h-10 rounded-xl" style={{ background: "rgba(255,255,255,0.03)" }} />
        </div>
      </div>

      {/* About card */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: "rgba(8,11,20,0.7)", border: "1px solid rgba(255,255,255,0.07)" }}
      >
        <div className="px-4 py-3" style={{ background: "rgba(76,141,246,0.06)", borderBottom: "1px solid rgba(76,141,246,0.1)" }}>
          <div className="h-3 w-16 rounded" style={{ background: "rgba(255,255,255,0.06)" }} />
        </div>
        <div className="p-4 grid grid-cols-2 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="space-y-1.5">
              <div className="h-2.5 w-16 rounded" style={{ background: "rgba(255,255,255,0.04)" }} />
              <div className="h-4 w-32 rounded" style={{ background: "rgba(255,255,255,0.06)" }} />
            </div>
          ))}
        </div>
      </div>

      {/* Save button */}
      <div className="flex justify-end pb-6">
        <div className="h-10 w-36 rounded-xl" style={{ background: "rgba(76,141,246,0.08)" }} />
      </div>
    </div>
  );
}
