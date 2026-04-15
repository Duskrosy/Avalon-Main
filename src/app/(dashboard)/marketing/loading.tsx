import { SkeletonPage, SkeletonTable } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <SkeletonPage>
      <SkeletonTable rows={8} cols={5} />
    </SkeletonPage>
  );
}
