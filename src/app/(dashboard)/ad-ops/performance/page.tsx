import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isManagerOrAbove } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { PerformanceView } from "./performance-view";

export default async function AdPerformancePage() {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) redirect("/login");

  const { data: deployments } = await supabase
    .from("ad_deployments")
    .select("id, campaign_name, status, asset:ad_assets(asset_code, title)")
    .in("status", ["active", "paused", "ended"])
    .order("launched_at", { ascending: false });

  return (
    <PerformanceView
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      deployments={(deployments ?? []) as any}
      canManage={isManagerOrAbove(currentUser)}
    />
  );
}
