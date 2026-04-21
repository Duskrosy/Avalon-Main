import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isManagerOrAbove } from "@/lib/permissions";
import { redirect } from "next/navigation";
import TrackerView from "./tracker-view";

export default async function CreativesTrackerPage() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) redirect("/login");

  const admin = createAdminClient();

  const [{ data: items }, { data: profiles }, { data: posts }, { data: platforms }, { data: ads }] =
    await Promise.all([
      // All content items
      admin
        .from("creative_content_items")
        .select(
          `*,
          assigned_profile:profiles!assigned_to(id, first_name, last_name),
          creator_profile:profiles!created_by(id, first_name, last_name),
          assignees:content_item_assignees(
            user_id,
            profile:profiles!user_id(id, first_name, last_name, avatar_url)
          )`
        )
        .order("created_at", { ascending: false }),
      // Profiles for assignment dropdown
      admin
        .from("profiles")
        .select("id, first_name, last_name, department_id, avatar_url")
        .eq("status", "active")
        .is("deleted_at", null)
        .order("first_name"),
      // Published smm_posts for linking
      admin
        .from("smm_posts")
        .select(
          "id, platform, caption, status, published_at, scheduled_at, created_by"
        )
        .eq("status", "published")
        // 14-day window for tracker "Gather post" modal — recent posts only
        .gte(
          "published_at",
          new Date(Date.now() - 14 * 86400_000).toISOString()
        )
        .order("published_at", { ascending: false })
        .limit(200),
      // 4. Platform connections (for sync display)
      admin
        .from("smm_group_platforms")
        .select("id, group_id, platform, page_name, is_active, token_expires_at")
        .eq("is_active", true),
      // Recently-live Meta ads for the unified Gather picker (organic + ads).
      // We link via ad_assets.id since creative_content_items.linked_ad_asset_id
      // is a FK to ad_assets, not ad_deployments.
      admin
        .from("ad_deployments")
        .select(
          `id, status, launched_at, meta_ad_id, campaign_name,
           asset:ad_assets!asset_id(id, title, thumbnail_url, content_type, creator_id)`
        )
        .gte(
          "launched_at",
          new Date(Date.now() - 14 * 86400_000).toISOString()
        )
        .in("status", ["active", "paused", "completed"])
        .order("launched_at", { ascending: false, nullsFirst: false })
        .limit(100),
    ]);

  // Supabase returns embedded asset as an array — normalize to a single object
  // so the client-side LiveAd type stays flat.
  const adsNormalized = (ads ?? []).map((a: any) => ({
    id: a.id,
    status: a.status,
    launched_at: a.launched_at,
    meta_ad_id: a.meta_ad_id,
    campaign_name: a.campaign_name,
    asset: Array.isArray(a.asset) ? (a.asset[0] ?? null) : (a.asset ?? null),
  }));

  return (
    <TrackerView
      items={items ?? []}
      profiles={profiles ?? []}
      posts={posts ?? []}
      ads={adsNormalized}
      platforms={platforms ?? []}
      currentUserId={user.id}
      isManager={isManagerOrAbove(user)}
      currentDeptId={user.department_id ?? null}
    />
  );
}
