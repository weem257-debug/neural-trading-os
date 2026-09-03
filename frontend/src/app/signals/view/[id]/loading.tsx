import { SkeletonBlock, ShimmerStyleTag } from "@/components/ui/Skeleton";

export default function SignalViewLoading() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#0B0E14" }}>
      <ShimmerStyleTag />

      {/* Header bar */}
      <div className="border-b border-white/5 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SkeletonBlock height={20} width={20} />
          <SkeletonBlock height={16} width={128} />
        </div>
        <SkeletonBlock height={12} width={112} />
      </div>

      {/* Signal card */}
      <div className="flex-1 flex items-start justify-center px-4 py-12">
        <div className="w-full max-w-lg" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 24 }}>
          {/* Ticker + Direction badge */}
          <div className="flex items-center justify-between mb-6">
            <div className="space-y-2">
              <SkeletonBlock height={32} width={80} />
              <SkeletonBlock height={12} width={128} />
            </div>
            <SkeletonBlock height={36} width={112} rounded="rounded-lg" style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)" }} />
          </div>

          {/* Confidence bar */}
          <div className="mb-6 space-y-2">
            <div className="flex justify-between">
              <SkeletonBlock height={12} width={64} />
              <SkeletonBlock height={12} width={40} />
            </div>
            <SkeletonBlock height={8} rounded="rounded-full" />
          </div>

          {/* Price target / Stop Loss / Horizon */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-lg p-3 space-y-1" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <SkeletonBlock height={10} />
                <SkeletonBlock height={16} width="75%" />
              </div>
            ))}
          </div>

          {/* Reasoning text */}
          <div className="space-y-2 mb-6">
            <SkeletonBlock height={12} />
            <SkeletonBlock height={12} />
            <SkeletonBlock height={12} width="80%" />
          </div>

          {/* Share buttons */}
          <div className="flex gap-2 pt-4 border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
            <SkeletonBlock height={36} width={112} rounded="rounded-lg" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }} />
            <SkeletonBlock height={36} width={96} rounded="rounded-lg" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }} />
          </div>
        </div>
      </div>
    </div>
  );
}
