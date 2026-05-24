export default function P2PLoading() {
  return (
    <div className="max-w-5xl mx-auto animate-pulse">
      <div className="h-8 w-48 rounded-lg bg-slate-800/60 mb-2" />
      <div className="h-4 w-72 rounded bg-slate-800/40 mb-8" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-slate-800/40" />
        ))}
      </div>
      <div className="h-48 rounded-2xl bg-slate-800/30 mb-6" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-64 rounded-2xl bg-slate-800/30" />
        ))}
      </div>
    </div>
  );
}
