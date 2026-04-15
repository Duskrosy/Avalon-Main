import { SkeletonPage, SkeletonAvatar } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <SkeletonPage>
      {/* Tab bar */}
      <div className="flex gap-1 border-b border-gray-200 mb-8">
        <div className="h-9 w-24 animate-pulse rounded-t bg-gray-100" />
        <div className="h-9 w-28 animate-pulse rounded-t bg-gray-100" />
      </div>
      {/* Avatar + form fields */}
      <div className="max-w-xl space-y-6">
        <SkeletonAvatar size="xl" />
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i}>
              <div className="h-3 w-20 animate-pulse rounded bg-gray-200 mb-2" />
              <div className="h-10 w-full animate-pulse rounded-lg bg-gray-100" />
            </div>
          ))}
        </div>
      </div>
    </SkeletonPage>
  );
}
