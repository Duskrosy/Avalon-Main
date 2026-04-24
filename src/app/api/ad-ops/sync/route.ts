import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import {
  resolveToken,
  fetchAdInsights,
  fetchCampaigns,
  fetchCampaignsByIds,
} from "@/lib/meta/client";

// ─── Auth ─────────────────────────────────────────────────────────────────────

function isCronRequest(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  return req.headers.get("authorization") === `Bearer ${cronSecret}`;
}

// ─── Progress event shape ────────────────────────────────────────────────────
// Streamed to the client as Server-Sent Events so the UI can show an accurate
// full-page progress bar with plain-English stage labels.
type SyncProgressEvent =
  | { stage: "init";       label: string; pct: number }
  | { stage: "pulling";    label: string; detail: string; pct: number }
  | { stage: "refreshing"; label: string; detail: string; pct: number }
  | { stage: "saving";     label: string; detail: string; pct: number }
  | { stage: "done";       label: string; pct: 100; summary: SyncSummary }
  | { stage: "error";      message: string };

type SyncSummary = {
  synced: number;
  failed: number;
  campaigns: number;
  ads: number;
  errors?: string[];
};

type AccountRow = {
  id: string;
  account_id: string;
  name: string;
  meta_access_token: string | null;
  currency: string | null;
  primary_conversion_id: string | null;
  primary_conversion_name: string | null;
};

type AccountResult = {
  account_id: string;
  name: string;
  status: "ok" | "error";
  error?: string;
  campaigns?: number;
  ads?: number;
};

// ─── Core pipeline (shared between streaming + JSON modes) ───────────────────

