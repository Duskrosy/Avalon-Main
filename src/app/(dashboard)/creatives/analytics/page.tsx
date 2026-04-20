import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { AnalyticsLiveRecentView, type LivePost, type LiveAd, type RecentPost } from "./analytics-tabs-view";

export default async function CreativesAnalyticsPage() {
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
  const todayISO = now.toISOString().slice(0, 10);
  const last24hTs = new Date(now.getTime() - 24 * 3600_000).toISOString();
  const next24hTs = new Date(now.getTime() + 24 * 3600_000).toISOString();
  const last7dTs = new Date(now.getTime() - 7 * 86400_000).toISOString();

  // ── Live tab: published last 24h OR scheduled next 24h ─────────────────────
  const publishedRecentlyPromise = admin
    .from("smm_posts")
    .select("id, post_type, status, scheduled_at, published_at, caption, platform, group_id")
    .eq("status", "published")
    .gte("published_at", last24hTs)
    .order("published_at", { ascending: false })
    .limit(30);

  const scheduledSoonPromise = admin
    .from("smm_posts")
    .select("id, post_type, status, scheduled_at, published_at, caption, platform, group_id")
    .in("status", ["scheduled", "draft"])
    .gte("scheduled_at", now.toISOString())
    .lte("scheduled_at", next24hTs)
    .order("scheduled_at", { ascending: true })
    .limit(30);

  // ── Live tab: ads currently spending today ─────────────────────────────────
  const demoTodayPromise = admin
    .from("meta_ad_demographics")
    .select("ad_id, ad_name, campaign_name, spend, impressions, conversions, messages")
    .eq("date", todayISO)
    .gt("spend", 0)
    .not("ad_id", "is", null);

  // ── Recent tab: posts published 2–7 days ago ───────────────────────────────
  const recentTopPromise = admin
    .from("smm_top_posts")
    .select(`
      id, post_external_id, post_url, thumbnail_url, caption_preview,
      post_type, published_at, impressions, reach, engagements, video_plays,
      smm_group_platforms!inner ( id, platform, page_name )
    `)
    .gte("published_at", last7dTs)
    .lt("published_at", last24hTs)
    .order("published_at", { ascending: false })
    .limit(50);

  const [
    { data: publishedRecent },
    { data: scheduledSoon },
    { data: demoToday },
    { data: recentTop },
  ] = await Promise.all([
    publishedRecentlyPromise,
    scheduledSoonPromise,
    demoTodayPromise,
    recentTopPromise,
  ]);

  // Aggregate today's ad spend by ad_id
  const adSpendMap = new Map<string, { ad_name: string | null; campaign_name: string | null; spend: number; impressions: number; conversions: number; messages: number }>();
  for (const r of demoToday ?? []) {
    if (!r.ad_id) continue;
    const acc = adSpendMap.get(r.ad_id) ?? {
      ad_name: r.ad_name ?? null,
      campaign_name: r.campaign_name ?? null,
      spend: 0,
      impressions: 0,
      conversions: 0,
      messages: 0,
    };
    acc.spend       += Number(r.spend) || 0;
    acc.impressions += Number(r.impressions) || 0;
    acc.conversions += Number(r.conversions) || 0;
    acc.messages    += Number(r.messages) || 0;
    acc.ad_name ??= r.ad_name ?? null;
    acc.campaign_name ??= r.campaign_name ?? null;
    adSpendMap.set(r.ad_id, acc);
  }
  const liveAds: LiveAd[] = Array.from(adSpendMap.entries())
    .map(([ad_id, v]) => ({ ad_id, ...v }))
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 20);

  const toLivePost = (p: {
    id: string;
    post_type: string | null;
    status: string | null;
    scheduled_at: string | null;
    published_at: string | null;
    caption: string | null;
    platform: string | null;
  }): LivePost => ({
    id: p.id,
    post_type: (p.post_type as LivePost["post_type"]) ?? "organic",
    status: p.status ?? "—",
    scheduled_at: p.scheduled_at,
    published_at: p.published_at,
    caption: p.caption,
    platform: p.platform ?? "—",
  });

  const recentPosts: RecentPost[] = (recentTop ?? []).map((p) => {
    const platRaw = (p as unknown as { smm_group_platforms: unknown }).smm_group_platforms;
    const plat = (Array.isArray(platRaw) ? platRaw[0] : platRaw) as { platform?: string } | null;
    return {
      id: p.id,
      thumbnail_url: p.thumbnail_url ?? null,
      caption_preview: p.caption_preview ?? null,
      post_url: p.post_url ?? null,
      post_type: p.post_type ?? null,
      published_at: p.published_at ?? null,
      impressions: p.impressions ?? null,
      reach: p.reach ?? null,
      engagements: p.engagements ?? null,
      video_plays: p.video_plays ?? null,
      platform: plat?.platform ?? "—",
    };
  });

  return (
    <div className="max-w-5xl mx-auto">
      <AnalyticsLiveRecentView
        livePublished={(publishedRecent ?? []).map(toLivePost)}
        liveScheduled={(scheduledSoon ?? []).map(toLivePost)}
        liveAds={liveAds}
        recentPosts={recentPosts}
      />
    </div>
  );
}
