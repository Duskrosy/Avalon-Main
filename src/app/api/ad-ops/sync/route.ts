import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import {
  resolveToken,
  fetchAdInsights,
  fetchCampaigns,
} from "@/lib/meta/client";

// ─── Auth ─────────────────────────────────────────────────────────────────────

function isCronRequest(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  return req.headers.get("authorization") === `Bearer ${cronSecret}`;
}

// ─── POST /api/ad-ops/sync ────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Dual auth: Vercel cron bearer token OR an OPS user session
  const fromCron = isCronRequest(req);
  if (!fromCron) {
    const supabase = await createClient();
    const currentUser = await getCurrentUser(supabase);
    if (!currentUser || !isOps(currentUser)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const triggeredBy = fromCron ? "cron" : "manual";
  const admin = createAdminClient();

  // Yesterday's date (the data we're pulling)
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const metricDate = yesterday.toISOString().split("T")[0];

  // ── 1. Create sync run record ─────────────────────────────────────────────
  const { data: syncRun, error: syncRunError } = await admin
    .from("ad_meta_sync_runs")
    .insert({
      status: "running",
      triggered_by: triggeredBy,
      sync_date: metricDate,
    })
    .select("id")
    .single();

  if (syncRunError || !syncRun) {
    return NextResponse.json({ error: "Failed to create sync run" }, { status: 500 });
  }

  const syncRunId = syncRun.id;

  // ── 2. Fetch all active Meta accounts ─────────────────────────────────────
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
    return NextResponse.json({ synced: 0, failed: 0, message: "No active accounts configured" });
  }

  // ── 3. Sync each account ──────────────────────────────────────────────────
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

      // Fetch campaigns + ad insights in parallel
      const [campaigns, adInsights] = await Promise.all([
        fetchCampaigns(account.account_id, token),
        fetchAdInsights(account.account_id, token, "yesterday"),
      ]);

      // ── Upsert campaigns into meta_campaigns ──────────────────────────
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

      // ── Upsert ad stats into meta_ad_stats ────────────────────────────
      let adCount = 0;
      if (adInsights.length > 0) {
        const customConvId = account.primary_conversion_id;
        // Custom conversion action type: offsite_conversion.custom.{id}
        const customActionType = customConvId ? `offsite_conversion.custom.${customConvId}` : null;

        const statRows = adInsights.map((insight) => {
          const spend = parseFloat(insight.spend ?? "0");

          // Conversions: use custom conversion if configured, otherwise default purchase
          let conversions: number;
          let conversion_value: number;

          if (customActionType && insight.raw_actions) {
            const countEntry = insight.raw_actions.find((a) => a.action_type === customActionType);
            const valueEntry = insight.raw_action_values?.find((a) => a.action_type === customActionType);
            conversions = parseInt(countEntry?.value ?? "0", 10);
            conversion_value = parseFloat(valueEntry?.value ?? "0");
          } else {
            // Fallback: default purchase action + purchase_roas
            conversions = parseInt(insight.conversions ?? "0", 10);
            const roas = insight.purchase_roas?.[0]?.value;
            conversion_value = roas ? Math.round(parseFloat(roas) * spend * 100) / 100 : 0;
          }

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
            last_synced_at: new Date().toISOString(),
          };
        });

        const { error } = await admin
          .from("meta_ad_stats")
          .upsert(statRows, { onConflict: "meta_account_id,ad_id,metric_date" });

        if (!error) adCount = statRows.length;
      }

      // ── Also sync deployment statuses (backward compat) ───────────────
      for (const campaign of campaigns) {
        const dbStatus =
          campaign.effective_status === "ACTIVE" ? "active" :
          campaign.effective_status === "PAUSED" ? "paused" : "planned";

        await admin
          .from("ad_deployments")
          .update({ status: dbStatus })
          .eq("meta_campaign_id", campaign.id)
          .eq("meta_account_id", account.id);
      }

      return {
        account_id: account.account_id,
        name: account.name,
        campaigns: campaigns.length,
        ads: adCount,
      };
    }),
  );

  // ── 4. Collect results ────────────────────────────────────────────────────
  settled.forEach((result, i) => {
    const account = accounts[i]!;
    if (result.status === "fulfilled") {
      const val = result.value;
      totalRecords += val.ads;
      accountResults.push({
        account_id: account.account_id,
        name: account.name,
        status: "ok",
        campaigns: val.campaigns,
        ads: val.ads,
      });
    } else {
      failedCount++;
      const msg = result.reason instanceof Error ? result.reason.message : String(result.reason);
      errors.push(`[${account.name}] ${msg}`);
      accountResults.push({ account_id: account.account_id, name: account.name, status: "error", error: msg });
    }
  });

  // ── 5. Finalise sync run ──────────────────────────────────────────────────
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
