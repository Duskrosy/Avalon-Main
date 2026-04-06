import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps, isManagerOrAbove } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { CreativesRequestsView } from "./requests-view";

export default async function CreativesRequestsPage() {
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
    if (!["creatives", "ad-ops"].includes(dept?.slug ?? "")) redirect("/");
  }

  // Fetch creatives department members for assignee dropdown
  const { data: creativesDept } = await supabase
    .from("departments")
    .select("id")
    .eq("slug", "creatives")
    .maybeSingle();

  const members: { id: string; first_name: string; last_name: string }[] = [];
  if (creativesDept?.id) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, first_name, last_name")
      .eq("department_id", creativesDept.id)
      .eq("is_active", true)
      .order("first_name");
    if (profiles) members.push(...profiles);
  }

  const canManage = isManagerOrAbove(currentUser);

  return (
    <div className="max-w-5xl mx-auto">
      <CreativesRequestsView
        members={members}
        currentUserId={currentUser.id}
        canManage={canManage}
      />
    </div>
  );
}
