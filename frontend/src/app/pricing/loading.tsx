export default function PricingLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />
        <p className="text-xs text-slate-500">Loading pricing…</p>
      </div>
    </div>
  );
}
