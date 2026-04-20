import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps } from "@/lib/permissions";

// GET /api/kpis?department_id=xxx
// Returns definitions + latest entry for each KPI in that department
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const departmentId = searchParams.get("department_id");

  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const deptId = departmentId ?? currentUser.department_id;
  if (!deptId) return NextResponse.json({ error: "No department" }, { status: 400 });

  // KPI definitions for this dept
  const { data: definitions, error } = await supabase
    .from("kpi_definitions")
    .select("id, name, category, unit, direction, frequency, threshold_green, threshold_amber, hint, is_platform_tracked, sort_order, group_label, group_sort, data_source_status, is_active, shared_with_dept_ids")
    .eq("department_id", deptId)
    .order("group_sort")
    .order("sort_order")
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Latest entry per KPI (last 12 for trend)
  const defIds = (definitions ?? []).map((d) => d.id);
  if (defIds.length === 0) return NextResponse.json({ definitions: [], entries: {} });

  const { data: entries } = await supabase
    .from("kpi_entries")
    .select("id, kpi_definition_id, profile_id, period_date, value_numeric, notes, created_at")
    .in("kpi_definition_id", defIds)
    .is("profile_id", null)       // team-level entries only for dashboard
    .order("period_date", { ascending: false })
    .limit(defIds.length * 12);   // up to 12 entries per KPI

  // Group entries by kpi_definition_id
  const grouped: Record<string, typeof entries> = {};
  for (const e of entries ?? []) {
    if (!grouped[e.kpi_definition_id]) grouped[e.kpi_definition_id] = [];
    grouped[e.kpi_definition_id]!.push(e);
  }

  return NextResponse.json({ definitions, entries: grouped });
}
