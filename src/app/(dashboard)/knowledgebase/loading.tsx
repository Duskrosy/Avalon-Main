import { SkeletonPage, SkeletonText } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <SkeletonPage>
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="h-4 w-48 animate-pulse rounded bg-gray-200 mb-2" />
            <SkeletonText lines={2} />
          </div>
        ))}
      </div>
    </SkeletonPage>
  );
}
