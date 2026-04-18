import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isOps, isManagerOrAbove } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { GoalsView } from "./goals-view";

export default async function GoalsPage() {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) redirect("/login");

  const admin = createAdminClient();
  const deptId = currentUser.department_id;

  const [{ data: goals }, { data: departments }, { data: kpiDefs }, { data: kpiEntries }] = await Promise.all([
    admin
      .from("goals")
      .select(`
        id, title, description, target_value, current_value, unit, deadline, status, created_at,
        kpi_definition_id, deadline_green_days, deadline_amber_days,
        department:departments(id, name, slug),
        created_by_profile:profiles!created_by(first_name, last_name),
        kpi_definition:kpi_definitions(id, name, unit, threshold_green, threshold_amber, direction, data_source_status)
      `)
      .neq("status", "cancelled")
      .order("deadline"),
    admin.from("departments").select("id, name, slug").eq("is_active", true).order("name"),
    admin
      .from("kpi_definitions")
      .select("id, name, department_id, unit, category, data_source_status, is_active, threshold_green, threshold_amber, direction, sort_order")
      .order("sort_order")
      .order("name"),
    admin
      .from("kpi_entries")
      .select("kpi_definition_id, value_numeric, period_date")
      .is("profile_id", null)
      .order("period_date", { ascending: false }),
  ]);

  const latestValueByKpiId: Record<string, { value: number; date: string }> = {};
  for (const e of kpiEntries ?? []) {
    if (!latestValueByKpiId[e.kpi_definition_id]) {
      latestValueByKpiId[e.kpi_definition_id] = { value: e.value_numeric, date: e.period_date };
    }
  }

  return (
    <GoalsView
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      goals={(goals ?? []) as any}
      departments={departments ?? []}
      kpiDefinitions={(kpiDefs ?? []) as any}
      latestValueByKpiId={latestValueByKpiId}
      currentDeptId={deptId}
      canManage={isManagerOrAbove(currentUser)}
      isOps={isOps(currentUser)}
    />
  );
}
