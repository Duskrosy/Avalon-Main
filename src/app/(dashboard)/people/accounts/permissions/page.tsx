import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { PermissionsView } from "./permissions-view";

export default async function PermissionsPage() {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);

  if (!currentUser || !isOps(currentUser)) redirect("/people/accounts");

  const admin = createAdminClient();

  const [
    { data: users },
    { data: roles },
    { data: departments },
    { data: allOverrides },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, first_name, last_name, email, department:departments(id, slug, name), role:roles(id, name, slug, tier)")
      .eq("status", "active")
      .is("deleted_at", null)
      .order("first_name"),
    supabase
      .from("roles")
      .select("id, name, slug, tier")
      .eq("is_active", true)
      .order("tier"),
    supabase
      .from("departments")
      .select("id, name, slug")
      .eq("is_active", true)
      .order("name"),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any)
      .from("nav_page_overrides")
      .select("user_id, nav_slug, visible"),
  ]);

  return (
    <PermissionsView
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      users={(users ?? []) as any}
      roles={roles ?? []}
      departments={departments ?? []}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      allOverrides={(allOverrides ?? []) as any}
      currentUserId={currentUser.id}
    />
  );
}
