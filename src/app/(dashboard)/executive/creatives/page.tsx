import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { format, parseISO } from "date-fns";

function fmtK(n: number | null) {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

const PLATFORM_COLORS: Record<string, string> = {
  facebook:  "bg-blue-100 text-blue-800",
  instagram: "bg-pink-100 text-pink-800",
  tiktok:    "bg-gray-900 text-white",
  youtube:   "bg-red-100 text-red-800",
};

export default async function ExecutiveCreativesPage() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const thisMonthStart = `${new Date().toISOString().slice(0, 7)}-01`;
  const sevenDaysAgo   = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  const [
    { data: posts },
    { data: topPosts },
    { data: platforms },
    { data: smmAnalytics },
  ] = await Promise.all([
    // All SMM posts (planned content pipeline)
    admin.from("smm_posts")
      .select("id, platform, status, scheduled_at, created_at, group_id")
      .order("created_at", { ascending: false }),

    // Top posts by engagement
    admin.from("smm_top_posts")
      .select("id, platform_id, post_url, thumbnail_url, caption_preview, post_type, published_at, impressions, reach, engagements, video_plays")
      .order("engagements", { ascending: false, nullsFirst: false })
      .limit(6),

    // Platform definitions
    admin.from("smm_group_platforms")
      .select("id, platform, page_name, is_active"),

    // 7d analytics per platform
    admin.from("smm_analytics")
      .select("platform_id, metric_date, reach, engagements, follower_count, follower_growth, impressions")
      .gte("metric_date", sevenDaysAgo)
      .order("metric_date", { ascending: false }),
  ]);

  const platformMap = Object.fromEntries((platforms ?? []).map((p) => [p.id, p]));

  // ── Post pipeline counts ──────────────────────────────────────────────────
  const statusCounts: Record<string, number> = { idea: 0, draft: 0, scheduled: 0, published: 0, backlog: 0 };
  for (const p of posts ?? []) {
    statusCounts[p.status] = (statusCounts[p.status] ?? 0) + 1;
  }
  const totalPosts = Object.values(statusCounts).reduce((s, v) => s + v, 0);

  // Posts by platform
  const platformPostCounts: Record<string, number> = {};
  for (const p of posts ?? []) {
    platformPostCounts[p.platform] = (platformPostCounts[p.platform] ?? 0) + 1;
  }

  // Scheduled upcoming posts
  const now = new Date().toISOString();
  const upcoming = (posts ?? [])
    .filter((p) => p.status === "scheduled" && p.scheduled_at && p.scheduled_at > now)
    .sort((a, b) => (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? ""))
    .slice(0, 5);

  // ── SMM analytics aggregation ─────────────────────────────────────────────
  const platformAnalytics: Record<string, { reach: number; engagements: number; follower_count: number | null; growth: number }> = {};
  for (const row of smmAnalytics ?? []) {
    if (!platformAnalytics[row.platform_id]) {
      platformAnalytics[row.platform_id] = { reach: 0, engagements: 0, follower_count: null, growth: 0 };
    }
    platformAnalytics[row.platform_id].reach       += row.reach ?? 0;
    platformAnalytics[row.platform_id].engagements += row.engagements ?? 0;
    platformAnalytics[row.platform_id].growth      += row.follower_growth ?? 0;
    if (platformAnalytics[row.platform_id].follower_count == null && row.follower_count != null) {
      platformAnalytics[row.platform_id].follower_count = row.follower_count;
    }
  }

  const PIPELINE_STAGES = [
    { key: "idea",      label: "Ideas",     color: "bg-gray-200" },
    { key: "draft",     label: "Drafts",    color: "bg-amber-400" },
    { key: "scheduled", label: "Scheduled", color: "bg-blue-400" },
    { key: "published", label: "Published", color: "bg-green-500" },
    { key: "backlog",   label: "Backlog",   color: "bg-purple-400" },
  ];

  return (
    <div className="space-y-6">

      {/* ── Content pipeline ───────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-900">Content pipeline · all time</h2>
          <span className="text-xs text-gray-400">{totalPosts} total posts</span>
        </div>
        <div className="grid grid-cols-5 gap-3">
          {PIPELINE_STAGES.map((stage) => {
            const count = statusCounts[stage.key] ?? 0;
            const pct = totalPosts > 0 ? Math.round((count / totalPosts) * 100) : 0;
            return (
              <div key={stage.key} className="text-center">
                <div className="h-24 flex items-end justify-center mb-2">
                  <div
                    className={`w-full rounded-t-md ${stage.color} transition-all`}
                    style={{ height: `${Math.max(8, pct)}%` }}
                  />
                </div>
                <p className="text-xl font-bold text-gray-900">{count}</p>
                <p className="text-xs text-gray-500 mt-0.5">{stage.label}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Platform breakdown + upcoming ──────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Platform distribution */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Posts by platform</h2>
          <div className="space-y-3">
            {Object.entries(platformPostCounts)
              .sort(([, a], [, b]) => b - a)
              .map(([platform, count]) => {
                const pct = (count / Math.max(1, totalPosts)) * 100;
                const colorClass = PLATFORM_COLORS[platform] ?? "bg-gray-100 text-gray-600";
                const barColor =
                  platform === "facebook"  ? "bg-blue-400" :
                  platform === "instagram" ? "bg-pink-400" :
                  platform === "tiktok"    ? "bg-gray-700" :
                  platform === "youtube"   ? "bg-red-400" :
                  "bg-gray-400";
                return (
                  <div key={platform} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colorClass}`}>
                        {platform.charAt(0).toUpperCase() + platform.slice(1)}
                      </span>
                      <span className="text-sm font-semibold text-gray-700">{count}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full ${barColor} rounded-full`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* Upcoming scheduled */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Upcoming scheduled posts</h2>
            <p className="text-xs text-gray-400 mt-0.5">{statusCounts.scheduled ?? 0} total scheduled</p>
          </div>
          {upcoming.length === 0 ? (
            <p className="px-5 py-8 text-sm text-gray-400 text-center">No upcoming scheduled posts.</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {upcoming.map((p) => (
                <div key={p.id} className="px-5 py-3 flex items-center gap-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PLATFORM_COLORS[p.platform] ?? "bg-gray-100 text-gray-600"}`}>
                    {p.platform.charAt(0).toUpperCase() + p.platform.slice(1)}
                  </span>
                  <span className="text-xs text-gray-500 flex-1">
                    {p.scheduled_at ? format(new Date(p.scheduled_at), "d MMM · HH:mm") : "—"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Platform analytics (7d) ─────────────────────────────────────── */}
      {Object.keys(platformAnalytics).length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Platform analytics · last 7 days</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-gray-100">
            {Object.entries(platformAnalytics).map(([platformId, stats]) => {
              const plat = platformMap[platformId];
              if (!plat) return null;
              const colorClass = PLATFORM_COLORS[plat.platform] ?? "bg-gray-100 text-gray-600";
              const engRate = stats.reach > 0 ? ((stats.engagements / stats.reach) * 100).toFixed(1) : "—";
              return (
                <div key={platformId} className="p-5">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colorClass} mb-3 inline-block`}>
                    {plat.platform.charAt(0).toUpperCase() + plat.platform.slice(1)}
                  </span>
                  <p className="text-xs text-gray-400 mt-2 mb-0.5">Reach</p>
                  <p className="text-2xl font-bold text-gray-900">{fmtK(stats.reach)}</p>
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <div>
                      <p className="text-xs text-gray-400">Engagements</p>
                      <p className="text-sm font-semibold text-gray-700">{fmtK(stats.engagements)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Eng. rate</p>
                      <p className="text-sm font-semibold text-gray-700">{engRate}{engRate !== "—" ? "%" : ""}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Followers</p>
                      <p className="text-sm font-semibold text-gray-700">{fmtK(stats.follower_count)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Growth</p>
                      <p className={`text-sm font-semibold ${stats.growth >= 0 ? "text-green-600" : "text-red-500"}`}>
                        {stats.growth >= 0 ? "+" : ""}{stats.growth}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Top posts ───────────────────────────────────────────────────── */}
      {(topPosts ?? []).length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Top posts by engagement</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {(topPosts ?? []).map((post) => {
              const plat = platformMap[post.platform_id];
              const colorClass = PLATFORM_COLORS[plat?.platform ?? ""] ?? "bg-gray-100 text-gray-600";
              return (
                <div key={post.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <div className="aspect-video bg-gray-100 relative">
                    {post.thumbnail_url ? (
                      <img src={post.thumbnail_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300 text-2xl">📷</div>
                    )}
                    <span className={`absolute top-1 right-1 text-[9px] px-1 py-0.5 rounded-full font-medium ${colorClass}`}>
                      {plat?.platform?.slice(0, 2).toUpperCase() ?? "—"}
                    </span>
                  </div>
                  <div className="p-2">
                    {post.caption_preview && (
                      <p className="text-[10px] text-gray-600 line-clamp-2 mb-1.5">{post.caption_preview}</p>
                    )}
                    <div className="flex items-center gap-2 text-[10px] text-gray-500">
                      <span>❤️ {fmtK(post.engagements)}</span>
                      <span>👁 {fmtK(post.reach)}</span>
                    </div>
                    {post.published_at && (
                      <p className="text-[9px] text-gray-400 mt-1">{format(parseISO(post.published_at), "d MMM")}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
