export default function MarketplaceLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 rounded-full border-2 border-neon-green border-t-transparent animate-spin" />
        <p className="text-xs text-slate-500">Loading marketplace…</p>
      </div>
    </div>
  );
}
