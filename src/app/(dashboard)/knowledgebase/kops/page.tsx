import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isManagerOrAbove } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { KopsView } from "./kops-view";

export default async function KopsPage() {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) redirect("/login");

  const [{ data: kops }, { data: departments }] = await Promise.all([
    supabase
      .from("kops")
      .select(`
        id, title, description, category, current_version, created_at, updated_at,
        department:departments(id, name, slug),
        created_by_profile:profiles!created_by(first_name, last_name)
      `)
      .order("title"),
    supabase.from("departments").select("id, name, slug").eq("is_active", true).order("name"),
  ]);

  const canManage = isManagerOrAbove(currentUser);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <KopsView kops={(kops ?? []) as any} departments={departments ?? []} canManage={canManage} />;
}
