import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps, isManagerOrAbove } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { AccountsView } from "./accounts-view";

export default async function AccountsPage() {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);

  if (!currentUser || !isManagerOrAbove(currentUser)) redirect("/");

  // Fetch users
  let query = supabase
    .from("profiles")
    .select(`
      *,
      department:departments(id, name, slug),
      role:roles(id, name, slug, tier)
    `)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("first_name");

  if (!isOps(currentUser)) {
    query = query.eq("department_id", currentUser.department_id);
  }

  const [{ data: users }, { data: departments }, { data: roles }] = await Promise.all([
    query,
    supabase.from("departments").select("id, name, slug").eq("is_active", true).order("name"),
    supabase.from("roles").select("id, name, slug, tier").eq("is_active", true).order("tier"),
  ]);

  return (
    <AccountsView
      users={users ?? []}
      departments={departments ?? []}
      roles={roles ?? []}
      currentUserId={currentUser.id}
      isOps={isOps(currentUser)}
    />
  );
}
