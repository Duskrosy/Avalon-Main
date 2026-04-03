import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps, isManagerOrAbove } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { AnnouncementsView } from "./announcements-view";

export default async function AnnouncementsPage() {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) redirect("/login");

  const [{ data: announcements }, { data: departments }] = await Promise.all([
    supabase
      .from("announcements")
      .select(`
        id, title, content, priority, expires_at, created_at,
        department:departments(id, name, slug),
        created_by_profile:profiles!created_by(id, first_name, last_name)
      `)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("departments").select("id, name, slug").eq("is_active", true).order("name"),
  ]);

  return (
    <AnnouncementsView
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      announcements={(announcements ?? []) as any}
      departments={departments ?? []}
      currentUserId={currentUser.id}
      canPost={isManagerOrAbove(currentUser)}
      isOps={isOps(currentUser)}
      userDeptId={currentUser.department_id}
    />
  );
}
