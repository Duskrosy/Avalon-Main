import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isManagerOrAbove, isOps } from "@/lib/permissions";
import { resolveToken, fetchCampaignSpend, fetchAdsetSpend, updateCampaignStatus } from "@/lib/meta/client";
import { z } from "zod";

async function requireAccess() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }), user: null };
  return { error: null, user };
}

// ─── GET — live campaigns + stats + thumbnails ─────────────────────────────────
export async function GET(req: NextRequest) {
  const { error } = await requireAccess();
  if (error) return error;

  // Live Ads shows today-only values — "just for today's running"
  const metricDate = new Date().toISOString().split("T")[0];
  // Retain optional ?days override for debug/tooling (defaults to today)
  const daysParam = req.nextUrl.searchParams.get("days");
  const cutoff = daysParam
    ? new Date(Date.now() - parseInt(daysParam) * 86400000).toISOString().split("T")[0]
    : metricDate;

  const admin = createAdminClient();

  // 1. Campaigns: ACTIVE or auto-paused via this page, excluding manually hidden ones
  const { data: campaigns, error: dbErr } = await admin
    .from("meta_campaigns")
    .select("id, campaign_id, campaign_name, effective_status, meta_account_id, daily_budget, spend_cap, spend_cap_period, auto_paused_at, auto_paused_reason, hidden_at")
    .or("effective_status.eq.ACTIVE,auto_paused_at.not.is.null")
    .is("hidden_at", null)
    .order("campaign_name");

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  if (!campaigns?.length) return NextResponse.json([]);

  // 2. Accounts for token + currency lookup
  const { data: accounts } = await admin
    .from("ad_meta_accounts")
    .select("id, account_id, name, meta_access_token, currency")
    .eq("is_active", true);

  const accountMap = Object.fromEntries((accounts ?? []).map((a) => [a.id, a]));

  // 3. Stats for these campaigns over the requested window
  const campaignIds = campaigns.map((c) => c.campaign_id).filter(Boolean) as string[];
  const { data: statsRaw } = campaignIds.length
    ? await admin
        .from("meta_ad_stats")
        .select("campaign_id, meta_account_id, ad_id, ad_name, adset_id, adset_name, spend, conversions, conversion_value, impressions, clicks, video_plays, video_plays_25pct, metric_date")
        .in("campaign_id", campaignIds)
        .gte("metric_date", cutoff)
    : { data: [] };

  // 4. Thumbnail map: meta_ad_id → thumbnail_url via ad_deployments → ad_assets
  const adIds = [...new Set((statsRaw ?? []).map((s) => s.ad_id).filter(Boolean))] as string[];
  const thumbnailMap: Record<string, string> = {};
  if (adIds.length) {
    const { data: deps } = await admin
      .from("ad_deployments")
      .select("meta_ad_id, asset:ad_assets(thumbnail_url)")
      .in("meta_ad_id", adIds);
    for (const d of deps ?? []) {
      const thumb = (d.asset as unknown as { thumbnail_url: string | null } | null)?.thumbnail_url;
      if (d.meta_ad_id && thumb) thumbnailMap[d.meta_ad_id] = thumb;
    }
  }

  // 5. Aggregate stats: campaign_key → adset_name → ad_id
  type AdAgg = {
    ad_id: string;
    ad_name: string | null;
    adset_id: string | null;
    spend: number; conversions: number; conversion_value: number;
    impressions: number; clicks: number; video_plays: number; video_plays_25pct: number;
    thumbnail_url: string | null;
  };
  type AdsetAgg = {
    adset_name: string;
    ads: Map<string, AdAgg>;
  };
  const statsMap = new Map<string, Map<string, AdsetAgg>>();

  for (const s of statsRaw ?? []) {
    if (!s.campaign_id) continue;
    const key = `${s.meta_account_id}__${s.campaign_id}`;
    if (!statsMap.has(key)) statsMap.set(key, new Map());
    const adsetKey = s.adset_name ?? "__unset__";
    const adsetMap = statsMap.get(key)!;
    if (!adsetMap.has(adsetKey)) {
      adsetMap.set(adsetKey, { adset_name: s.adset_name ?? "Unknown Adset", ads: new Map() });
    }
    const adset = adsetMap.get(adsetKey)!;
    if (!adset.ads.has(s.ad_id)) {
      adset.ads.set(s.ad_id, {
        ad_id: s.ad_id, ad_name: s.ad_name ?? null,
        adset_id: s.adset_id ?? null,
        spend: 0, conversions: 0, conversion_value: 0,
        impressions: 0, clicks: 0, video_plays: 0, video_plays_25pct: 0,
        thumbnail_url: thumbnailMap[s.ad_id] ?? null,
      });
    }
    const ad = adset.ads.get(s.ad_id)!;
    ad.spend            += s.spend ?? 0;
    ad.conversions      += s.conversions ?? 0;
    ad.conversion_value += s.conversion_value ?? 0;
    ad.impressions      += s.impressions ?? 0;
    ad.clicks           += s.clicks ?? 0;
    ad.video_plays      += s.video_plays ?? 0;
    ad.video_plays_25pct += s.video_plays_25pct ?? 0;
  }

  // 6. Adset spend caps from DB
  const allAdsetIds = Array.from(new Set(
    Array.from(statsMap.values()).flatMap((adsetMap) =>
      Array.from(adsetMap.values()).flatMap((adset) =>
        Array.from(adset.ads.values()).map((a) => a.adset_id).filter(Boolean) as string[]
      )
    )
  ));
  const { data: adsetCapsRaw } = allAdsetIds.length
    ? await admin.from("meta_adset_caps").select("adset_id, meta_account_id, spend_cap, spend_cap_period, auto_paused_at, auto_paused_reason").in("adset_id", allAdsetIds)
    : { data: [] };
  const adsetCapMap = Object.fromEntries((adsetCapsRaw ?? []).map((c) => [c.adset_id, c]));

  // 6b. Live adset spend from Meta for capped adsets only
  const cappedAdsetIds = (adsetCapsRaw ?? []).map((c) => c.adset_id);
  const adsetSpendMap: Record<string, number> = {};
  if (cappedAdsetIds.length) {
    // Group capped adsets by account
    const adsetByAccount = new Map<string, { adsetIds: string[]; acctId: string }>();
    for (const cap of adsetCapsRaw ?? []) {
      const acct = accountMap[cap.meta_account_id ?? ""] ?? null;
      if (!acct?.account_id) continue;
      if (!adsetByAccount.has(acct.account_id)) adsetByAccount.set(acct.account_id, { adsetIds: [], acctId: acct.account_id });
      adsetByAccount.get(acct.account_id)!.adsetIds.push(cap.adset_id);
    }
    await Promise.allSettled(
      Array.from(adsetByAccount.entries()).map(async ([accountId, { adsetIds }]) => {
        const acct = (accounts ?? []).find((a) => a.account_id === accountId);
        if (!acct) return;
        const token = resolveToken(acct);
        const result = await fetchAdsetSpend(accountId, token, adsetIds, "lifetime");
        Object.assign(adsetSpendMap, result);
      })
    );
  }

  // 7. Live campaign spend from Meta, batched by account
  const byAccount = new Map<string, typeof campaigns>();
  for (const c of campaigns) {
    const acct = accountMap[c.meta_account_id];
    if (!acct?.account_id) continue;
    if (!byAccount.has(acct.account_id)) byAccount.set(acct.account_id, []);
    byAccount.get(acct.account_id)!.push(c);
  }

  const spendMap: Record<string, number> = {};
  await Promise.allSettled(
    Array.from(byAccount.entries()).map(async ([accountId, camps]) => {
      const acct = accountMap[camps[0].meta_account_id];
      const token = resolveToken(acct ?? {});
      const ids = camps.map((c) => c.campaign_id).filter(Boolean) as string[];
      if (!ids.length || !token) return;
      const period = (camps[0].spend_cap_period ?? "lifetime") as "lifetime" | "monthly" | "daily";
      Object.assign(spendMap, await fetchCampaignSpend(accountId, token, ids, period));
    }),
  );

  // 8. Build final response
  const result = campaigns.map((c) => {
    const acct = accountMap[c.meta_account_id] ?? null;
    const key = `${c.meta_account_id}__${c.campaign_id}`;
    const adsetMap = statsMap.get(key);

    const adsets = adsetMap
      ? Array.from(adsetMap.values()).map((adset) => {
          const ads = Array.from(adset.ads.values()).sort((a, b) => b.spend - a.spend);
          const adsetSpend = ads.reduce((s, a) => s + a.spend, 0);
          const adsetConvValue = ads.reduce((s, a) => s + a.conversion_value, 0);
          const adsetConv = ads.reduce((s, a) => s + a.conversions, 0);
          const adsetImpr = ads.reduce((s, a) => s + a.impressions, 0);
          const adsetId = ads[0]?.adset_id ?? null;
          const cap = adsetId ? adsetCapMap[adsetId] : null;
          const liveAdsetSpend = adsetId ? (adsetSpendMap[adsetId] ?? null) : null;
          return {
            adset_name: adset.adset_name,
            adset_id: adsetId,
            spend: adsetSpend,
            live_spend: liveAdsetSpend,
            conversions: adsetConv,
            conversion_value: adsetConvValue,
            impressions: adsetImpr,
            roas: adsetSpend > 0 ? adsetConvValue / adsetSpend : null,
            spend_cap: cap?.spend_cap ?? null,
            spend_cap_period: cap?.spend_cap_period ?? "lifetime",
            auto_paused_at: cap?.auto_paused_at ?? null,
            auto_paused_reason: cap?.auto_paused_reason ?? null,
            ads: ads.map((a) => ({
              ...a,
              roas: a.spend > 0 ? a.conversion_value / a.spend : null,
              ctr: a.impressions > 0 ? (a.clicks / a.impressions) * 100 : null,
              hook_rate: a.impressions > 0 ? (a.video_plays_25pct / a.impressions) * 100 : null,
            })),
          };
        }).sort((a, b) => b.spend - a.spend)
      : [];

    return {
      id: c.id,
      campaign_name: c.campaign_name,
      status: (c.effective_status ?? "").toLowerCase(),
      meta_campaign_id: c.campaign_id,
      spend_cap: c.spend_cap,
      spend_cap_period: c.spend_cap_period ?? "lifetime",
      auto_paused_at: c.auto_paused_at,
      auto_paused_reason: c.auto_paused_reason,
      daily_budget: c.daily_budget,
      live_spend: c.campaign_id ? (spendMap[c.campaign_id] ?? null) : null,
      account: acct ? { id: acct.id, name: acct.name, account_id: acct.account_id, currency: acct.currency ?? "USD" } : null,
      adsets,
    };
  });

  return NextResponse.json(result);
}

