import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isManagerOrAbove } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { MemosView } from "./memos-view";

export default async function MemosPage() {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) redirect("/login");

  const [{ data: memos }, { data: departments }] = await Promise.all([
    supabase
      .from("memos")
      .select(`
        id, title, content, created_at, updated_at,
        department:departments(id, name, slug),
        created_by_profile:profiles!created_by(first_name, last_name),
        memo_signatures(user_id)
      `)
      .order("created_at", { ascending: false }),
    supabase.from("departments").select("id, name, slug").eq("is_active", true).order("name"),
  ]);

  return (
    <MemosView
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      memos={(memos ?? []) as any}
      departments={departments ?? []}
      currentUserId={currentUser.id}
      canManage={isManagerOrAbove(currentUser)}
    />
  );
}
