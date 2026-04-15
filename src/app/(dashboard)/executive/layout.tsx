import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { Suspense } from "react";
import { TabNav } from "./tab-nav";
import { DateRangeBar } from "./date-range-bar";

export default async function ExecutiveLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) redirect("/login");
  if (!isOps(user)) redirect("/");

  return (
    <div>
      {/* Page header */}
      <div className="flex items-end justify-between mb-0">
        <div className="pb-4">
          <div className="flex items-center gap-2.5 mb-0.5">
            <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">Executive Dashboard</h1>
            <span className="text-xs px-2 py-0.5 bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] rounded-full font-medium">OPS</span>
          </div>
          <p className="text-sm text-[var(--color-text-secondary)]">{format(new Date(), "EEEE, d MMMM yyyy")}</p>
        </div>
        <Suspense fallback={<div className="pb-4 h-8 w-52" />}>
          <DateRangeBar />
        </Suspense>
      </div>

      {/* Tab navigation */}
      <div className="border-b border-[var(--color-border-primary)] mb-6">
        <Suspense fallback={<div className="h-10" />}>
          <TabNav />
        </Suspense>
      </div>

      {children}
    </div>
  );
}
