import { SkeletonBlock, ShimmerStyleTag } from "@/components/ui/Skeleton";

function Card({
  outline,
  accent,
  headerWidth,
  children,
}: {
  outline?: string;
  accent: string;
  headerWidth: number;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: "rgba(8,11,20,0.7)", border: `1px solid ${outline ?? `${accent}1a`}` }}
    >
      <div className="px-4 py-3" style={{ background: `${accent}0f`, borderBottom: `1px solid ${accent}1a` }}>
        <SkeletonBlock height={12} width={headerWidth} />
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

export default function SettingsLoading() {
  return (
    <div className="space-y-6 max-w-3xl">
      <ShimmerStyleTag />

      {/* Header */}
      <div className="space-y-2">
        <SkeletonBlock height={28} width={96} />
        <SkeletonBlock height={12} width={384} />
      </div>

      {/* API Config card */}
      <Card accent="#4C8DF6" headerWidth={128}>
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-1.5">
              <SkeletonBlock height={12} width={160} />
              <SkeletonBlock height={40} rounded="rounded-xl" />
            </div>
          ))}
        </div>
      </Card>

      {/* Trading Preferences card */}
      <Card accent="#3FB950" headerWidth={160}>
        <div className="space-y-5">
          <div className="space-y-1.5">
            <SkeletonBlock height={12} width={128} />
            <SkeletonBlock height={40} rounded="rounded-xl" />
          </div>
          <div className="space-y-2">
            <SkeletonBlock height={12} width={112} />
            <div className="flex gap-2">
              {[0, 1, 2].map((i) => (
                <SkeletonBlock key={i} className="flex-1" height={36} rounded="rounded-xl" />
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <SkeletonBlock height={12} width={96} />
            <div className="flex gap-2">
              <SkeletonBlock className="flex-1" height={36} rounded="rounded-xl" />
              <SkeletonBlock className="flex-1" height={36} rounded="rounded-xl" />
            </div>
          </div>
        </div>
      </Card>

      {/* Notifications card */}
      <Card accent="#A371F7" headerWidth={112}>
        <div className="divide-y" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center justify-between py-3">
              <div className="space-y-1.5">
                <SkeletonBlock height={12} width={96} />
                <SkeletonBlock height={10} width={256} />
              </div>
              <SkeletonBlock height={24} width={44} rounded="rounded-full" />
            </div>
          ))}
        </div>
      </Card>

      {/* Price alerts card */}
      <Card outline="rgba(76,141,246,0.1)" accent="#FFAA00" headerWidth={96}>
        <div className="space-y-3">
          <div className="flex gap-3">
            <SkeletonBlock className="flex-1" height={36} rounded="rounded-xl" />
            <SkeletonBlock width={112} height={36} rounded="rounded-xl" />
            <SkeletonBlock width={96} height={36} rounded="rounded-xl" />
            <SkeletonBlock width={64} height={36} rounded="rounded-xl" />
          </div>
          <SkeletonBlock height={40} rounded="rounded-xl" />
        </div>
      </Card>

      {/* About card */}
      <Card outline="rgba(255,255,255,0.07)" accent="#4C8DF6" headerWidth={64}>
        <div className="grid grid-cols-2 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="space-y-1.5">
              <SkeletonBlock height={10} width={64} />
              <SkeletonBlock height={16} width={128} />
            </div>
          ))}
        </div>
      </Card>

      {/* Save button */}
      <div className="flex justify-end pb-6">
        <SkeletonBlock width={144} height={40} rounded="rounded-xl" />
      </div>
    </div>
  );
}
