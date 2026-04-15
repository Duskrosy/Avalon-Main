import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import Link from "next/link";

function fmtK(n: number | null) {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

const PLATFORM_META: Record<string, { label: string; bg: string; text: string; bar: string }> = {
  facebook:  { label: "Facebook",  bg: "bg-[var(--color-accent-light)]",   text: "text-[var(--color-accent)]",  bar: "bg-[var(--color-accent-light)]0"  },
  instagram: { label: "Instagram", bg: "bg-pink-50",   text: "text-pink-700",  bar: "bg-pink-500"  },
  tiktok:    { label: "TikTok",    bg: "bg-[var(--color-text-primary)]",  text: "text-white",     bar: "bg-gray-700"  },
  youtube:   { label: "YouTube",   bg: "bg-[var(--color-error-light)]",    text: "text-[var(--color-error)]",   bar: "bg-[var(--color-error-light)]0"   },
};

export default async function ExecutiveMarketingPage() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const sevenDaysAgo   = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const thirtyDaysAgo  = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const [
    { data: platforms },
    { data: analytics7d },
    { data: analytics30d },
    { data: latestPerPlatform },
    { data: topPosts },
  ] = await Promise.all([
    admin.from("smm_group_platforms")
      .select("id, platform, page_name, is_active"),

    admin.from("smm_analytics")
      .select("platform_id, metric_date, reach, engagements, follower_count, follower_growth, impressions, video_plays")
      .gte("metric_date", sevenDaysAgo)
      .order("metric_date", { ascending: true }),

    admin.from("smm_analytics")
      .select("platform_id, reach, engagements, follower_count")
      .gte("metric_date", thirtyDaysAgo),

    // Latest row per platform for current follower count
    admin.from("smm_analytics")
      .select("platform_id, follower_count, metric_date")
      .order("metric_date", { ascending: false })
      .limit(50),

    admin.from("smm_top_posts")
      .select("id, platform_id, post_url, thumbnail_url, caption_preview, post_type, published_at, reach, engagements")
      .order("reach", { ascending: false })
      .limit(4),
  ]);

  const platMap = Object.fromEntries((platforms ?? []).map((p) => [p.id, p]));

  // ── Current followers per platform (latest row) ───────────────────────────
  const latestFollowers: Record<string, { follower_count: number; metric_date: string }> = {};
  for (const row of latestPerPlatform ?? []) {
    if (row.follower_count != null && !latestFollowers[row.platform_id]) {
      latestFollowers[row.platform_id] = { follower_count: row.follower_count, metric_date: row.metric_date };
    }
  }

  // ── 7d aggregates per platform ────────────────────────────────────────────
  const weekly: Record<string, {
    reach: number; engagements: number; growth: number; impressions: number; video_plays: number; days: Set<string>;
  }> = {};
  for (const row of analytics7d ?? []) {
    if (!weekly[row.platform_id]) {
      weekly[row.platform_id] = { reach: 0, engagements: 0, growth: 0, impressions: 0, video_plays: 0, days: new Set() };
    }
    weekly[row.platform_id].reach       += row.reach ?? 0;
    weekly[row.platform_id].engagements += row.engagements ?? 0;
    weekly[row.platform_id].growth      += row.follower_growth ?? 0;
    weekly[row.platform_id].impressions += row.impressions ?? 0;
    weekly[row.platform_id].video_plays += row.video_plays ?? 0;
    weekly[row.platform_id].days.add(row.metric_date);
  }

  // ── 30d aggregates ────────────────────────────────────────────────────────
  const monthly: Record<string, { reach: number; engagements: number }> = {};
  for (const row of analytics30d ?? []) {
    if (!monthly[row.platform_id]) monthly[row.platform_id] = { reach: 0, engagements: 0 };
    monthly[row.platform_id].reach       += row.reach ?? 0;
    monthly[row.platform_id].engagements += row.engagements ?? 0;
  }

  // ── Daily reach sparkline (7d across all platforms) ───────────────────────
  const dailyReach: Record<string, number> = {};
  for (const row of analytics7d ?? []) {
    dailyReach[row.metric_date] = (dailyReach[row.metric_date] ?? 0) + (row.reach ?? 0);
  }
  const sparklineDays: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    sparklineDays.push(d.toISOString().slice(0, 10));
  }
  const maxDayReach = Math.max(1, ...sparklineDays.map((d) => dailyReach[d] ?? 0));

  // Build platform cards (only platforms with any data)
  const activePlatformIds = Object.keys({ ...weekly, ...latestFollowers });
  const totalFollowers = Object.values(latestFollowers).reduce((s, v) => s + v.follower_count, 0);
  const totalReach7d   = Object.values(weekly).reduce((s, v) => s + v.reach, 0);

  return (
    <div className="space-y-6">

      <Link href="/executive/ad-ops" className="block bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] px-5 py-3 hover:shadow-[var(--shadow-md)] transition-shadow">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-[var(--color-text-primary)]">Ads KPI Dashboard</p>
            <p className="text-xs text-[var(--color-text-tertiary)]">View the 4-tier KPI framework</p>
          </div>
          <span className="text-xs text-[var(--color-text-tertiary)]">View →</span>
        </div>
      </Link>

      {/* ── Summary ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total followers", value: fmtK(totalFollowers), sub: "across all platforms" },
          { label: "Total reach · 7d", value: fmtK(totalReach7d), sub: "unique accounts reached" },
          { label: "Active platforms", value: activePlatformIds.length, sub: "with synced data" },
          {
            label: "Follower growth · 7d",
            value: Object.values(weekly).reduce((s, v) => s + v.growth, 0),
            sub: "net new followers",
            accent: Object.values(weekly).reduce((s, v) => s + v.growth, 0) >= 0 ? "text-[var(--color-success)]" : "text-[var(--color-error)]",
          },
        ].map((card) => (
          <div key={card.label} className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-5">
            <p className="text-xs text-[var(--color-text-secondary)] font-medium uppercase tracking-wide mb-1">{card.label}</p>
            <p className={`text-3xl font-bold tracking-tight ${card.accent ?? "text-[var(--color-text-primary)]"}`}>{card.value}</p>
            <p className="text-xs text-[var(--color-text-tertiary)] mt-1.5">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Reach sparkline ────────────────────────────────────────────── */}
      <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-5">
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)] mb-4">Daily reach · all platforms · last 7 days</h2>
        <div className="flex items-end gap-2 h-28">
          {sparklineDays.map((date) => {
            const val = dailyReach[date] ?? 0;
            const pct = (val / maxDayReach) * 100;
            const today = new Date().toISOString().slice(0, 10);
            return (
              <div key={date} className="flex-1 flex flex-col items-center gap-1.5">
                <span className="text-[10px] font-bold text-[var(--color-text-secondary)]">{val > 0 ? fmtK(val) : ""}</span>
                <div className="w-full flex items-end h-16">
                  <div
                    className={`w-full rounded-t-md ${val === 0 ? "bg-[var(--color-bg-tertiary)]" : "bg-[var(--color-accent-light)]0"} ${date === today ? "ring-2 ring-gray-900 ring-offset-1" : ""}`}
                    style={{ height: `${Math.max(4, pct)}%` }}
                  />
                </div>
                <span className={`text-[10px] ${date === today ? "text-[var(--color-text-primary)] font-semibold" : "text-[var(--color-text-tertiary)]"}`}>
                  {format(new Date(date + "T00:00:00"), "EEE")}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Platform cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {activePlatformIds.map((platId) => {
          const plat = platMap[platId];
          if (!plat) return null;
          const meta = PLATFORM_META[plat.platform] ?? { label: plat.platform, bg: "bg-[var(--color-bg-secondary)]", text: "text-[var(--color-text-primary)]", bar: "bg-gray-400" };
          const followers = latestFollowers[platId]?.follower_count ?? null;
          const w = weekly[platId];
          const m = monthly[platId];
          const engRate = w && w.reach > 0 ? ((w.engagements / w.reach) * 100).toFixed(2) : "—";
          const reachPct = totalReach7d > 0 && w ? ((w.reach / totalReach7d) * 100) : 0;

          return (
            <div key={platId} className={`rounded-[var(--radius-lg)] border border-[var(--color-border-primary)] overflow-hidden`}>
              {/* Platform header */}
              <div className={`px-4 py-3 ${meta.bg}`}>
                <div className="flex items-center justify-between">
                  <span className={`text-sm font-semibold ${meta.text}`}>{meta.label}</span>
                  {plat.page_name && (
                    <span className={`text-xs opacity-60 ${meta.text}`}>{plat.page_name}</span>
                  )}
                </div>
                <p className={`text-2xl font-bold ${meta.text} mt-1`}>{fmtK(followers)}</p>
                <p className={`text-xs opacity-60 ${meta.text}`}>followers</p>
              </div>

              {/* Stats */}
              <div className="p-4 space-y-3">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-[var(--color-text-tertiary)]">Reach 7d</p>
                    <p className="font-semibold text-[var(--color-text-primary)]">{fmtK(w?.reach ?? null)}</p>
                  </div>
                  <div>
                    <p className="text-[var(--color-text-tertiary)]">Eng. rate</p>
                    <p className="font-semibold text-[var(--color-text-primary)]">{engRate}{engRate !== "—" ? "%" : ""}</p>
                  </div>
                  <div>
                    <p className="text-[var(--color-text-tertiary)]">Growth 7d</p>
                    <p className={`font-semibold ${(w?.growth ?? 0) >= 0 ? "text-[var(--color-success)]" : "text-[var(--color-error)]"}`}>
                      {w ? (w.growth >= 0 ? "+" : "") + w.growth : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[var(--color-text-tertiary)]">Reach 30d</p>
                    <p className="font-semibold text-[var(--color-text-primary)]">{fmtK(m?.reach ?? null)}</p>
                  </div>
                </div>
                {/* Share of total reach bar */}
                <div>
                  <div className="flex items-center justify-between text-[10px] text-[var(--color-text-tertiary)] mb-1">
                    <span>Share of total reach</span>
                    <span>{reachPct.toFixed(0)}%</span>
                  </div>
                  <div className="h-1 bg-[var(--color-bg-tertiary)] rounded-full overflow-hidden">
                    <div className={`h-full ${meta.bar} rounded-full`} style={{ width: `${reachPct}%` }} />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Top performing posts ────────────────────────────────────────── */}
      {(topPosts ?? []).length > 0 && (
        <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--color-border-secondary)]">
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Top posts by reach</h2>
          </div>
          <div className="divide-y divide-[var(--color-border-secondary)]">
            {(topPosts ?? []).map((post) => {
              const plat = platMap[post.platform_id];
              const meta = PLATFORM_META[plat?.platform ?? ""] ?? { label: "?", bg: "bg-[var(--color-bg-secondary)]", text: "text-[var(--color-text-secondary)]", bar: "" };
              return (
                <div key={post.id} className="px-5 py-3 flex items-center gap-4">
                  {post.thumbnail_url ? (
                    <img src={post.thumbnail_url} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0 bg-[var(--color-bg-tertiary)]" />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-[var(--color-bg-tertiary)] flex items-center justify-center text-[var(--color-text-tertiary)] text-xl shrink-0">📷</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[var(--color-text-primary)] truncate">{post.caption_preview ?? "(no caption)"}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${meta.bg} ${meta.text}`}>
                        {meta.label}
                      </span>
                      {post.published_at && (
                        <span className="text-[10px] text-[var(--color-text-tertiary)]">{format(new Date(post.published_at), "d MMM yyyy")}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-[var(--color-text-primary)]">{fmtK(post.reach)}</p>
                    <p className="text-xs text-[var(--color-text-tertiary)]">reach</p>
                  </div>
                  {post.post_url && (
                    <a href={post.post_url} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] shrink-0">→</a>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
