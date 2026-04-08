import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps, isManagerOrAbove } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { AccountsView } from "./accounts-view";

export default async function AccountsPage() {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);

  if (!currentUser || !isManagerOrAbove(currentUser)) redirect("/");

  const fields = `*, department:departments(id, name, slug), role:roles(id, name, slug, tier)`;

  // Active users
  let activeQuery = supabase
    .from("profiles")
    .select(fields)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("first_name");

  // Deactivated users (soft-deleted)
  let deactivatedQuery = supabase
    .from("profiles")
    .select(fields)
    .eq("status", "inactive")
    .order("first_name");

  if (!isOps(currentUser)) {
    activeQuery      = activeQuery.eq("department_id", currentUser.department_id);
    deactivatedQuery = deactivatedQuery.eq("department_id", currentUser.department_id);
  }

  const [
    { data: users },
    { data: deactivatedUsers },
    { data: departments },
    { data: roles },
  ] = await Promise.all([
    activeQuery,
    deactivatedQuery,
    supabase.from("departments").select("id, name, slug").eq("is_active", true).order("name"),
    supabase.from("roles").select("id, name, slug, tier").eq("is_active", true).order("tier"),
  ]);

  return (
    <AccountsView
      users={users ?? []}
      deactivatedUsers={deactivatedUsers ?? []}
      departments={departments ?? []}
      roles={roles ?? []}
      currentUserId={currentUser.id}
      currentUserTier={currentUser.role.tier}
      isOps={isOps(currentUser)}
    />
  );
}
