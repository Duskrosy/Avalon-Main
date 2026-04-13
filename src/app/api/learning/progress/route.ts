import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isOps, isManagerOrAbove } from "@/lib/permissions";

// GET /api/learning/progress?department_id=xxx
// Returns per-user learning progress for managers/OPS
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManagerOrAbove(currentUser)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const departmentId = searchParams.get("department_id");

  const admin = createAdminClient();

  // Get all active users (scoped by department for non-OPS)
  let userQuery = admin
    .from("profiles")
    .select("id, first_name, last_name, avatar_url, department_id, department:departments(id, name, slug)")
    .eq("status", "active")
    .is("deleted_at", null)
    .order("first_name");

  if (departmentId) {
    userQuery = userQuery.eq("department_id", departmentId);
  } else if (!isOps(currentUser)) {
    userQuery = userQuery.eq("department_id", currentUser.department_id ?? "");
  }

  // Get all active learning materials count
  const { count: totalMaterials } = await admin
    .from("learning_materials")
    .select("id", { count: "exact", head: true });

  // Get all completions and views
  const [{ data: users }, { data: completions }, { data: views }] = await Promise.all([
    userQuery,
    admin.from("learning_completions").select("user_id, material_id"),
    admin.from("learning_views").select("user_id, material_id, viewed_at"),
  ]);

  // Build per-user progress map
  const completionsByUser = new Map<string, Set<string>>();
  for (const c of completions ?? []) {
    if (!completionsByUser.has(c.user_id)) completionsByUser.set(c.user_id, new Set());
    completionsByUser.get(c.user_id)!.add(c.material_id);
  }

  const viewsByUser = new Map<string, Set<string>>();
  const lastViewByUser = new Map<string, string>();
  for (const v of views ?? []) {
    if (!viewsByUser.has(v.user_id)) viewsByUser.set(v.user_id, new Set());
    viewsByUser.get(v.user_id)!.add(v.material_id);
    const prev = lastViewByUser.get(v.user_id);
    if (!prev || v.viewed_at > prev) lastViewByUser.set(v.user_id, v.viewed_at);
  }

  const progress = (users ?? []).map((u) => {
    const completed = completionsByUser.get(u.id)?.size ?? 0;
    const viewed = viewsByUser.get(u.id)?.size ?? 0;
    const lastActivity = lastViewByUser.get(u.id) ?? null;
    return {
      user_id: u.id,
      first_name: u.first_name,
      last_name: u.last_name,
      avatar_url: u.avatar_url,
      department: u.department,
      completed,
      viewed,
      total: totalMaterials ?? 0,
      pct: totalMaterials ? Math.round((completed / totalMaterials) * 100) : 0,
      last_activity: lastActivity,
    };
  });

  // Department summary
  const deptMap = new Map<string, { name: string; total_users: number; total_completed: number; total_materials: number }>();
  for (const p of progress) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dept = p.department as any;
    const deptId = dept?.id ?? "global";
    const deptName = dept?.name ?? "Global";
    if (!deptMap.has(deptId)) deptMap.set(deptId, { name: deptName, total_users: 0, total_completed: 0, total_materials: totalMaterials ?? 0 });
    const d = deptMap.get(deptId)!;
    d.total_users += 1;
    d.total_completed += p.completed;
  }

  return NextResponse.json({
    users: progress,
    departments: [...deptMap.entries()].map(([id, d]) => ({
      id,
      name: d.name,
      total_users: d.total_users,
      avg_pct: d.total_users > 0 && d.total_materials > 0
        ? Math.round((d.total_completed / (d.total_users * d.total_materials)) * 100)
        : 0,
    })),
    total_materials: totalMaterials ?? 0,
  });
}
