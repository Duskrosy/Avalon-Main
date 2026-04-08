import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps, isManagerOrAbove } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { LeavesView } from "./leaves-view";

export default async function LeavesPage() {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);

  if (!currentUser) redirect("/login");

  const userIsOps     = isOps(currentUser);
  const userIsManager = isManagerOrAbove(currentUser);
  const canManage     = userIsManager || userIsOps;

  // Fetch departments for the OPS dept filter in Team Leaves
  let departments: { id: string; name: string; slug: string }[] = [];
  if (canManage) {
    const { data } = await supabase
      .from("departments")
      .select("id, name, slug")
      .eq("is_active", true)
      .order("name");
    departments = data ?? [];
  }

  return (
    <LeavesView
      currentUserId={currentUser.id}
      isOps={userIsOps}
      isManager={userIsManager}
      departments={departments}
    />
  );
}
