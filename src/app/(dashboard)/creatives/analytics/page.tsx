import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { AnalyticsRecentView, type RecentPost } from "./analytics-tabs-view";

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
  const last24hTs = new Date(now.getTime() - 24 * 3600_000).toISOString();
  const last7dTs = new Date(now.getTime() - 7 * 86400_000).toISOString();

  // ── Recent: posts published 2–7 days ago ───────────────────────────────────
  const { data: recentTop } = await admin
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
      <AnalyticsRecentView recentPosts={recentPosts} />
    </div>
  );
}
