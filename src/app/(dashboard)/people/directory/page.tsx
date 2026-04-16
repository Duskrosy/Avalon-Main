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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sorted = [...(profiles ?? [])].sort((a: any, b: any) => {
    const aDept = a.department?.id === currentUser.department_id ? 0 : 1;
    const bDept = b.department?.id === currentUser.department_id ? 0 : 1;
    if (aDept !== bDept) return aDept - bDept;
    return (a.first_name ?? "").localeCompare(b.first_name ?? "");
  });

  return (
    <DirectoryView
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      profiles={sorted as any}
      departments={departments ?? []}
      currentUserId={currentUser.id}
      currentDeptId={currentUser.department_id ?? null}
      currentDeptName={currentUser.department?.name ?? null}
      canManageProfiles={canManageProfiles}
      isOps={isOps(currentUser)}
    />
  );
}
