import { SkeletonPage, Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <SkeletonPage>
      <div className="flex gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex-1 rounded-xl border border-gray-200 bg-white p-4 space-y-3">
            <div className="h-4 w-20 animate-pulse rounded bg-gray-200" />
            <Skeleton className="h-20 w-full rounded-lg" />
            <Skeleton className="h-20 w-full rounded-lg" />
            <Skeleton className="h-20 w-full rounded-lg" />
          </div>
        ))}
      </div>
    </SkeletonPage>
  );
}
