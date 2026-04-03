import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps, isManagerOrAbove } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { KpiDashboard } from "./kpi-dashboard";

export default async function KpiPage() {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) redirect("/login");

  const deptId = currentUser.department_id;

  // Fetch departments OPS can see all, others see own
  const { data: departments } = isOps(currentUser)
    ? await supabase.from("departments").select("id, name, slug").eq("is_active", true).order("name")
    : { data: [] };

  // Load initial KPIs for current department
  const { data: definitions } = await supabase
    .from("kpi_definitions")
    .select("id, name, category, unit, direction, frequency, threshold_green, threshold_amber, hint, is_platform_tracked, sort_order")
    .eq("department_id", deptId ?? "")
    .eq("is_active", true)
    .order("category")
    .order("sort_order");

  const defIds = (definitions ?? []).map((d) => d.id);
  const { data: entries } = defIds.length
    ? await supabase
        .from("kpi_entries")
        .select("id, kpi_definition_id, period_date, value_numeric, notes, created_at")
        .in("kpi_definition_id", defIds)
        .is("profile_id", null)
        .order("period_date", { ascending: true })
    : { data: [] };

  // Group entries by definition id
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const grouped: Record<string, any[]> = {};
  for (const e of entries ?? []) {
    if (!grouped[e.kpi_definition_id]) grouped[e.kpi_definition_id] = [];
    grouped[e.kpi_definition_id]!.push(e);
  }

  return (
    <KpiDashboard
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      initialDefinitions={(definitions ?? []) as any}
      initialEntries={grouped}
      departments={departments ?? []}
      currentDeptId={deptId}
      canLog={isManagerOrAbove(currentUser)}
      isOps={isOps(currentUser)}
    />
  );
}
