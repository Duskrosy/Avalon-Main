import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isManagerOrAbove } from "@/lib/permissions";
import { resolveToken, fetchCampaignSpend, updateCampaignStatus } from "@/lib/meta/client";
import { z } from "zod";

async function requireAccess() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }), user: null };
  return { error: null, user };
}

// GET — fetch live campaigns + real-time spend from Meta
export async function GET() {
  const { error } = await requireAccess();
  if (error) return error;

  const admin = createAdminClient();

  // Fetch active + paused campaigns from the synced Meta campaigns table
  const { data: campaigns, error: dbErr } = await admin
    .from("meta_campaigns")
    .select("id, campaign_id, campaign_name, effective_status, meta_account_id, daily_budget, spend_cap, spend_cap_period, auto_paused_at, auto_paused_reason")
    .or("effective_status.in.(ACTIVE,PAUSED),auto_paused_at.not.is.null")
    .order("campaign_name");

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  if (!campaigns?.length) return NextResponse.json([]);

  // Fetch all active accounts for token + currency lookup
  const { data: accounts } = await admin
    .from("ad_meta_accounts")
    .select("id, account_id, name, meta_access_token, currency")
    .eq("is_active", true);

  const accountMap = Object.fromEntries((accounts ?? []).map((a) => [a.id, a]));

  // Group campaigns by Meta account to batch the spend fetch
  const byAccount = new Map<string, typeof campaigns>();
  for (const c of campaigns) {
    const acct = accountMap[c.meta_account_id];
    if (!acct?.account_id) continue;
    if (!byAccount.has(acct.account_id)) byAccount.set(acct.account_id, []);
    byAccount.get(acct.account_id)!.push(c);
  }

  // Fetch live spend per account in parallel
  const spendMap: Record<string, number> = {}; // key: meta campaign_id

  await Promise.allSettled(
    Array.from(byAccount.entries()).map(async ([accountId, camps]) => {
      const acct = accountMap[camps[0].meta_account_id];
      const token = resolveToken(acct ?? {});
      const campaignIds = camps.map((c) => c.campaign_id).filter(Boolean) as string[];
      if (!campaignIds.length || !token) return;

      const period = (camps[0].spend_cap_period ?? "lifetime") as "lifetime" | "monthly" | "daily";
      const result = await fetchCampaignSpend(accountId, token, campaignIds, period);
      Object.assign(spendMap, result);
    }),
  );

  // Shape the response to match what live-ads-view expects
  const result = campaigns.map((c) => ({
    id: c.id,
    campaign_name: c.campaign_name,
    status: (c.effective_status ?? "").toLowerCase(), // normalise to lowercase for the UI
    meta_campaign_id: c.campaign_id,
    spend_cap: c.spend_cap,
    spend_cap_period: c.spend_cap_period ?? "lifetime",
    auto_paused_at: c.auto_paused_at,
    auto_paused_reason: c.auto_paused_reason,
    launched_at: null,
    live_spend: c.campaign_id ? (spendMap[c.campaign_id] ?? null) : null,
    asset: null, // meta_campaigns has no linked creative asset
    account: accountMap[c.meta_account_id]
      ? {
          id: accountMap[c.meta_account_id].id,
          name: accountMap[c.meta_account_id].name,
          account_id: accountMap[c.meta_account_id].account_id,
          currency: accountMap[c.meta_account_id].currency ?? "USD",
        }
      : null,
    daily_budget: c.daily_budget,
  }));

  return NextResponse.json(result);
}

// POST — toggle campaign status (pause / resume)
const toggleSchema = z.object({
  deployment_id: z.string().uuid(),
  action: z.enum(["pause", "resume"]),
});

export async function POST(req: NextRequest) {
  const { error, user } = await requireAccess();
  if (error) return error;
  if (!isManagerOrAbove(user!)) {
    return NextResponse.json({ error: "Managers or above only" }, { status: 403 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = toggleSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });

  const { deployment_id, action } = parsed.data;
  const admin = createAdminClient();

  // Look up in meta_campaigns
  const { data: campaign, error: campErr } = await admin
    .from("meta_campaigns")
    .select("campaign_id, meta_account_id")
    .eq("id", deployment_id)
    .single();

  if (campErr || !campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  if (!campaign.campaign_id) return NextResponse.json({ error: "No Meta campaign ID on this record" }, { status: 400 });

  const { data: acct } = await admin
    .from("ad_meta_accounts")
    .select("account_id, meta_access_token")
    .eq("id", campaign.meta_account_id)
    .single();

  const token = resolveToken(acct ?? {});
  if (!token) return NextResponse.json({ error: "No access token configured" }, { status: 400 });

  const metaStatus = action === "pause" ? "PAUSED" : "ACTIVE";
  await updateCampaignStatus(campaign.campaign_id, token, metaStatus);

  const effectiveStatus = action === "pause" ? "PAUSED" : "ACTIVE";
  await admin
    .from("meta_campaigns")
    .update({
      effective_status: effectiveStatus,
      auto_paused_at: action === "resume" ? null : undefined,
      auto_paused_reason: action === "resume" ? null : undefined,
    })
    .eq("id", deployment_id);

  return NextResponse.json({ ok: true, status: effectiveStatus.toLowerCase() });
}

// PATCH — set or clear spend cap
const capSchema = z.object({
  deployment_id: z.string().uuid(),
  spend_cap: z.number().positive().nullable(),
  spend_cap_period: z.enum(["lifetime", "monthly", "daily"]).optional(),
});

export async function PATCH(req: NextRequest) {
  const { error, user } = await requireAccess();
  if (error) return error;
  if (!isManagerOrAbove(user!)) {
    return NextResponse.json({ error: "Managers or above only" }, { status: 403 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = capSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });

  const { deployment_id, spend_cap, spend_cap_period } = parsed.data;
  const admin = createAdminClient();

  const updates: Record<string, unknown> = { spend_cap: spend_cap ?? null };
  if (spend_cap_period) updates.spend_cap_period = spend_cap_period;

  const { error: dbErr } = await admin
    .from("meta_campaigns")
    .update(updates)
    .eq("id", deployment_id);

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
