import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isManagerOrAbove } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { PerformanceView } from "./performance-view";

export default async function AdPerformancePage() {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) redirect("/login");

  const [{ data: deployments }, { data: groups }, { data: accounts }] = await Promise.all([
    supabase
      .from("ad_deployments")
      .select("id, campaign_name, status, meta_account_id, asset:ad_assets(asset_code, title, thumbnail_url, content_type, hook_type)")
      .in("status", ["active", "paused", "ended"])
      .order("launched_at", { ascending: false }),
    supabase
      .from("meta_account_groups")
      .select("id, name")
      .eq("is_active", true)
      .order("sort_order")
      .order("name"),
    supabase
      .from("ad_meta_accounts")
      .select("id, group_id, currency")
      .eq("is_active", true),
  ]);

  return (
    <PerformanceView
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      deployments={(deployments ?? []) as any}
      groups={groups ?? []}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      accounts={(accounts ?? []) as any}
      canManage={isManagerOrAbove(currentUser)}
    />
  );
}
