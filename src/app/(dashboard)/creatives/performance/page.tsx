import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { AnalyticsView } from "../analytics/analytics-view";

export default async function CreativesPerformancePage() {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) redirect("/login");

  const ops = isOps(currentUser);
  if (!ops) {
    const { data: dept } = await supabase
      .from("departments")
      .select("slug")
      .eq("id", currentUser.department_id ?? "")
      .maybeSingle();
    if (!["creatives", "marketing", "ad-ops"].includes(dept?.slug ?? "")) redirect("/");
  }

  const admin = createAdminClient();
  const { data: groups } = await admin
    .from("smm_groups")
    .select(`
      id, name,
      smm_group_platforms ( id, platform, page_name, is_active )
    `)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">Performance</h1>
        <p className="text-sm text-[var(--color-text-tertiary)] mt-0.5">
          Platform-level daily metrics across Local, International, and PCDLF accounts — manual entry and API sync.
        </p>
      </div>
      <AnalyticsView groups={groups ?? []} />
    </div>
  );
}
