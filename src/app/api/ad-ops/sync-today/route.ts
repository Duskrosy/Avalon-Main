import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { resolveToken, fetchAdInsights, fetchCampaignsByIds } from "@/lib/meta/client";

// Server-side debounce window: Meta hates us, so we batch all concurrent
// client polls into one call every DEBOUNCE_SECONDS.
const DEBOUNCE_SECONDS = 30;

function isCronRequest(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  return req.headers.get("authorization") === `Bearer ${cronSecret}`;
}

// ─── POST /api/ad-ops/sync-today ──────────────────────────────────────────────
// Pulls today's insights from Meta and upserts into meta_ad_stats with
// metric_date = today. Any signed-in user can invoke (client polls every 60s
// from the Live Ads page); concurrent calls are de-duped via DEBOUNCE_SECONDS.
export async function POST(req: NextRequest) {
  const fromCron = isCronRequest(req);
  if (!fromCron) {
    const supabase = await createClient();
    const currentUser = await getCurrentUser(supabase);
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const admin = createAdminClient();
  const metricDate = new Date().toISOString().split("T")[0];

  // ── Debounce: skip if a today-sync ran within the last DEBOUNCE_SECONDS ──
  const debounceCutoff = new Date(Date.now() - DEBOUNCE_SECONDS * 1000).toISOString();
  const { data: recent } = await admin
    .from("ad_meta_sync_runs")
    .select("id, status, started_at")
    .eq("sync_date", metricDate)
    .eq("triggered_by", "today_poll")
    .gte("started_at", debounceCutoff)
    .limit(1);

  if (recent && recent.length > 0) {
    return NextResponse.json({ debounced: true, last_run_at: recent[0].started_at });
  }

  // ── Create sync run record ──
  const { data: syncRun, error: syncRunError } = await admin
    .from("ad_meta_sync_runs")
    .insert({
      status: "running",
      triggered_by: "today_poll",
      sync_date: metricDate,
    })
    .select("id")
    .single();

  if (syncRunError || !syncRun) {
    return NextResponse.json({ error: "Failed to create sync run" }, { status: 500 });
  }
  const syncRunId = syncRun.id;

  // ── Fetch active accounts ──
  const { data: accounts } = await admin
    .from("ad_meta_accounts")
    .select("id, account_id, name, meta_access_token, currency, primary_conversion_id, primary_conversion_name")
    .eq("is_active", true);

  if (!accounts || accounts.length === 0) {
    await admin.from("ad_meta_sync_runs").update({
      status: "success",
      completed_at: new Date().toISOString(),
      records_processed: 0,
      account_results: [],
    }).eq("id", syncRunId);
    return NextResponse.json({ synced: 0, failed: 0, message: "No active accounts" });
  }

  type AccountResult = {
    account_id: string;
    name: string;
    status: "ok" | "error";
    error?: string;
    campaigns?: number;
    ads?: number;
  };

  const accountResults: AccountResult[] = [];
  let totalRecords = 0;
  let failedCount = 0;
  const errors: string[] = [];

  const settled = await Promise.allSettled(
    accounts.map(async (account) => {
      const token = resolveToken(account);
      if (!token) throw new Error("No access token available");

      // Insights first — the unique campaign IDs it returns are the only
      // campaigns we actually care about for Live Ads. Skipping the full
      // /act_X/campaigns pagination (~3,500 rows) keeps Sync Today fast.
      const adInsights = await fetchAdInsights(account.account_id, token, "today");
      const activeCampaignIds = Array.from(
        new Set(adInsights.map((i) => i.campaign_id).filter(Boolean)),
      );
      const campaigns = activeCampaignIds.length > 0
        ? await fetchCampaignsByIds(token, activeCampaignIds)
        : [];

      // Upsert campaigns (status/budget may have changed intraday)
      if (campaigns.length > 0) {
        const campaignRows = campaigns.map((c) => ({
          meta_account_id: account.id,
          campaign_id: c.id,
          campaign_name: c.name,
          status: c.status,
          effective_status: c.effective_status,
          objective: c.objective ?? null,
          daily_budget: c.daily_budget ? parseFloat(c.daily_budget) / 100 : null,
          lifetime_budget: c.lifetime_budget ? parseFloat(c.lifetime_budget) / 100 : null,
          last_synced_at: new Date().toISOString(),
        }));
        await admin
          .from("meta_campaigns")
          .upsert(campaignRows, { onConflict: "meta_account_id,campaign_id" });
      }

      // Upsert today's ad stats (composite key includes metric_date, so
      // repeated today syncs overwrite the same rows)
      let adCount = 0;
      if (adInsights.length > 0) {
        const customConvId = account.primary_conversion_id;
        const customActionType = customConvId ? `offsite_conversion.custom.${customConvId}` : null;

        const statRows = adInsights.map((insight) => {
          const spend = parseFloat(insight.spend ?? "0");

          let conversions: number;
          let conversion_value: number;

          if (customActionType && insight.raw_actions) {
            const countEntry = insight.raw_actions.find((a) => a.action_type === customActionType);
            const valueEntry = insight.raw_action_values?.find((a) => a.action_type === customActionType);
            conversions = parseInt(countEntry?.value ?? "0", 10);
            conversion_value = parseFloat(valueEntry?.value ?? "0");
          } else {
            conversions = parseInt(insight.conversions ?? "0", 10);
            const roas = insight.purchase_roas?.[0]?.value;
            conversion_value = roas ? Math.round(parseFloat(roas) * spend * 100) / 100 : 0;
          }

          const messaging_conversations = parseInt(
            insight.raw_actions?.find(
              (a) => a.action_type === "onsite_conversion.messaging_conversation_started_7d"
            )?.value ?? "0",
            10,
          );

          return {
            meta_account_id: account.id,
            campaign_id: insight.campaign_id,
            campaign_name: insight.campaign_name ?? null,
            adset_id: insight.adset_id ?? null,
            adset_name: insight.adset_name ?? null,
            ad_id: insight.ad_id,
            ad_name: insight.ad_name ?? null,
            metric_date: metricDate,
            impressions: parseInt(insight.impressions ?? "0", 10),
            clicks: parseInt(insight.clicks ?? "0", 10),
            spend,
            reach: parseInt(insight.reach ?? "0", 10),
            video_plays: parseInt(insight.video_plays ?? "0", 10),
            video_plays_25pct: parseInt(insight.video_plays_25pct ?? "0", 10),
            conversions,
            conversion_value,
            messaging_conversations,
            last_synced_at: new Date().toISOString(),
          };
        });

        const { error } = await admin
          .from("meta_ad_stats")
          .upsert(statRows, { onConflict: "meta_account_id,ad_id,metric_date" });

        if (!error) adCount = statRows.length;
      }

      return {
        account_id: account.account_id,
        name: account.name,
        campaigns: campaigns.length,
        ads: adCount,
      };
    }),
  );

  settled.forEach((result, i) => {
    const account = accounts[i]!;
    if (result.status === "fulfilled") {
      totalRecords += result.value.ads;
      accountResults.push({
        account_id: account.account_id,
        name: account.name,
        status: "ok",
        campaigns: result.value.campaigns,
        ads: result.value.ads,
      });
    } else {
      failedCount++;
      const msg = result.reason instanceof Error ? result.reason.message : String(result.reason);
      errors.push(`[${account.name}] ${msg}`);
      accountResults.push({ account_id: account.account_id, name: account.name, status: "error", error: msg });
    }
  });

  const finalStatus = failedCount === accounts.length ? "failed" : "success";
  await admin.from("ad_meta_sync_runs").update({
    status: finalStatus,
    completed_at: new Date().toISOString(),
    records_processed: totalRecords,
    account_results: accountResults,
    error_log: errors.length > 0 ? errors.join("\n") : null,
  }).eq("id", syncRunId);

  return NextResponse.json({
    synced: accounts.length - failedCount,
    failed: failedCount,
    campaigns: accountResults.reduce((s, r) => s + (r.campaigns ?? 0), 0),
    ads: totalRecords,
    errors: errors.length > 0 ? errors : undefined,
  });
}
