import { SkeletonPage, SkeletonTable } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <SkeletonPage>
      <div className="flex gap-1 border-b border-gray-200 mb-5">
        <div className="h-9 w-16 animate-pulse rounded-t bg-gray-100" />
        <div className="h-9 w-24 animate-pulse rounded-t bg-gray-100" />
      </div>
      <SkeletonTable rows={8} cols={5} />
    </SkeletonPage>
  );
}