async function runSync(
  fullBackfill: boolean,
  triggeredBy: string,
  onProgress: (event: SyncProgressEvent) => void,
): Promise<SyncSummary> {
  const admin = createAdminClient();

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const metricDate = yesterday.toISOString().split("T")[0];

  onProgress({ stage: "init", label: "Checking your connected ad accounts…", pct: 2 });

  const { data: syncRun, error: syncRunError } = await admin
    .from("ad_meta_sync_runs")
    .insert({ status: "running", triggered_by: triggeredBy, sync_date: metricDate })
    .select("id")
    .single();
  if (syncRunError || !syncRun) {
    throw new Error("Failed to create sync run");
  }
  const syncRunId = syncRun.id;

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
    const summary = { synced: 0, failed: 0, campaigns: 0, ads: 0 };
    onProgress({ stage: "done", label: "No active ad accounts configured.", pct: 100, summary });
    return summary;
  }

  const total = accounts.length;
  const phasesPerAccount = 3; // pulling, refreshing, saving
  const totalSteps = total * phasesPerAccount;
  let completedSteps = 0;

  const bumpPct = () => {
    completedSteps += 1;
    // Reserve the last 3% for the final "done" event so the bar doesn't hit
    // 100% before we've written the sync_runs row.
    return Math.min(97, 2 + Math.round((completedSteps / totalSteps) * 95));
  };

  const syncedAccountDetail = (idx: number, acct: AccountRow) =>
    `Account ${idx + 1} of ${total}: ${acct.name}`;

  const processAccount = async (account: AccountRow, idx: number): Promise<AccountResult> => {
    const detail = syncedAccountDetail(idx, account);
    try {
      const token = resolveToken(account);
      if (!token) throw new Error("No access token available");

      onProgress({
        stage: "pulling",
        label: fullBackfill
          ? "Pulling every campaign from Meta (backfill mode)…"
          : "Pulling yesterday's performance from Meta…",
        detail,
        pct: Math.min(97, 2 + Math.round((completedSteps / totalSteps) * 95)),
      });

      const [adInsights, fullCampaigns] = await Promise.all([
        fetchAdInsights(account.account_id, token, "yesterday"),
        fullBackfill ? fetchCampaigns(account.account_id, token) : Promise.resolve([]),
      ]);
      const campaigns = fullBackfill
        ? fullCampaigns
        : await (async () => {
            const ids = Array.from(
              new Set(adInsights.map((i) => i.campaign_id).filter(Boolean)),
            );
            return ids.length > 0 ? fetchCampaignsByIds(token, ids) : [];
          })();

      onProgress({
        stage: "refreshing",
        label: "Refreshing campaign names, status, and budgets…",
        detail,
        pct: bumpPct(),
      });

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
        await admin.from("meta_campaigns").upsert(campaignRows, { onConflict: "meta_account_id,campaign_id" });
      }

      onProgress({
        stage: "saving",
        label: "Saving ad results to your dashboard…",
        detail,
        pct: bumpPct(),
      });

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
              (a) => a.action_type === "onsite_conversion.messaging_conversation_started_7d",
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

      await Promise.allSettled(
        campaigns.map((campaign) => {
          const dbStatus =
            campaign.effective_status === "ACTIVE" ? "active" :
            campaign.effective_status === "PAUSED" ? "paused" : "planned";
          return admin
            .from("ad_deployments")
            .update({ status: dbStatus })
            .eq("meta_campaign_id", campaign.id)
            .eq("meta_account_id", account.id);
        }),
      );

      bumpPct();

      return {
        account_id: account.account_id,
        name: account.name,
        status: "ok",
        campaigns: campaigns.length,
        ads: adCount,
      };
    } catch (err) {
      // Mark all three phases as done for this account so the bar doesn't stall
      while (completedSteps < (idx + 1) * phasesPerAccount) bumpPct();
      const msg = err instanceof Error ? err.message : String(err);
      return { account_id: account.account_id, name: account.name, status: "error", error: msg };
    }
  };

  const settled = await Promise.allSettled(accounts.map((a, i) => processAccount(a, i)));
  const accountResults: AccountResult[] = settled.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : { account_id: accounts[i]!.account_id, name: accounts[i]!.name, status: "error", error: String(r.reason) },
  );

  const failedCount = accountResults.filter((r) => r.status === "error").length;
  const totalAds = accountResults.reduce((s, r) => s + (r.ads ?? 0), 0);
  const totalCampaigns = accountResults.reduce((s, r) => s + (r.campaigns ?? 0), 0);
  const errors = accountResults.filter((r) => r.error).map((r) => `[${r.name}] ${r.error}`);

  await admin.from("ad_meta_sync_runs").update({
    status: failedCount === accounts.length ? "failed" : "success",
    completed_at: new Date().toISOString(),
    records_processed: totalAds,
    account_results: accountResults,
    error_log: errors.length > 0 ? errors.join("\n") : null,
  }).eq("id", syncRunId);

  const summary: SyncSummary = {
    synced: accounts.length - failedCount,
    failed: failedCount,
    campaigns: totalCampaigns,
    ads: totalAds,
    errors: errors.length > 0 ? errors : undefined,
  };

  onProgress({
    stage: "done",
    label: `All done — ${totalCampaigns.toLocaleString()} campaign${totalCampaigns === 1 ? "" : "s"} · ${totalAds.toLocaleString()} ad${totalAds === 1 ? "" : "s"} updated.`,
    pct: 100,
    summary,
  });

  return summary;
}

// ─── POST /api/ad-ops/sync ────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const fromCron = isCronRequest(req);
  if (!fromCron) {
    const supabase = await createClient();
    const currentUser = await getCurrentUser(supabase);
    if (!currentUser || !isOps(currentUser)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const fullBackfill = req.nextUrl.searchParams.get("mode") === "full";
  const streaming = req.nextUrl.searchParams.get("stream") === "1";
  const triggeredBy = fromCron ? "cron" : fullBackfill ? "backfill" : "manual";

  if (streaming) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: SyncProgressEvent) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          } catch { /* client disconnected */ }
        };
        try {
          await runSync(fullBackfill, triggeredBy, send);
        } catch (err) {
          send({ stage: "error", message: err instanceof Error ? err.message : String(err) });
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  }

  // Non-streaming mode (cron + any legacy callers)
  try {
    const summary = await runSync(fullBackfill, triggeredBy, () => { /* silent */ });
    return NextResponse.json(summary);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
