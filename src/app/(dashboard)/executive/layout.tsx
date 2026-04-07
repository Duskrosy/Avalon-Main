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
            <h1 className="text-2xl font-semibold text-gray-900">Executive Dashboard</h1>
            <span className="text-xs px-2 py-0.5 bg-gray-900 text-white rounded-full font-medium">OPS</span>
          </div>
          <p className="text-sm text-gray-500">{format(new Date(), "EEEE, d MMMM yyyy")}</p>
        </div>
        <Suspense fallback={<div className="pb-4 h-8 w-52" />}>
          <DateRangeBar />
        </Suspense>
      </div>

      {/* Tab navigation */}
      <div className="border-b border-gray-200 mb-6">
        <Suspense fallback={<div className="h-10" />}>
          <TabNav />
        </Suspense>
      </div>

      {children}
    </div>
  );
}
