import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps, isManagerOrAbove } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { ManagerDashboard } from "./manager-dashboard";

export default async function ProductivityOverviewPage() {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) redirect("/login");

  // Only managers and above can see the overview
  if (!isManagerOrAbove(currentUser)) {
    redirect("/productivity/kanban");
  }

  const userIsOps = isOps(currentUser);
  const departmentId = currentUser.department_id;

  // Fetch departments for OPS filter
  const { data: departments } = userIsOps
    ? await supabase
        .from("departments")
        .select("id, name")
        .eq("is_active", true)
        .order("name")
    : { data: [] };

  return (
    <ManagerDashboard
      currentDepartmentId={departmentId}
      departments={departments ?? []}
      isOps={userIsOps}
    />
  );
}
