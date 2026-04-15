import { SkeletonPage, SkeletonTable } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <SkeletonPage>
      <div className="flex gap-3 mb-4">
        <div className="h-9 w-36 animate-pulse rounded-lg bg-[var(--color-border-primary)]" />
        <div className="h-9 w-28 animate-pulse rounded-lg bg-[var(--color-border-primary)]" />
      </div>
      <SkeletonTable rows={8} cols={6} />
    </SkeletonPage>
  );
}
