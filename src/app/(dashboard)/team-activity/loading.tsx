import { SkeletonPage, SkeletonAvatar } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <SkeletonPage>
      <div className="space-y-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3">
            <SkeletonAvatar size="sm" />
            <div className="flex-1">
              <div className="h-4 w-40 animate-pulse rounded bg-gray-200 mb-1" />
              <div className="h-3 w-64 animate-pulse rounded bg-gray-100" />
            </div>
            <div className="h-3 w-16 animate-pulse rounded bg-gray-100" />
          </div>
        ))}
      </div>
    </SkeletonPage>
  );
}
