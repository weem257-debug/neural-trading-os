import { SkeletonBlock } from "@/components/ui/Skeleton";

export default function BrokersLoading() {
  return (
    <div className="space-y-6 max-w-5xl">
      <SkeletonBlock height={32} width={200} />
      <SkeletonBlock height={112} rounded="rounded-2xl" />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {Array.from({ length: 7 }).map((_, i) => (
          <SkeletonBlock key={i} height={192} rounded="rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
