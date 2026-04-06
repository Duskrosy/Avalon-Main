import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveToken, fetchCampaignSpend, updateCampaignStatus } from "@/lib/meta/client";

/**
 * GET /api/ad-ops/live-ads/enforce-caps
 *
 * Checks all ACTIVE meta_campaigns with a spend cap set,
 * fetches real-time spend from Meta, and auto-pauses any that hit their cap.
 *
 * Auth: Bearer $CRON_SECRET header.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Fetch all ACTIVE campaigns with a spend cap set
  const { data: campaigns, error: dbErr } = await admin
    .from("meta_campaigns")
    .select("id, campaign_id, meta_account_id, spend_cap, spend_cap_period")
    .eq("effective_status", "ACTIVE")
    .not("spend_cap", "is", null);

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  if (!campaigns?.length) {
    return NextResponse.json({ checked: 0, paused: 0, message: "No active capped campaigns" });
  }

  // Fetch accounts for tokens
  const accountIds = [...new Set(campaigns.map((c) => c.meta_account_id))];
  const { data: accounts } = await admin
    .from("ad_meta_accounts")
    .select("id, account_id, meta_access_token")
    .in("id", accountIds);

  const accountMap = Object.fromEntries((accounts ?? []).map((a) => [a.id, a]));

  // Group by Meta account for batched spend fetch
  const byAccount = new Map<string, typeof campaigns>();
  for (const c of campaigns) {
    const acct = accountMap[c.meta_account_id];
    if (!acct?.account_id || !c.campaign_id) continue;
    if (!byAccount.has(acct.account_id)) byAccount.set(acct.account_id, []);
    byAccount.get(acct.account_id)!.push(c);
  }

  const spendMap: Record<string, number> = {};

  await Promise.allSettled(
    Array.from(byAccount.entries()).map(async ([accountId, camps]) => {
      const acct = accountMap[camps[0].meta_account_id];
      const token = resolveToken(acct ?? {});
      const campaignIds = camps.map((c) => c.campaign_id!).filter(Boolean);
      if (!token || !campaignIds.length) return;
      const result = await fetchCampaignSpend(accountId, token, campaignIds, "lifetime");
      Object.assign(spendMap, result);
    }),
  );

  // Auto-pause over-cap campaigns
  type CapResult = { id: string; campaign_id: string; spend: number; cap: number; paused: boolean; error?: string };
  const results: CapResult[] = [];

  await Promise.allSettled(
    campaigns.map(async (c) => {
      if (!c.campaign_id || c.spend_cap === null) return;
      const acct = accountMap[c.meta_account_id];
      const token = resolveToken(acct ?? {});
      if (!token) return;

      let liveSpend = spendMap[c.campaign_id] ?? null;

      // Re-fetch with correct period if not lifetime
      if (c.spend_cap_period !== "lifetime" && acct?.account_id) {
        try {
          const perPeriod = await fetchCampaignSpend(
            acct.account_id,
            token,
            [c.campaign_id],
            c.spend_cap_period as "lifetime" | "monthly" | "daily",
          );
          liveSpend = perPeriod[c.campaign_id] ?? liveSpend;
        } catch { /* fall back to lifetime */ }
      }

      if (liveSpend === null) return;

      const result: CapResult = { id: c.id, campaign_id: c.campaign_id, spend: liveSpend, cap: c.spend_cap!, paused: false };

      if (liveSpend >= c.spend_cap!) {
        try {
          await updateCampaignStatus(c.campaign_id, token, "PAUSED");
          await admin.from("meta_campaigns").update({
            effective_status: "PAUSED",
            auto_paused_at: new Date().toISOString(),
            auto_paused_reason: `Spend cap reached: ${liveSpend.toFixed(2)} / ${c.spend_cap}`,
          }).eq("id", c.id);
          result.paused = true;
        } catch (e) {
          result.error = String(e);
        }
      }

      results.push(result);
    }),
  );

  return NextResponse.json({
    checked: campaigns.length,
    paused: results.filter((r) => r.paused).length,
    timestamp: new Date().toISOString(),
    results,
  });
}
