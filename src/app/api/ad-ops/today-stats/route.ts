import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/permissions";
import { NextResponse } from "next/server";
import { resolveToken, fetchAdInsights } from "@/lib/meta/client";

// GET /api/ad-ops/today-stats
// Fetches today's ad-level insights live from Meta for all active accounts.
// Data is NOT stored — the nightly cron handles persistence once it becomes "yesterday".
export async function GET() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const todayStr = new Date().toISOString().split("T")[0];

  const { data: accounts } = await admin
    .from("ad_meta_accounts")
    .select("id, account_id, name, meta_access_token, primary_conversion_id, primary_conversion_name")
    .eq("is_active", true);

  if (!accounts || accounts.length === 0) return NextResponse.json([]);

  type StatRow = {
    meta_account_id: string;
    campaign_id: string;
    campaign_name: string | null;
    adset_name: string | null;
    ad_id: string;
    ad_name: string | null;
    metric_date: string;
    impressions: number;
    clicks: number;
    spend: number;
    reach: number;
    video_plays: number;
    video_plays_25pct: number;
    conversions: number;
    conversion_value: number;
    hook_rate: null;
    ctr: null;
    roas: null;
  };

  const allStats: StatRow[] = [];

  await Promise.allSettled(
    accounts.map(async (account) => {
      const token = resolveToken(account);
      if (!token) return;

      const adInsights = await fetchAdInsights(account.account_id, token, "today");

      const customConvId = account.primary_conversion_id;
      const customActionType = customConvId
        ? `offsite_conversion.custom.${customConvId}`
        : null;

      for (const insight of adInsights) {
        const spend = parseFloat(insight.spend ?? "0");

        let conversions: number;
        let conversion_value: number;

        if (customActionType && insight.raw_actions) {
          const countEntry = insight.raw_actions.find((a) => a.action_type === customActionType);
          const valueEntry = insight.raw_action_values?.find((a) => a.action_type === customActionType);
          conversions     = parseInt(countEntry?.value ?? "0", 10);
          conversion_value = parseFloat(valueEntry?.value ?? "0");
        } else {
          conversions = parseInt(insight.conversions ?? "0", 10);
          const roas  = insight.purchase_roas?.[0]?.value;
          conversion_value = roas ? Math.round(parseFloat(roas) * spend * 100) / 100 : 0;
        }

        allStats.push({
          meta_account_id:   account.id,
          campaign_id:       insight.campaign_id,
          campaign_name:     insight.campaign_name ?? null,
          adset_name:        insight.adset_name    ?? null,
          ad_id:             insight.ad_id,
          ad_name:           insight.ad_name       ?? null,
          metric_date:       todayStr,
          impressions:       parseInt(insight.impressions       ?? "0", 10),
          clicks:            parseInt(insight.clicks            ?? "0", 10),
          spend,
          reach:             parseInt(insight.reach             ?? "0", 10),
          video_plays:       parseInt(insight.video_plays       ?? "0", 10),
          video_plays_25pct: parseInt(insight.video_plays_25pct ?? "0", 10),
          conversions,
          conversion_value,
          hook_rate: null,
          ctr:       null,
          roas:      null,
        });
      }
    }),
  );

  return NextResponse.json(allStats);
}
