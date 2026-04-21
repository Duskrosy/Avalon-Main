import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { PostedContentView, type PostedRow } from "./posted-content-view";

type PageWindow = "recent" | "historical";

export default async function PostedContentPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string }>;
}) {
  const sp = await searchParams;
  const windowSel: PageWindow = sp?.window === "historical" ? "historical" : "recent";
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) redirect("/login");

  const ops = isOps(currentUser);
  if (!ops) {
    const { data: dept } = await supabase
      .from("departments")
      .select("slug")
      .eq("id", currentUser.department_id ?? "")
      .maybeSingle();
    if (!["creatives", "marketing", "ad-ops"].includes(dept?.slug ?? "")) redirect("/");
  }

  const admin = createAdminClient();

  const now = new Date();
  // Recent: 0–30 days ago. Historical: 30–180 days ago.
  const recentDays = 30;
  const historicalMaxDays = 180;
  const fromDays = windowSel === "historical" ? historicalMaxDays : recentDays;
  const toDays = windowSel === "historical" ? recentDays : 0;
  const fromISO = new Date(now.getTime() - fromDays * 86400_000).toISOString().slice(0, 10);
  const toISO = windowSel === "historical"
    ? new Date(now.getTime() - toDays * 86400_000).toISOString().slice(0, 10)
    : null;

  // ── Organic: smm_top_posts — curated "top posts" snapshot table ────────────
  // Filter by metric_date so posts still getting engagement stay visible.
  // Limit bumped to 500 so newer posts aren't pushed off when many old posts
  // have fresh snapshots.
  let topPostsQuery = admin
    .from("smm_top_posts")
    .select(`
      id, post_external_id, post_url, thumbnail_url, caption_preview,
      post_type, published_at, impressions, reach, engagements,
      video_plays, avg_play_time_secs, metric_date,
      smm_group_platforms!inner (
        id, platform, page_name,
        smm_groups ( id, name )
      )
    `)
    .gte("metric_date", fromISO);
  if (toISO) topPostsQuery = topPostsQuery.lt("metric_date", toISO);
  const { data: topPosts } = await topPostsQuery
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(500);

  // ── Ads: meta_ad_stats aggregated by ad_id, joined to meta_campaigns ──────────
  let statsQuery = admin
    .from("meta_ad_stats")
    .select(`
      ad_id, ad_name, adset_name, campaign_id, campaign_name, meta_account_id,
      metric_date, impressions, reach, spend, conversions, video_plays, clicks
    `)
    .gte("metric_date", fromISO);
  if (toISO) statsQuery = statsQuery.lt("metric_date", toISO);
  const { data: statsRows } = await statsQuery;

  // Aggregate per ad_id
  type AdAgg = {
    ad_id: string;
    ad_name: string | null;
    adset_name: string | null;
    campaign_id: string | null;
    campaign_name: string | null;
    meta_account_id: string | null;
    first_date: string | null;
    last_date: string | null;
    impressions: number;
    reach: number;
    spend: number;
    conversions: number;
    video_plays: number;
    clicks: number;
  };
  const adAgg = new Map<string, AdAgg>();
  for (const r of statsRows ?? []) {
    if (!r.ad_id) continue;
    const acc = adAgg.get(r.ad_id) ?? {
      ad_id: r.ad_id,
      ad_name: r.ad_name ?? null,
      adset_name: r.adset_name ?? null,
      campaign_id: r.campaign_id ?? null,
      campaign_name: r.campaign_name ?? null,
      meta_account_id: r.meta_account_id ?? null,
      first_date: null,
      last_date: null,
      impressions: 0,
      reach: 0,
      spend: 0,
      conversions: 0,
      video_plays: 0,
      clicks: 0,
    };
    acc.ad_name       = acc.ad_name ?? r.ad_name ?? null;
    acc.adset_name    = acc.adset_name ?? r.adset_name ?? null;
    acc.campaign_name = acc.campaign_name ?? r.campaign_name ?? null;
    acc.impressions  += Number(r.impressions) || 0;
    acc.reach        += Number(r.reach) || 0;
    acc.spend        += Number(r.spend) || 0;
    acc.conversions  += Number(r.conversions) || 0;
    acc.video_plays  += Number(r.video_plays) || 0;
    acc.clicks       += Number(r.clicks) || 0;
    if (!acc.first_date || (r.metric_date && r.metric_date < acc.first_date)) acc.first_date = r.metric_date;
    if (!acc.last_date  || (r.metric_date && r.metric_date > acc.last_date))  acc.last_date  = r.metric_date;
    adAgg.set(r.ad_id, acc);
  }

  // Resolve account names (for group_name label)
  const accountIds = Array.from(new Set(
    Array.from(adAgg.values()).map((a) => a.meta_account_id).filter((x): x is string => !!x)
  ));
  const { data: accountRows } = accountIds.length > 0
    ? await admin
        .from("ad_meta_accounts")
        .select("id, name")
        .in("id", accountIds)
    : { data: [] as { id: string; name: string | null }[] };
  const accountName = new Map<string, string>();
  for (const a of accountRows ?? []) if (a.id) accountName.set(a.id, a.name ?? "");

  // Look up matching ad_deployments/ad_assets for thumbnails + creator attribution
  const adIds = Array.from(adAgg.keys());
  let deploymentsQuery = admin
    .from("ad_deployments")
    .select(`
      id, meta_ad_id,
      ad_assets ( id, title, thumbnail_url, content_type, creator_id )
    `)
    .not("meta_ad_id", "is", null);
  if (adIds.length > 0) deploymentsQuery = deploymentsQuery.in("meta_ad_id", adIds);
  const { data: deployments } = await deploymentsQuery;
  const deploymentByAdId = new Map<string, { title?: string | null; thumbnail_url?: string | null; content_type?: string | null }>();
  for (const d of deployments ?? []) {
    if (!d.meta_ad_id) continue;
    const asset = Array.isArray(d.ad_assets) ? d.ad_assets[0] : d.ad_assets;
    const a = asset as { title?: string | null; thumbnail_url?: string | null; content_type?: string | null } | null;
    deploymentByAdId.set(d.meta_ad_id, {
      title: a?.title ?? null,
      thumbnail_url: a?.thumbnail_url ?? null,
      content_type: a?.content_type ?? null,
    });
  }

  // ── Assemble unified rows ─────────────────────────────────────────────────
  const organicRows: PostedRow[] = (topPosts ?? []).map((p) => {
    const platRaw = (p as unknown as { smm_group_platforms: unknown }).smm_group_platforms;
    const plat = (Array.isArray(platRaw) ? platRaw[0] : platRaw) as
      | { platform?: string; page_name?: string; smm_groups?: unknown }
      | null;
    const grpRaw = plat?.smm_groups;
    const grp = (Array.isArray(grpRaw) ? grpRaw[0] : grpRaw) as { name?: string } | null;
    return {
      id: `organic-${p.id}`,
      source: "organic",
      title: p.caption_preview ?? "(no caption)",
      thumbnail_url: p.thumbnail_url ?? null,
      platform: plat?.platform ?? "—",
      group_name: grp?.name ?? null,
      published_at: p.published_at ?? p.metric_date ?? null,
      impressions: p.impressions ?? null,
      reach: p.reach ?? null,
      engagements: p.engagements ?? null,
      spend: null,
      conversions: null,
      messages: null,
      url: p.post_url ?? null,
      video_plays: p.video_plays ?? null,
      avg_play_time_secs: p.avg_play_time_secs ?? null,
      caption_preview: p.caption_preview ?? null,
      post_type: p.post_type ?? null,
      ad_id: null,
      campaign_name: null,
      adset_name: null,
    };
  });

  const adRows: PostedRow[] = Array.from(adAgg.values()).map((a) => {
    const link = deploymentByAdId.get(a.ad_id);
    return {
      id: `ad-${a.ad_id}`,
      source: "ad",
      title: link?.title ?? a.ad_name ?? a.campaign_name ?? "(untitled ad)",
      thumbnail_url: link?.thumbnail_url ?? null,
      platform: "meta",
      group_name: (a.meta_account_id ? accountName.get(a.meta_account_id) : null) || a.campaign_name || null,
      published_at: a.first_date ? new Date(`${a.first_date}T00:00:00Z`).toISOString() : null,
      impressions: a.impressions || null,
      reach: a.reach || null,
      engagements: null,
      spend: a.spend || null,
      conversions: a.conversions || null,
      messages: null,
      url: null,
      video_plays: a.video_plays || null,
      avg_play_time_secs: null,
      caption_preview: a.ad_name ?? null,
      post_type: link?.content_type ?? null,
      ad_id: a.ad_id,
      campaign_name: a.campaign_name ?? null,
      adset_name: a.adset_name ?? null,
    };
  });

  const rows = [...organicRows, ...adRows].sort((a, b) => {
    const ta = a.published_at ? new Date(a.published_at).getTime() : 0;
    const tb = b.published_at ? new Date(b.published_at).getTime() : 0;
    return tb - ta;
  });

  return (
    <div className="max-w-6xl mx-auto">
      <PostedContentView rows={rows} windowSel={windowSel} />
    </div>
  );
}