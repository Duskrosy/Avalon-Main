import { SkeletonPage, SkeletonTable } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <SkeletonPage>
      {/* Tab bar skeleton */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-9 w-20 animate-pulse rounded-t bg-gray-100" />
        ))}
      </div>
      <SkeletonTable rows={8} cols={5} />
    </SkeletonPage>
  );
}
