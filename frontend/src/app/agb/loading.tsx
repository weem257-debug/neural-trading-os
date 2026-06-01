export default function AgbLoading() {
  return (
    <div className="max-w-2xl mx-auto py-10 px-4 space-y-6">
      <div className="h-3 w-28 rounded animate-pulse" style={{ background: "rgba(0,212,255,0.12)" }} />

      <div className="space-y-2">
        <div className="h-7 w-64 rounded-xl animate-pulse" style={{ background: "rgba(255,255,255,0.08)" }} />
        <div className="h-3 w-48 rounded animate-pulse" style={{ background: "rgba(100,116,139,0.15)" }} />
      </div>

      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="space-y-2">
          <div className="h-4 w-40 rounded animate-pulse" style={{ background: "rgba(255,255,255,0.07)" }} />
          <div className="h-3 w-full rounded animate-pulse" style={{ background: "rgba(100,116,139,0.1)" }} />
          <div className="h-3 w-full rounded animate-pulse" style={{ background: "rgba(100,116,139,0.08)" }} />
          <div className="h-3 w-3/4 rounded animate-pulse" style={{ background: "rgba(100,116,139,0.06)" }} />
        </div>
      ))}

      {/* WpHG Disclaimer box */}
      <div className="h-20 w-full rounded-xl animate-pulse" style={{ background: "rgba(251,191,36,0.05)", border: "1px solid rgba(251,191,36,0.12)" }} />
    </div>
  );
}
