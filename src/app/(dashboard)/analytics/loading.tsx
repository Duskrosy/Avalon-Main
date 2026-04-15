import { SkeletonPage, SkeletonCard, SkeletonChart, SkeletonTable } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <SkeletonPage>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
      <SkeletonChart className="mb-6" />
      <SkeletonTable rows={5} cols={4} />
    </SkeletonPage>
  );
}
