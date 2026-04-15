import { SkeletonPage, SkeletonTable } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <SkeletonPage>
      <SkeletonTable rows={6} cols={4} />
    </SkeletonPage>
  );
}
