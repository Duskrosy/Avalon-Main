import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { CampaignsView } from "./campaigns-view";

export default async function CampaignsPage() {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) redirect("/login");

  // Fetch campaigns with aggregated stats from the last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const fromDate = thirtyDaysAgo.toISOString().split("T")[0];

  const [{ data: campaigns }, { data: accounts }] = await Promise.all([
    supabase
      .from("meta_campaigns")
      .select("id, campaign_id, campaign_name, status, effective_status, objective, daily_budget, lifetime_budget, last_synced_at, meta_account_id")
      .order("last_synced_at", { ascending: false }),
    supabase
      .from("ad_meta_accounts")
      .select("id, name, account_id, currency")
      .eq("is_active", true),
  ]);

  // Fetch 30-day aggregated stats per campaign
  const { data: stats } = await supabase
    .from("meta_ad_stats")
    .select("campaign_id, meta_account_id, impressions, clicks, spend, reach, video_plays, video_plays_25pct, conversions, conversion_value, metric_date, ad_id, ad_name, adset_name, hook_rate, ctr, roas")
    .gte("metric_date", fromDate)
    .order("metric_date", { ascending: false });

  return (
    <CampaignsView
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      campaigns={(campaigns ?? []) as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      accounts={(accounts ?? []) as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stats={(stats ?? []) as any}
    />
  );
}
