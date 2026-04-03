import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isManagerOrAbove } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { AdDashboard } from "./ad-dashboard";

export default async function AdOpsDashboardPage() {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) redirect("/login");

  const [
    { data: requests },
    { data: assets },
    { data: deployments },
    { data: accounts },
  ] = await Promise.all([
    supabase
      .from("ad_requests")
      .select("id, title, status, target_date, created_at")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("ad_assets")
      .select("id, asset_code, title, status, content_type, funnel_stage")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("ad_deployments")
      .select("id, status, campaign_name, launched_at, asset:ad_assets(asset_code, title)")
      .eq("status", "active")
      .order("launched_at", { ascending: false })
      .limit(6),
    supabase
      .from("ad_meta_accounts")
      .select("id, name, account_id, is_active")
      .eq("is_active", true),
  ]);

  // Count by status
  const { data: requestCounts } = await supabase
    .from("ad_requests")
    .select("status");

  const { data: assetCounts } = await supabase
    .from("ad_assets")
    .select("status");

  return (
    <AdDashboard
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recentRequests={(requests ?? []) as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recentAssets={(assets ?? []) as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      activeDeployments={(deployments ?? []) as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      metaAccounts={(accounts ?? []) as any}
      requestCounts={requestCounts ?? []}
      assetCounts={assetCounts ?? []}
      canManage={isManagerOrAbove(currentUser)}
      currentDeptSlug={(currentUser as any).department?.slug ?? ""}
    />
  );
}
