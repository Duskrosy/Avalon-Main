import { SkeletonPage, Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <SkeletonPage>
      <Skeleton className="h-96 w-full rounded-xl" />
    </SkeletonPage>
  );
}
