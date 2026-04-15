import { SkeletonPage, SkeletonTable } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <SkeletonPage>
      <div className="flex gap-1 border-b border-[var(--color-border-primary)] mb-5">
        <div className="h-9 w-16 animate-pulse rounded-t bg-[var(--color-bg-tertiary)]" />
        <div className="h-9 w-24 animate-pulse rounded-t bg-[var(--color-bg-tertiary)]" />
      </div>
      <SkeletonTable rows={8} cols={5} />
    </SkeletonPage>
  );
}
