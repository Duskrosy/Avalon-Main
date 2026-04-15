import { SkeletonPage, SkeletonTable } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <SkeletonPage>
      {/* Filter bar skeleton */}
      <div className="flex gap-3 mb-4">
        <div className="h-9 w-36 animate-pulse rounded-lg bg-gray-200" />
        <div className="h-9 w-36 animate-pulse rounded-lg bg-gray-200" />
        <div className="h-9 w-28 animate-pulse rounded-lg bg-gray-200" />
      </div>
      <SkeletonTable rows={10} cols={6} />
    </SkeletonPage>
  );
}
