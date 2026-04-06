import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { AnalyticsView } from "./analytics-view";

export default async function CreativesAnalyticsPage() {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) redirect("/login");

  const ops = isOps(currentUser);
  if (!ops) {
    const { data: dept } = await supabase
      .from("departments")
      .select("slug")
      .eq("id", currentUser.department_id ?? "")
      .maybeSingle();
    if (!["creatives", "marketing", "ad-ops"].includes(dept?.slug ?? "")) redirect("/");
  }

  // Fetch all SMM groups with their active platforms
  const { data: groups } = await supabase
    .from("smm_groups")
    .select(`
      id, name,
      smm_group_platforms (
        id, platform, page_name, is_active
      )
    `)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  return (
    <div className="max-w-5xl mx-auto">
      <AnalyticsView groups={groups ?? []} />
    </div>
  );
}
