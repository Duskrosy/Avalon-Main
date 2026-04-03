import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { DirectoryView } from "./directory-view";

export default async function DirectoryPage() {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);

  if (!currentUser) redirect("/login");

  const [{ data: profiles }, { data: departments }] = await Promise.all([
    supabase
      .from("profiles")
      .select(`
        id, first_name, last_name, email, phone,
        department:departments(id, name, slug),
        role:roles(name, tier)
      `)
      .eq("status", "active")
      .is("deleted_at", null)
      .order("first_name"),
    supabase.from("departments").select("id, name, slug").eq("is_active", true).order("name"),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <DirectoryView profiles={(profiles ?? []) as any} departments={departments ?? []} />;
}
