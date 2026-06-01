export default function DatenschutzLoading() {
  return (
    <div className="max-w-2xl mx-auto py-10 px-4 space-y-6">
      <div className="h-3 w-28 rounded animate-pulse" style={{ background: "rgba(0,212,255,0.12)" }} />

      <div className="space-y-2">
        <div className="h-7 w-52 rounded-xl animate-pulse" style={{ background: "rgba(255,255,255,0.08)" }} />
        <div className="h-3 w-60 rounded animate-pulse" style={{ background: "rgba(100,116,139,0.15)" }} />
      </div>

      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="space-y-2">
          <div className="h-4 w-44 rounded animate-pulse" style={{ background: "rgba(255,255,255,0.07)" }} />
          <div className="h-3 w-full rounded animate-pulse" style={{ background: "rgba(100,116,139,0.1)" }} />
          <div className="h-3 w-5/6 rounded animate-pulse" style={{ background: "rgba(100,116,139,0.08)" }} />
          <div className="h-3 w-2/3 rounded animate-pulse" style={{ background: "rgba(100,116,139,0.06)" }} />
        </div>
      ))}
    </div>
  );
}
