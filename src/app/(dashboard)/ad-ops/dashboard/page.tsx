import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isManagerOrAbove, isOps } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { AdDashboard } from "./ad-dashboard";

export default async function AdOpsDashboardPage() {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) redirect("/login");

  // Yesterday's date (server-side, UTC)
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayStr = yesterday.toISOString().split("T")[0];

  const [
    { data: requests },
    { data: assets },
    { data: deployments },
    { data: accounts },
    { data: lastSync },
    { data: yesterdayStats },
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
      .select("id, name, account_id, is_active, currency")
      .eq("is_active", true),
    supabase
      .from("ad_meta_sync_runs")
      .select("id, status, triggered_by, sync_date, completed_at, records_processed, account_results, error_log")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("meta_ad_stats")
      .select("meta_account_id, campaign_id, campaign_name, spend, impressions, conversions, conversion_value")
      .eq("metric_date", yesterdayStr),
  ]);

  // Count by status
  const { data: requestCounts } = await supabase
    .from("ad_requests")
    .select("status");

  const { data: assetCounts } = await supabase
    .from("ad_assets")
    .select("status");

  // Aggregate yesterday's stats
  const statsRows = yesterdayStats ?? [];

  // Overall totals
  let totalSpend = 0;
  let totalImpressions = 0;
  let totalConversions = 0;
  let totalConversionValue = 0;
  for (const row of statsRows) {
    totalSpend += Number(row.spend ?? 0);
    totalImpressions += Number(row.impressions ?? 0);
    totalConversions += Number(row.conversions ?? 0);
    totalConversionValue += Number(row.conversion_value ?? 0);
  }
  const overallROAS = totalSpend > 0 ? totalConversionValue / totalSpend : null;

  // Per-account spend
  const accountSpendMap: Record<string, number> = {};
  for (const row of statsRows) {
    const aid = row.meta_account_id as string;
    accountSpendMap[aid] = (accountSpendMap[aid] ?? 0) + Number(row.spend ?? 0);
  }
  const activeAccountsList = accounts ?? [];
  const perAccountSpend = activeAccountsList
    .map((a) => ({ id: a.id, name: a.name, spend: accountSpendMap[a.id] ?? 0, currency: (a as any).currency as string | null ?? null }))
    .filter((a) => a.spend > 0)
    .sort((a, b) => b.spend - a.spend);

  // Determine a single currency for totals: use it if all accounts share the same, otherwise null (mixed)
  const accountCurrencies = Array.from(new Set(activeAccountsList.map((a) => (a as any).currency as string | null ?? "USD")));
  const totalsCurrency: string | null = accountCurrencies.length === 1 ? accountCurrencies[0] : null;

  // Top campaign by ROAS and by spend (aggregate by campaign_id)
  const campaignMap: Record<string, { name: string; spend: number; convValue: number }> = {};
  for (const row of statsRows) {
    const cid = row.campaign_id as string;
    if (!cid) continue;
    if (!campaignMap[cid]) {
      campaignMap[cid] = { name: (row.campaign_name as string) ?? cid, spend: 0, convValue: 0 };
    }
    campaignMap[cid].spend += Number(row.spend ?? 0);
    campaignMap[cid].convValue += Number(row.conversion_value ?? 0);
  }

  let topByROAS: { name: string; roas: number } | null = null;
  let topBySpend: { name: string; spend: number } | null = null;

  for (const c of Object.values(campaignMap)) {
    const roas = c.spend > 0 ? c.convValue / c.spend : 0;
    if (!topByROAS || roas > topByROAS.roas) {
      topByROAS = { name: c.name, roas };
    }
    if (!topBySpend || c.spend > topBySpend.spend) {
      topBySpend = { name: c.name, spend: c.spend };
    }
  }

  const hasYesterdayData = statsRows.length > 0;

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      lastSync={(lastSync ?? null) as any}
      canSync={isOps(currentUser)}
      currentDeptSlug={(currentUser as any).department?.slug ?? ""}
      yesterdayDate={yesterdayStr}
      hasYesterdayData={hasYesterdayData}
      yesterdayTotals={{ spend: totalSpend, impressions: totalImpressions, conversions: totalConversions, roas: overallROAS }}
      topByROAS={topByROAS}
      topBySpend={topBySpend}
      perAccountSpend={perAccountSpend}
      totalsCurrency={totalsCurrency}
    />
  );
}
