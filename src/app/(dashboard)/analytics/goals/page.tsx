import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps, isManagerOrAbove } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { GoalsView } from "./goals-view";

export default async function GoalsPage() {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) redirect("/login");

  const deptId = currentUser.department_id;

  const [{ data: goals }, { data: departments }] = await Promise.all([
    supabase
      .from("goals")
      .select(`
        id, title, description, target_value, current_value, unit, deadline, status, created_at,
        department:departments(id, name, slug),
        created_by_profile:profiles!created_by(first_name, last_name)
      `)
      .neq("status", "cancelled")
      .order("deadline"),
    supabase.from("departments").select("id, name, slug").eq("is_active", true).order("name"),
  ]);

  return (
    <GoalsView
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      goals={(goals ?? []) as any}
      departments={departments ?? []}
      currentDeptId={deptId}
      canManage={isManagerOrAbove(currentUser)}
      isOps={isOps(currentUser)}
    />
  );
}
