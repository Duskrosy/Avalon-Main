import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { DevTasklistView } from "./dev-tasklist-view";
import { FeatureGoalsView } from "./feature-goals-view";

export default async function AdminDevelopmentPage() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) redirect("/login");
  if (!isOps(user)) redirect("/");

  const admin = createAdminClient();
  const [{ data: kpis }, { data: departments }] = await Promise.all([
    admin
      .from("kpi_definitions")
      .select("id, name, category, data_source_status, department:departments(id, name, slug), is_active")
      .in("data_source_status", ["to_be_wired", "wired"])
      .order("name"),
    admin.from("departments").select("id, name, slug").eq("is_active", true).order("name"),
  ]);

  return (
    <div className="max-w-4xl mx-auto">
      <DevTasklistView kpis={(kpis ?? []) as any} departments={departments ?? []} />
      <div className="mt-10 border-t border-[var(--color-border)] pt-8">
        <FeatureGoalsView />
      </div>
    </div>
  );
}
