import { SkeletonPage, Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <SkeletonPage>
      <div className="flex gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex-1 rounded-[var(--radius-lg)] border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] p-4 space-y-3">
            <div className="h-4 w-20 animate-pulse rounded bg-[var(--color-border-primary)]" />
            <Skeleton className="h-20 w-full rounded-lg" />
            <Skeleton className="h-20 w-full rounded-lg" />
            <Skeleton className="h-20 w-full rounded-lg" />
          </div>
        ))}
      </div>
    </SkeletonPage>
  );
}
