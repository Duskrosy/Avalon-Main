import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/permissions";
import { normalizeGroup, normalizeOrganicPlatform } from "@/app/(dashboard)/creatives/tracker/ledger-helpers";
import type {
  TrackerFeedResponse,
  OrganicPostRow,
  AdRow,
  ContentItemRow,
  ContentItemLink,
  TrackerGroup,
  OrganicPlatform,
} from "@/types/tracker-feed";

export const runtime = "nodejs";

// GET /api/creatives/tracker-feed?month=YYYY-MM&group=&platform=
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const monthRaw = searchParams.get("month");
  const groupFilter: TrackerGroup = searchParams.get("group") ? normalizeGroup(searchParams.get("group")) : null;
  const platformFilter: OrganicPlatform = searchParams.get("platform") ? normalizeOrganicPlatform(searchParams.get("platform")) : null;

  const now = new Date();
  let year: number;
  let monthIdx: number;
  if (monthRaw && /^\d{4}-\d{2}$/.test(monthRaw)) {
    const [y, m] = monthRaw.split("-").map((x) => parseInt(x, 10));
    year = y;
    monthIdx = m - 1;
  } else {
    year = now.getUTCFullYear();
    monthIdx = now.getUTCMonth();
  }
  const monthStart = new Date(Date.UTC(year, monthIdx, 1, 0, 0, 0));
  const monthEnd = new Date(Date.UTC(year, monthIdx + 1, 1, 0, 0, 0));
  const startISO = monthStart.toISOString();
  const endISO = monthEnd.toISOString();
  const startDate = startISO.slice(0, 10);
  const endDate = endISO.slice(0, 10);

  const admin = createAdminClient();

  const [organicRes, adStatsRes, itemsRes] = await Promise.all([
    admin
      .from("smm_top_posts")
      .select(`
        id, post_url, thumbnail_url, caption_preview, published_at, metric_date,
        impressions, reach, engagements, video_plays,
        smm_group_platforms!inner (
          platform,
          smm_groups ( name )
        )
      `)
      .gte("metric_date", startDate)
      .lt("metric_date", endDate),
    admin
      .from("meta_ad_stats")
      .select("ad_id, ad_name, campaign_name, metric_date, spend")
      .gte("metric_date", startDate)
      .lt("metric_date", endDate),
    admin
      .from("creative_content_items")
      .select(`
        id, title, planned_week_start, group_label,
        creative_angle, product_or_collection, promo_code,
        linked_post_id, linked_ad_asset_id, linked_external_url, linked_at
      `)
      .gte("planned_week_start", startDate)
      .lt("planned_week_start", endDate),
  ]);

  // ── Shape organic posts ────────────────────────────────────────────────────
  type OrganicIn = {
    id: string;
    post_url: string | null;
    thumbnail_url: string | null;
    caption_preview: string | null;
    published_at: string | null;
    metric_date: string | null;
    impressions: number | null;
    reach: number | null;
    engagements: number | null;
    video_plays: number | null;
    smm_group_platforms:
      | { platform?: string | null; smm_groups?: { name?: string | null } | { name?: string | null }[] | null }
      | { platform?: string | null; smm_groups?: { name?: string | null } | { name?: string | null }[] | null }[]
      | null;
  };
  const organicRaw = (organicRes.data ?? []) as unknown as OrganicIn[];
  const organicPosts: OrganicPostRow[] = organicRaw
    .map((r) => {
      const platRaw = r.smm_group_platforms;
      const plat = (Array.isArray(platRaw) ? platRaw[0] : platRaw) as
        | { platform?: string | null; smm_groups?: { name?: string | null } | { name?: string | null }[] | null }
        | null;
      const grpRaw = plat?.smm_groups;
      const grp = (Array.isArray(grpRaw) ? grpRaw[0] : grpRaw) as { name?: string | null } | null;
      const effective = r.published_at
        ? new Date(r.published_at).toISOString()
        : r.metric_date
          ? new Date(`${r.metric_date}T00:00:00Z`).toISOString()
          : null;
      if (!effective) return null;
      if (effective < startISO || effective >= endISO) return null;
      return {
        id: r.id,
        postUrl: r.post_url ?? null,
        thumbnailUrl: r.thumbnail_url ?? null,
        captionPreview: r.caption_preview ?? null,
        publishedAt: effective,
        platform: normalizeOrganicPlatform(plat?.platform ?? null),
        group: normalizeGroup(grp?.name ?? null),
        impressions: r.impressions ?? null,
        reach: r.reach ?? null,
        engagements: r.engagements ?? null,
        videoPlays: r.video_plays ?? null,
      } satisfies OrganicPostRow;
    })
    .filter((r): r is OrganicPostRow => r !== null);

  // ── Shape ads (aggregate by ad_id) ─────────────────────────────────────────
  type AdStatIn = { ad_id: string | null; ad_name: string | null; campaign_name: string | null; metric_date: string | null; spend: number | string | null };
  const adStatsRaw = (adStatsRes.data ?? []) as AdStatIn[];
  const adAgg = new Map<string, { adName: string | null; campaignName: string | null; firstDate: string; spend: number }>();
  for (const r of adStatsRaw) {
    if (!r.ad_id || !r.metric_date) continue;
    const spend = typeof r.spend === "number" ? r.spend : Number(r.spend ?? 0) || 0;
    const prev = adAgg.get(r.ad_id);
    if (!prev) {
      adAgg.set(r.ad_id, {
        adName: r.ad_name ?? null,
        campaignName: r.campaign_name ?? null,
        firstDate: r.metric_date,
        spend,
      });
    } else {
      if (!prev.adName && r.ad_name) prev.adName = r.ad_name;
      if (!prev.campaignName && r.campaign_name) prev.campaignName = r.campaign_name;
      if (r.metric_date < prev.firstDate) prev.firstDate = r.metric_date;
      prev.spend += spend;
    }
  }

  // Resolve asset titles + thumbnails for ad_ids via ad_deployments → ad_assets
  const adIds = Array.from(adAgg.keys());
  const assetByAdId = new Map<string, { title: string | null; thumbnailUrl: string | null; assetId: string | null }>();
  if (adIds.length > 0) {
    const { data: deployments } = await admin
      .from("ad_deployments")
      .select(`meta_ad_id, ad_asset_id, ad_assets ( title, thumbnail_url )`)
      .in("meta_ad_id", adIds);
    for (const d of deployments ?? []) {
      const meta_ad_id = (d as { meta_ad_id?: string | null }).meta_ad_id;
      if (!meta_ad_id) continue;
      const assetId = (d as { ad_asset_id?: string | null }).ad_asset_id ?? null;
      const raw = (d as { ad_assets?: unknown }).ad_assets;
      const asset = (Array.isArray(raw) ? raw[0] : raw) as { title?: string | null; thumbnail_url?: string | null } | null;
      assetByAdId.set(meta_ad_id, {
        title: asset?.title ?? null,
        thumbnailUrl: asset?.thumbnail_url ?? null,
        assetId,
      });
    }
  }

  const ads: AdRow[] = Array.from(adAgg.entries()).map(([adId, info]) => ({
    adId,
    adName: info.adName,
    campaignName: info.campaignName,
    assetTitle: assetByAdId.get(adId)?.title ?? null,
    thumbnailUrl: assetByAdId.get(adId)?.thumbnailUrl ?? null,
    firstDate: info.firstDate,
    spend: info.spend,
  }));

  // ── Shape content items + resolve link metadata ────────────────────────────
  type ItemIn = {
    id: string;
    title: string | null;
    planned_week_start: string | null;
    group_label: string | null;
    creative_angle: string | null;
    product_or_collection: string | null;
    promo_code: string | null;
    linked_post_id: string | null;
    linked_ad_asset_id: string | null;
    linked_external_url: string | null;
    linked_at: string | null;
  };
  const itemsRaw = (itemsRes.data ?? []) as ItemIn[];

  // Build lookup: post_url → organic stats (for linked_external_url match)
  const organicByUrl = new Map<string, OrganicPostRow>();
  for (const p of organicPosts) {
    if (p.postUrl) organicByUrl.set(p.postUrl, p);
  }

  // Build lookup: ad_asset_id → meta_ad_id (reverse of assetByAdId)
  const adIdByAssetId = new Map<string, string>();
  for (const [adId, info] of assetByAdId) {
    if (info.assetId) adIdByAssetId.set(info.assetId, adId);
  }

  // Also need: content items whose linked_post_id references smm_posts → need post_url via smm_posts
  const linkedPostIds = itemsRaw.map((r) => r.linked_post_id).filter((x): x is string => !!x);
  const postUrlByPostId = new Map<string, string>();
  if (linkedPostIds.length > 0) {
    const { data: postRows } = await admin.from("smm_posts").select("id, post_url").in("id", linkedPostIds);
    for (const p of postRows ?? []) {
      const pid = (p as { id?: string | null }).id;
      const url = (p as { post_url?: string | null }).post_url;
      if (pid && url) postUrlByPostId.set(pid, url);
    }
  }

  // Also need: content items with linked_ad_asset_id where the ad_asset is outside the month's adIds
  // → fetch those ad_asset rows + their deployments to get campaign info
  const externalAssetIds = itemsRaw
    .map((r) => r.linked_ad_asset_id)
    .filter((x): x is string => !!x && !adIdByAssetId.has(x));
  const extraAssetLink = new Map<string, { campaignName: string | null; adName: string | null; metricDate: string | null; thumbnailUrl: string | null; assetTitle: string | null }>();
  if (externalAssetIds.length > 0) {
    const { data: extraDeploys } = await admin
      .from("ad_deployments")
      .select(`
        ad_asset_id, meta_ad_id,
        ad_assets ( title, thumbnail_url )
      `)
      .in("ad_asset_id", externalAssetIds);
    const extraAdIds = (extraDeploys ?? []).map((d) => (d as { meta_ad_id?: string | null }).meta_ad_id).filter((x): x is string => !!x);
    const statsByAd = new Map<string, { campaignName: string | null; adName: string | null; metricDate: string | null }>();
    if (extraAdIds.length > 0) {
      const { data: extraStats } = await admin
        .from("meta_ad_stats")
        .select("ad_id, campaign_name, ad_name, metric_date")
        .in("ad_id", extraAdIds)
        .order("metric_date", { ascending: true });
      for (const s of extraStats ?? []) {
        const adId = (s as { ad_id?: string | null }).ad_id;
        if (!adId) continue;
        if (!statsByAd.has(adId)) {
          statsByAd.set(adId, {
            campaignName: (s as { campaign_name?: string | null }).campaign_name ?? null,
            adName: (s as { ad_name?: string | null }).ad_name ?? null,
            metricDate: (s as { metric_date?: string | null }).metric_date ?? null,
          });
        }
      }
    }
    for (const d of extraDeploys ?? []) {
      const assetId = (d as { ad_asset_id?: string | null }).ad_asset_id;
      const adId = (d as { meta_ad_id?: string | null }).meta_ad_id;
      if (!assetId) continue;
      const assetRaw = (d as { ad_assets?: unknown }).ad_assets;
      const asset = (Array.isArray(assetRaw) ? assetRaw[0] : assetRaw) as { title?: string | null; thumbnail_url?: string | null } | null;
      const stats = adId ? statsByAd.get(adId) : null;
      extraAssetLink.set(assetId, {
        campaignName: stats?.campaignName ?? null,
        adName: stats?.adName ?? null,
        metricDate: stats?.metricDate ?? null,
        thumbnailUrl: asset?.thumbnail_url ?? null,
        assetTitle: asset?.title ?? null,
      });
    }
  }

  const contentItems: ContentItemRow[] = itemsRaw.map((r) => {
    let link: ContentItemLink = { state: "unlinked" };

    // Priority: linked_ad_asset_id > linked_external_url meta_ad:// > linked_external_url URL > linked_post_id
    if (r.linked_ad_asset_id) {
      const adId = adIdByAssetId.get(r.linked_ad_asset_id);
      if (adId) {
        // Ad is in the month's aggregated set
        const agg = adAgg.get(adId)!;
        const assetInfo = assetByAdId.get(adId);
        link = {
          state: "ad",
          campaignName: agg.campaignName,
          adName: agg.adName,
          metricDate: agg.firstDate,
          thumbnailUrl: assetInfo?.thumbnailUrl ?? null,
          assetTitle: assetInfo?.title ?? null,
        };
      } else {
        const extra = extraAssetLink.get(r.linked_ad_asset_id);
        if (extra) {
          link = {
            state: "ad",
            campaignName: extra.campaignName,
            adName: extra.adName,
            metricDate: extra.metricDate,
            thumbnailUrl: extra.thumbnailUrl,
            assetTitle: extra.assetTitle,
          };
        } else {
          // Asset linked but no deployment/stats resolved — still an ad link
          link = {
            state: "ad",
            campaignName: null,
            adName: null,
            metricDate: null,
            thumbnailUrl: null,
            assetTitle: null,
          };
        }
      }
    } else if (r.linked_external_url) {
      const metaMatch = /^meta_ad:\/\/(.+)$/.exec(r.linked_external_url);
      if (metaMatch) {
        const adId = metaMatch[1];
        const agg = adAgg.get(adId);
        const assetInfo = assetByAdId.get(adId);
        link = {
          state: "ad",
          campaignName: agg?.campaignName ?? null,
          adName: agg?.adName ?? null,
          metricDate: agg?.firstDate ?? null,
          thumbnailUrl: assetInfo?.thumbnailUrl ?? null,
          assetTitle: assetInfo?.title ?? null,
        };
      } else {
        const org = organicByUrl.get(r.linked_external_url);
        link = {
          state: "organic",
          publishedAt: org?.publishedAt ?? null,
          postUrl: r.linked_external_url,
          thumbnailUrl: org?.thumbnailUrl ?? null,
          impressions: org?.impressions ?? null,
          reach: org?.reach ?? null,
          engagements: org?.engagements ?? null,
        };
      }
    } else if (r.linked_post_id) {
      const url = postUrlByPostId.get(r.linked_post_id);
      const org = url ? organicByUrl.get(url) : null;
      link = {
        state: "organic",
        publishedAt: org?.publishedAt ?? null,
        postUrl: url ?? null,
        thumbnailUrl: org?.thumbnailUrl ?? null,
        impressions: org?.impressions ?? null,
        reach: org?.reach ?? null,
        engagements: org?.engagements ?? null,
      };
    }

    return {
      id: r.id,
      title: r.title ?? "(untitled)",
      plannedWeekStart: r.planned_week_start,
      group: normalizeGroup(r.group_label),
      creativeAngle: r.creative_angle,
      productOrCollection: r.product_or_collection,
      promoCode: r.promo_code,
      link,
    } satisfies ContentItemRow;
  });

  // ── Apply filters ──────────────────────────────────────────────────────────
  let filteredOrganic = organicPosts;
  let filteredAds = ads;
  let filteredItems = contentItems;

  if (groupFilter) {
    filteredOrganic = filteredOrganic.filter((r) => r.group === groupFilter);
    filteredItems = filteredItems.filter((r) => r.group === groupFilter);
    // Ads have no group mapping currently; exclude when a specific group is selected.
    filteredAds = [];
  }
  if (platformFilter) {
    filteredOrganic = filteredOrganic.filter((r) => r.platform === platformFilter);
  }

  const response: TrackerFeedResponse = {
    organicPosts: filteredOrganic,
    ads: filteredAds,
    contentItems: filteredItems,
  };
  return NextResponse.json(response);
}
