import { SkeletonPage, SkeletonAvatar, SkeletonText } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <SkeletonPage>
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-[var(--radius-lg)] border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] p-4">
            <div className="flex items-start gap-3">
              <SkeletonAvatar size="sm" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-40 animate-pulse rounded bg-[var(--color-border-primary)]" />
                <SkeletonText lines={2} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </SkeletonPage>
  );
}
