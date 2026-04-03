import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { PermissionsView } from "./permissions-view";

export default async function PermissionsPage() {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);

  if (!currentUser || !isOps(currentUser)) redirect("/people/accounts");

  const [{ data: users }, { data: roles }, { data: overrides }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, first_name, last_name, email, department:departments(name), role:roles(id, name, slug, tier)")
      .eq("status", "active")
      .is("deleted_at", null)
      .order("first_name"),
    supabase.from("roles").select("id, name, slug, tier").eq("is_active", true).order("tier"),
    supabase.from("user_permission_overrides").select("*, permission:permissions(action, resource)"),
  ]);

  // Supabase infers relations as arrays; cast to the shape the view expects
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (
    <PermissionsView
      users={(users ?? []) as any}
      roles={roles ?? []}
      overrides={(overrides ?? []) as any}
      currentUserId={currentUser.id}
    />
  );
}
