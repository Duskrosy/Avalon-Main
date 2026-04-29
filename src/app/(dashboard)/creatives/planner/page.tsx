import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isManagerOrAbove } from "@/lib/permissions";
import { redirect } from "next/navigation";
import PlannerView from "./planner-view";

export default async function CreativesPlannerPage() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) redirect("/login");

  const admin = createAdminClient();

  // Posted-content parity: Gather picker fetches from smm_top_posts
  // (organic snapshot) + meta_ad_stats (aggregated) + ad_deployments join
  // (to resolve ad_asset for thumbnail + linked_ad_asset_id). smm_posts is
  // unused because writes only land in smm_top_posts.
  const fromISO = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);

  // Resolve the creatives department once so we can scope the assignee dropdown
  // to creative-team members only (Phase 3 ticket).
  const { data: creativesDept } = await admin
    .from("departments")
    .select("id")
    .eq("slug", "creatives")
    .single();
  const creativesDeptId = creativesDept?.id ?? null;

  const [
    { data: items },
    { data: profiles },
    { data: platforms },
    { data: topPosts },
    { data: statsRows },
  ] = await Promise.all([
    admin
      .from("creative_content_items")
      .select(
        `*,
        assigned_profile:profiles!assigned_to(id, first_name, last_name),
        creator_profile:profiles!created_by(id, first_name, last_name),
        assignees:content_item_assignees(
          user_id,
          profile:profiles!user_id(id, first_name, last_name, avatar_url)
        ),
        source_request:ad_requests!source_request_id(
          id, inspo_link,
          attachments:ad_request_attachments(id)
        )`
      )
      .order("created_at", { ascending: false }),
    creativesDeptId
      ? admin
          .from("profiles")
          .select("id, first_name, last_name, department_id, avatar_url")
          .eq("status", "active")
          .eq("department_id", creativesDeptId)
          .is("deleted_at", null)
          .order("first_name")
      : Promise.resolve({ data: [] }),
    admin
      .from("smm_group_platforms")
      .select("id, group_id, platform, page_name, is_active, token_expires_at")
      .eq("is_active", true),
    // Organic: curated snapshot table — 30-day metric_date window
    admin
      .from("smm_top_posts")
      .select(
        `id, post_external_id, post_url, thumbnail_url, caption_preview,
         post_type, published_at, metric_date,
         smm_group_platforms!inner (platform, page_name)`
      )
      .gte("metric_date", fromISO)
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(150),
    // Ads: meta_ad_stats aggregated by ad_id for the unified picker
    admin
      .from("meta_ad_stats")
      .select("ad_id, ad_name, adset_name, campaign_name, metric_date")
      .gte("metric_date", fromISO),
  ]);

  // Normalize organic posts for the Gather picker
  const organicPosts = (topPosts ?? []).map((p: any) => {
    const plat = Array.isArray(p.smm_group_platforms) ? p.smm_group_platforms[0] : p.smm_group_platforms;
    return {
      id: p.id,
      platform: plat?.platform ?? "—",
      caption: p.caption_preview ?? null,
      thumbnail_url: p.thumbnail_url ?? null,
      post_url: p.post_url ?? null,
      published_at: p.published_at ?? null,
      post_type: p.post_type ?? null,
    };
  });

  // Aggregate ad stats, then resolve ad_assets for thumbnail + assetId
  const adFirstDate = new Map<string, { ad_name: string | null; adset_name: string | null; campaign_name: string | null; first_date: string | null }>();
  for (const r of statsRows ?? []) {
    if (!r.ad_id) continue;
    const acc = adFirstDate.get(r.ad_id) ?? { ad_name: r.ad_name ?? null, adset_name: r.adset_name ?? null, campaign_name: r.campaign_name ?? null, first_date: null };
    acc.ad_name = acc.ad_name ?? r.ad_name ?? null;
    acc.adset_name = acc.adset_name ?? r.adset_name ?? null;
    acc.campaign_name = acc.campaign_name ?? r.campaign_name ?? null;
    if (!acc.first_date || (r.metric_date && r.metric_date < acc.first_date)) acc.first_date = r.metric_date;
    adFirstDate.set(r.ad_id, acc);
  }
  const adIds = Array.from(adFirstDate.keys());
  const { data: deployments } = adIds.length
    ? await admin
        .from("ad_deployments")
        .select(`meta_ad_id, asset:ad_assets!asset_id(id, title, thumbnail_url, content_type)`)
        .in("meta_ad_id", adIds)
    : { data: [] as any[] };
  const assetByAdId = new Map<string, { id: string; title: string | null; thumbnail_url: string | null; content_type: string | null }>();
  for (const d of deployments ?? []) {
    if (!d.meta_ad_id) continue;
    const asset = Array.isArray(d.asset) ? d.asset[0] : d.asset;
    if (asset?.id) assetByAdId.set(d.meta_ad_id, asset);
  }
  // Posted-content parity: show all ads in the window. If we resolved an
  // ad_asset we link via linked_ad_asset_id; otherwise fall back to
  // linked_external_url = "meta_ad://<meta_ad_id>" so attribution still works.
  const ads = Array.from(adFirstDate.entries()).map(([ad_id, v]) => {
    const asset = assetByAdId.get(ad_id);
    return {
      id: ad_id,
      asset_id: asset?.id ?? null,
      title: asset?.title ?? v.ad_name ?? v.campaign_name ?? "(untitled ad)",
      ad_name: v.ad_name ?? null,
      adset_name: v.adset_name ?? null,
      campaign_name: v.campaign_name ?? null,
      thumbnail_url: asset?.thumbnail_url ?? null,
      launched_at: v.first_date ? new Date(`${v.first_date}T00:00:00Z`).toISOString() : null,
    };
  });

  return (
    <PlannerView
      items={items ?? []}
      profiles={profiles ?? []}
      posts={organicPosts}
      ads={ads}
      platforms={platforms ?? []}
      currentUserId={user.id}
      isManager={isManagerOrAbove(user)}
      currentDeptId={user.department_id ?? null}
      isCreatives={creativesDeptId !== null && user.department_id === creativesDeptId}
    />
  );
}
