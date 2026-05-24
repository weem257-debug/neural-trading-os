export default function ExecutionLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg" style={{ background: "rgba(0,255,136,0.08)" }} />
        <div className="h-7 w-36 rounded" style={{ background: "rgba(255,255,255,0.06)" }} />
        <div className="h-5 w-16 rounded-full" style={{ background: "rgba(0,212,255,0.08)" }} />
      </div>

      {/* Mode banner skeleton */}
      <div
        className="rounded-xl p-4 flex items-center gap-3"
        style={{ background: "rgba(0,212,255,0.05)", border: "1px solid rgba(0,212,255,0.15)" }}
      >
        <div className="w-5 h-5 rounded-full flex-shrink-0" style={{ background: "rgba(0,212,255,0.15)" }} />
        <div className="space-y-1.5 flex-1">
          <div className="h-4 w-56 rounded" style={{ background: "rgba(255,255,255,0.06)" }} />
          <div className="h-3 w-72 rounded" style={{ background: "rgba(255,255,255,0.04)" }} />
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* Order form skeleton — 7 cols */}
        <div className="col-span-7">
          <div
            className="rounded-2xl p-5 space-y-4"
            style={{ background: "rgba(8,11,20,0.7)", border: "1px solid rgba(0,255,136,0.1)" }}
          >
            <div className="h-3 w-24 rounded" style={{ background: "rgba(255,255,255,0.06)" }} />
            {/* Buy/Sell toggle */}
            <div className="flex gap-2">
              <div className="flex-1 h-12 rounded-xl" style={{ background: "rgba(0,255,136,0.08)" }} />
              <div className="flex-1 h-12 rounded-xl" style={{ background: "rgba(255,255,255,0.04)" }} />
            </div>
            {/* Fields */}
            <div className="grid grid-cols-2 gap-3">
              {[1, 2].map((i) => (
                <div key={i} className="space-y-1.5">
                  <div className="h-3 w-16 rounded" style={{ background: "rgba(255,255,255,0.04)" }} />
                  <div className="h-9 rounded-xl" style={{ background: "rgba(255,255,255,0.05)" }} />
                </div>
              ))}
            </div>
            {/* Slider */}
            <div className="space-y-2">
              <div className="h-3 w-28 rounded" style={{ background: "rgba(255,255,255,0.04)" }} />
              <div className="h-2 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }} />
              <div className="flex gap-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex-1 h-7 rounded-lg" style={{ background: "rgba(255,255,255,0.04)" }} />
                ))}
              </div>
            </div>
            {/* Submit button */}
            <div className="h-12 rounded-xl" style={{ background: "rgba(0,255,136,0.07)" }} />
          </div>
        </div>

        {/* Order book + recent — 5 cols */}
        <div className="col-span-5 space-y-4">
          <div
            className="rounded-2xl p-5"
            style={{ background: "rgba(8,11,20,0.7)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            <div className="h-3 w-32 rounded mb-4" style={{ background: "rgba(255,255,255,0.06)" }} />
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="flex justify-between py-1 px-2">
                <div className="h-3 w-16 rounded" style={{ background: i < 5 ? "rgba(255,0,128,0.1)" : "rgba(0,255,136,0.1)" }} />
                <div className="h-3 w-12 rounded" style={{ background: "rgba(255,255,255,0.04)" }} />
              </div>
            ))}
          </div>
          <div
            className="rounded-2xl p-5"
            style={{ background: "rgba(8,11,20,0.7)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            <div className="h-3 w-28 rounded mb-4" style={{ background: "rgba(255,255,255,0.06)" }} />
            <div className="flex items-center justify-center h-16">
              <div className="h-3 w-32 rounded" style={{ background: "rgba(255,255,255,0.04)" }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