// ─── POST — toggle campaign status OR hide/unhide from Live Ads list ──────────
const toggleSchema = z.object({
  deployment_id: z.string().uuid(),
  action: z.enum(["pause", "resume", "hide", "unhide"]),
});

export async function POST(req: NextRequest) {
  const { error, user } = await requireAccess();
  if (error) return error;
  if (!isManagerOrAbove(user!)) return NextResponse.json({ error: "Managers or above only" }, { status: 403 });

  if (!isOps(user!)) {
    const supabase = await createClient();
    const { data: dept } = await supabase
      .from("departments")
      .select("slug")
      .eq("id", user!.department_id)
      .maybeSingle();
    if (!["ad-ops", "marketing"].includes(dept?.slug ?? "")) {
      return NextResponse.json({ error: "Only ad-ops and marketing can modify live ads" }, { status: 403 });
    }
  }

  const parsed = toggleSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });

  const { deployment_id, action } = parsed.data;
  const admin = createAdminClient();

  // ── Hide / unhide: DB-only, no Meta call ──
  if (action === "hide" || action === "unhide") {
    const { error: dbErr } = await admin
      .from("meta_campaigns")
      .update({
        hidden_at: action === "hide" ? new Date().toISOString() : null,
        hidden_by: action === "hide" ? user!.id : null,
      })
      .eq("id", deployment_id);
    if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
    return NextResponse.json({ ok: true, hidden: action === "hide" });
  }

  // ── Pause / resume: call Meta + update DB ──
  const { data: campaign } = await admin
    .from("meta_campaigns")
    .select("campaign_id, meta_account_id")
    .eq("id", deployment_id)
    .single();

  if (!campaign?.campaign_id) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  const { data: acct } = await admin
    .from("ad_meta_accounts")
    .select("account_id, meta_access_token")
    .eq("id", campaign.meta_account_id)
    .single();

  const token = resolveToken(acct ?? {});
  if (!token) return NextResponse.json({ error: "No access token configured" }, { status: 400 });

  await updateCampaignStatus(campaign.campaign_id, token, action === "pause" ? "PAUSED" : "ACTIVE");

  await admin.from("meta_campaigns").update({
    effective_status: action === "pause" ? "PAUSED" : "ACTIVE",
    // Pausing from this page sets auto_paused_at so it remains visible in "Paused" filter
    auto_paused_at: action === "pause" ? new Date().toISOString() : null,
    auto_paused_reason: action === "pause" ? "Manually paused via Live Ads" : null,
  }).eq("id", deployment_id);

  return NextResponse.json({ ok: true, status: action === "pause" ? "paused" : "active" });
}

