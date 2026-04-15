import { SkeletonPage, SkeletonCard } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <SkeletonPage>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} className="h-40" />
        ))}
      </div>
    </SkeletonPage>
  );
}
