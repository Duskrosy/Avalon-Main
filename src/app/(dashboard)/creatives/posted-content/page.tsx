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
  const fromTs = new Date(now.getTime() - fromDays * 86400_000).toISOString();
  const toISO = windowSel === "historical"
    ? new Date(now.getTime() - toDays * 86400_000).toISOString().slice(0, 10)
    : null;
  const toTs = windowSel === "historical"
    ? new Date(now.getTime() - toDays * 86400_000).toISOString()
    : null;

  // ── Organic: smm_top_posts → join to platform → group for label ───────────
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
    .limit(200);

  // ── Ads: ad_deployments + ad_assets + aggregated meta_ad_demographics ─────
  let deploymentsQuery = admin
    .from("ad_deployments")
    .select(`
      id, meta_ad_id, meta_campaign_id, campaign_name, launched_at, status,
      ad_assets ( id, title, thumbnail_url, content_type, creator_id )
    `)
    .not("meta_ad_id", "is", null)
    .gte("launched_at", fromTs);
  if (toTs) deploymentsQuery = deploymentsQuery.lt("launched_at", toTs);
  const { data: deployments } = await deploymentsQuery.order("launched_at", { ascending: false });

  const adIds = (deployments ?? [])
    .map((d) => d.meta_ad_id)
    .filter((x): x is string => !!x);

  const { data: demoRows } = adIds.length > 0
    ? await admin
        .from("meta_ad_demographics")
        .select("ad_id, spend, impressions, conversions, messages")
        .in("ad_id", adIds)
        .gte("date", fromISO)
    : { data: [] as { ad_id: string; spend: number; impressions: number; conversions: number; messages: number }[] };

  // Aggregate ad metrics by ad_id
  const adTotals = new Map<string, { spend: number; impressions: number; conversions: number; messages: number }>();
  for (const r of demoRows ?? []) {
    if (!r.ad_id) continue;
    const acc = adTotals.get(r.ad_id) ?? { spend: 0, impressions: 0, conversions: 0, messages: 0 };
    acc.spend       += Number(r.spend) || 0;
    acc.impressions += Number(r.impressions) || 0;
    acc.conversions += Number(r.conversions) || 0;
    acc.messages    += Number(r.messages) || 0;
    adTotals.set(r.ad_id, acc);
  }

  // ── Assemble unified rows ─────────────────────────────────────────────────
  const organicRows: PostedRow[] = (topPosts ?? []).map((p) => {
    // Supabase can return joined relations as array or object; normalize via unknown.
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
    };
  });

  const adRows: PostedRow[] = (deployments ?? []).map((d) => {
    const asset = Array.isArray(d.ad_assets) ? d.ad_assets[0] : d.ad_assets;
    const totals = adTotals.get(d.meta_ad_id ?? "") ?? { spend: 0, impressions: 0, conversions: 0, messages: 0 };
    return {
      id: `ad-${d.id}`,
      source: "ad",
      title: (asset as { title?: string } | null)?.title ?? d.campaign_name ?? "(untitled)",
      thumbnail_url: (asset as { thumbnail_url?: string } | null)?.thumbnail_url ?? null,
      platform: "meta",
      group_name: d.campaign_name ?? null,
      published_at: d.launched_at ?? null,
      impressions: totals.impressions || null,
      reach: null,
      engagements: null,
      spend: totals.spend || null,
      conversions: totals.conversions || null,
      messages: totals.messages || null,
      url: null,
      video_plays: null,
      avg_play_time_secs: null,
      caption_preview: null,
      post_type: (asset as { content_type?: string } | null)?.content_type ?? null,
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
