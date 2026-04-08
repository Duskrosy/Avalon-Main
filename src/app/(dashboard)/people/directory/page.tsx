import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isManagerOrAbove, isOps } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { DirectoryView } from "./directory-view";

export default async function DirectoryPage() {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);

  if (!currentUser) redirect("/login");

  const canManageProfiles =
    isManagerOrAbove(currentUser) || currentUser.department?.slug === "ad-ops";

  const [{ data: profiles }, { data: departments }] = await Promise.all([
    supabase
      .from("profiles")
      .select(`
        id, first_name, last_name, email, phone,
        avatar_url, bio, job_title, fun_fact, avatar_require_approval,
        department:departments(id, name, slug),
        role:roles(name, tier)
      `)
      .eq("status", "active")
      .is("deleted_at", null)
      .order("first_name"),
    supabase.from("departments").select("id, name, slug").eq("is_active", true).order("name"),
  ]);

  return (
    <DirectoryView
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      profiles={(profiles ?? []) as any}
      departments={departments ?? []}
      currentUserId={currentUser.id}
      currentDeptId={currentUser.department_id ?? null}
      canManageProfiles={canManageProfiles}
      isOps={isOps(currentUser)}
    />
  );
}
