import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveToken, fetchCampaignSpend, updateCampaignStatus } from "@/lib/meta/client";

/**
 * GET /api/ad-ops/live-ads/enforce-caps
 *
 * Cron endpoint — runs every hour via Vercel cron.
 * Checks all ACTIVE deployments with a spend cap set,
 * fetches real-time spend from Meta, and auto-pauses any
 * campaigns that have hit or exceeded their cap.
 *
 * Auth: Bearer $CRON_SECRET header (set in Vercel env vars).
 * Also callable manually by OPS via the dashboard.
 */
export async function GET(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // ── Fetch all ACTIVE deployments with a spend cap ─────────────────────────
  const { data: deployments, error: dbErr } = await admin
    .from("ad_deployments")
    .select(`
      id, meta_campaign_id, spend_cap, spend_cap_period,
      account:ad_meta_accounts(account_id, meta_access_token)
    `)
    .eq("status", "active")
    .not("spend_cap", "is", null);

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  if (!deployments?.length) {
    return NextResponse.json({ checked: 0, paused: 0, message: "No active capped deployments" });
  }

  // ── Group by Meta account for batched spend fetch ─────────────────────────
  type Dep = (typeof deployments)[number];
  const byAccount = new Map<string, Dep[]>();

  for (const dep of deployments) {
    const acct = dep.account as unknown as { account_id: string; meta_access_token: string | null } | null;
    if (!acct?.account_id || !dep.meta_campaign_id) continue;
    const key = acct.account_id;
    if (!byAccount.has(key)) byAccount.set(key, []);
    byAccount.get(key)!.push(dep);
  }

  const spendMap: Record<string, number> = {};

  await Promise.allSettled(
    Array.from(byAccount.entries()).map(async ([accountId, deps]) => {
      const acct = deps[0].account as unknown as { account_id: string; meta_access_token: string | null } | null;
      const token = resolveToken(acct ?? {});
      const campaignIds = deps.map((d) => d.meta_campaign_id!).filter(Boolean);
      if (!token || !campaignIds.length) return;

      // Use the first deployment's period (all caps in same account may differ — handled per-dep below)
      const result = await fetchCampaignSpend(accountId, token, campaignIds, "lifetime");
      Object.assign(spendMap, result);
    }),
  );

  // ── Auto-pause over-cap campaigns ─────────────────────────────────────────
  type CapResult = { id: string; campaign_id: string; spend: number; cap: number; paused: boolean; error?: string };
  const results: CapResult[] = [];

  await Promise.allSettled(
    deployments.map(async (dep) => {
      if (!dep.meta_campaign_id || dep.spend_cap === null) return;

      const acct = dep.account as unknown as { account_id: string; meta_access_token: string | null } | null;
      const token = resolveToken(acct ?? {});
      if (!token) return;

      // For per-period caps, re-fetch with the right period
      let liveSpend = spendMap[dep.meta_campaign_id] ?? null;
      if (dep.spend_cap_period !== "lifetime" && acct?.account_id) {
        try {
          const perPeriod = await fetchCampaignSpend(
            acct.account_id,
            token,
            [dep.meta_campaign_id],
            dep.spend_cap_period as "lifetime" | "monthly" | "daily",
          );
          liveSpend = perPeriod[dep.meta_campaign_id] ?? liveSpend;
        } catch {
          // fall back to lifetime spend already fetched
        }
      }

      if (liveSpend === null) return;

      const result: CapResult = { id: dep.id, campaign_id: dep.meta_campaign_id, spend: liveSpend, cap: dep.spend_cap!, paused: false };

      if (liveSpend >= dep.spend_cap!) {
        try {
          await updateCampaignStatus(dep.meta_campaign_id, token, "PAUSED");
          await admin.from("ad_deployments").update({
            status: "paused",
            auto_paused_at: new Date().toISOString(),
            auto_paused_reason: `Spend cap reached: ${liveSpend.toFixed(2)} / ${dep.spend_cap}`,
          }).eq("id", dep.id);
          result.paused = true;
        } catch (e) {
          result.error = String(e);
        }
      }

      results.push(result);
    }),
  );

  const pausedCount = results.filter((r) => r.paused).length;

  return NextResponse.json({
    checked: deployments.length,
    paused: pausedCount,
    timestamp: new Date().toISOString(),
    results,
  });
}
