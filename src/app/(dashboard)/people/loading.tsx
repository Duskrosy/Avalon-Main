import { SkeletonPage, SkeletonAvatar, SkeletonText } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <SkeletonPage>
      <div className="space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100">
            <SkeletonAvatar size="sm" />
            <div className="flex-1">
              <div className="h-4 w-32 animate-pulse rounded bg-gray-200 mb-1" />
              <div className="h-3 w-48 animate-pulse rounded bg-gray-100" />
            </div>
          </div>
        ))}
      </div>
    </SkeletonPage>
  );
}