// ─── PATCH — set or clear spend cap ───────────────────────────────────────────
const capSchema = z.object({
  deployment_id: z.string().uuid(),
  spend_cap: z.number().positive().nullable(),
  spend_cap_period: z.enum(["lifetime", "monthly", "daily"]).optional(),
});

export async function PATCH(req: NextRequest) {
  const { error, user } = await requireAccess();
  if (error) return error;
  if (!isManagerOrAbove(user!)) return NextResponse.json({ error: "Managers or above only" }, { status: 403 });

  if (!isOps(user!)) {
    const supabase = await createClient();
    const { data: dept } = await supabase
      .from("departments")
      .select("slug")
      .eq("id", user!.department_id)
      .maybeSingle();
    if (!["ad-ops", "marketing"].includes(dept?.slug ?? "")) {
      return NextResponse.json({ error: "Only ad-ops and marketing can modify live ads" }, { status: 403 });
    }
  }

  const parsed = capSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });

  const { deployment_id, spend_cap, spend_cap_period } = parsed.data;
  const admin = createAdminClient();

  const updates: Record<string, unknown> = { spend_cap: spend_cap ?? null };
  if (spend_cap_period) updates.spend_cap_period = spend_cap_period;

  const { error: dbErr } = await admin.from("meta_campaigns").update(updates).eq("id", deployment_id);
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
