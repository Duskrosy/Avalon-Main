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

// GET — fetch live deployments + real-time spend from Meta
export async function GET() {
  const { error } = await requireAccess();
  if (error) return error;

  const admin = createAdminClient();

  // Fetch active + paused deployments with their account tokens + asset thumbnails.
  // Include "ended" rows that were auto-paused (spend cap enforcement) so they remain visible
  // on the Live Ads page even if the Meta campaign is technically stopped.
  const { data: deployments, error: dbErr } = await admin
    .from("ad_deployments")
    .select(`
      id, campaign_name, status, meta_campaign_id, meta_adset_id, meta_ad_id,
      spend_cap, spend_cap_period, auto_paused_at, auto_paused_reason,
      launched_at,
      asset:ad_assets(id, asset_code, title, thumbnail_url, content_type, hook_type),
      account:ad_meta_accounts(id, account_id, name, meta_access_token, currency)
    `)
    .or("status.in.(active,paused),auto_paused_at.not.is.null")
    .order("launched_at", { ascending: false });

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  if (!deployments?.length) return NextResponse.json([]);

  // Group deployments by account to batch the spend fetch
  const byAccount = new Map<string, typeof deployments>();
  for (const dep of deployments) {
    const acct = dep.account as unknown as { id: string; account_id: string; meta_access_token: string | null } | null;
    if (!acct?.account_id) continue;
    const key = acct.account_id;
    if (!byAccount.has(key)) byAccount.set(key, []);
    byAccount.get(key)!.push(dep);
  }

  // Fetch live spend per account in parallel
  const spendMap: Record<string, number> = {}; // key: meta_campaign_id

  await Promise.allSettled(
    Array.from(byAccount.entries()).map(async ([accountId, deps]) => {
      const acct = deps[0].account as unknown as { meta_access_token: string | null };
      const token = resolveToken(acct);
      const campaignIds = deps.map((d) => d.meta_campaign_id).filter(Boolean) as string[];
      if (!campaignIds.length || !token) return;

      const period = (deps[0].spend_cap_period ?? "lifetime") as "lifetime" | "monthly" | "daily";
      const result = await fetchCampaignSpend(accountId, token, campaignIds, period);
      Object.assign(spendMap, result);
    })
  );

  // Attach live spend to each deployment
  const result = deployments.map((dep) => ({
    ...dep,
    live_spend: dep.meta_campaign_id ? (spendMap[dep.meta_campaign_id] ?? null) : null,
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

  const { data: dep, error: depErr } = await admin
    .from("ad_deployments")
    .select("meta_campaign_id, account:ad_meta_accounts(account_id, meta_access_token)")
    .eq("id", deployment_id)
    .single();

  if (depErr || !dep) return NextResponse.json({ error: "Deployment not found" }, { status: 404 });
  if (!dep.meta_campaign_id) return NextResponse.json({ error: "No Meta campaign ID on this deployment" }, { status: 400 });

  const acct = dep.account as unknown as { account_id: string; meta_access_token: string | null } | null;
  const token = resolveToken(acct ?? {});
  if (!token) return NextResponse.json({ error: "No access token configured" }, { status: 400 });

  const metaStatus = action === "pause" ? "PAUSED" : "ACTIVE";
  await updateCampaignStatus(dep.meta_campaign_id, token, metaStatus);

  const dbStatus = action === "pause" ? "paused" : "active";
  await admin
    .from("ad_deployments")
    .update({
      status: dbStatus,
      auto_paused_at: action === "pause" ? null : undefined, // clear auto_paused_at on manual resume
      auto_paused_reason: action === "pause" ? null : undefined,
    })
    .eq("id", deployment_id);

  return NextResponse.json({ ok: true, status: dbStatus });
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
    .from("ad_deployments")
    .update(updates)
    .eq("id", deployment_id);

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
