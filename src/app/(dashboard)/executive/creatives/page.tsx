import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { format, parseISO } from "date-fns";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtK(n: number | null) {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function rag(value: number, green: number, amber: number, direction: string) {
  if (direction === "higher_better") {
    if (value >= green) return "green";
    if (value >= amber) return "amber";
    return "red";
  } else {
    if (value <= green) return "green";
    if (value <= amber) return "amber";
    return "red";
  }
}

function fmtKpi(value: number, unit: string): string {
  switch (unit) {
    case "percent":      return `${value.toFixed(1)}%`;
    case "currency_php": return `₱${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    case "seconds":      return `${value.toFixed(1)}s`;
    default:             return value.toLocaleString();
  }
}

const RAG_COLORS = {
  green: { dot: "bg-[var(--color-success-light)]0", bg: "bg-[var(--color-success-light)]", text: "text-[var(--color-success)]", border: "border-green-200" },
  amber: { dot: "bg-amber-400", bg: "bg-[var(--color-warning-light)]", text: "text-[var(--color-warning-text)]", border: "border-[var(--color-border-primary)]" },
  red:   { dot: "bg-[var(--color-error-light)]0",   bg: "bg-[var(--color-error-light)]",   text: "text-[var(--color-error)]",   border: "border-red-200" },
  none:  { dot: "bg-[var(--color-border-primary)]",  bg: "bg-[var(--color-bg-secondary)]",  text: "text-[var(--color-text-tertiary)]",  border: "border-[var(--color-border-primary)]" },
};

const PLATFORM_COLORS: Record<string, string> = {
  facebook:  "bg-[var(--color-accent-light)] text-[var(--color-accent)]",
  instagram: "bg-pink-100 text-pink-800",
  tiktok:    "bg-[var(--color-text-primary)] text-white",
  youtube:   "bg-[var(--color-error-light)] text-red-800",
};

// ─── KPI section component ────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function KpiSection({ title, subtitle, defs, latestMap }: { title: string; subtitle?: string; defs: any[]; latestMap: Record<string, number> }) {
  if (!defs.length) return null;
  return (
    <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-5">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</h2>
        {subtitle && <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">{subtitle}</p>}
      </div>
      <div className={`grid gap-3 ${defs.length <= 3 ? "grid-cols-3" : defs.length <= 5 ? "grid-cols-5" : "grid-cols-3 sm:grid-cols-6"}`}>
        {defs.map((d: { id: string; name: string; unit: string; threshold_green: number; threshold_amber: number; direction: string; hint?: string }) => {
          const val = latestMap[d.id];
          const r = val !== undefined ? rag(val, d.threshold_green, d.threshold_amber, d.direction) : "none";
          const colors = RAG_COLORS[r as keyof typeof RAG_COLORS];
          return (
            <div key={d.id} className={`rounded-lg border p-3 ${colors.border} ${colors.bg}`}>
              <div className="flex items-center gap-1.5 mb-1">
                <div className={`w-2 h-2 rounded-full ${colors.dot}`} />
                <span className="text-xs text-[var(--color-text-secondary)] truncate">{d.name}</span>
              </div>
              <p className={`text-lg font-bold ${val !== undefined ? colors.text : "text-[var(--color-text-tertiary)]"}`}>
                {val !== undefined ? fmtKpi(val, d.unit) : "—"}
              </p>
              <p className="text-[10px] text-[var(--color-text-tertiary)] mt-1 truncate">{d.hint?.split(".")[0] ?? ""}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default async function ExecutiveCreativesPage() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const thisMonthStart = `${new Date().toISOString().slice(0, 7)}-01`;
  const sevenDaysAgo   = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  // Fetch department IDs first (needed for KPI queries)
  const [{ data: creativeDept }, { data: marketingDept }] = await Promise.all([
    admin.from("departments").select("id").eq("slug", "creatives").single(),
    admin.from("departments").select("id").eq("slug", "marketing").single(),
  ]);
  const creativesDeptId = creativeDept?.id ?? "";
  const marketingDeptId = marketingDept?.id ?? "";

  const [
    { data: posts },
    { data: topPosts },
    { data: platforms },
    { data: smmAnalytics },
    { data: creativesKpiDefs },
    { data: mktAdContentDefs },
    { data: kpiEntries },
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

    // Creatives dept KPI definitions (Output, Stills Output, Stills Performance, Organic Performance)
    admin.from("kpi_definitions")
      .select("id, name, category, unit, direction, threshold_green, threshold_amber, hint, sort_order")
      .eq("is_active", true)
      .eq("department_id", creativesDeptId)
      .order("sort_order"),

    // Marketing dept Ad Content Performance KPIs (shared — lives in marketing per migration 00034)
    admin.from("kpi_definitions")
      .select("id, name, category, unit, direction, threshold_green, threshold_amber, hint, sort_order")
      .eq("is_active", true)
      .eq("category", "Ad Content Performance")
      .eq("department_id", marketingDeptId)
      .order("sort_order"),

    // Latest KPI entries (profile_id IS NULL = team-level)
    admin.from("kpi_entries")
      .select("kpi_definition_id, value_numeric, period_date")
      .is("profile_id", null)
      .order("period_date", { ascending: false })
      .limit(500),
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

  // ── KPI data processing ──────────────────────────────────────────────────
  const latestMap: Record<string, number> = {};
  for (const e of kpiEntries ?? []) {
    if (!(e.kpi_definition_id in latestMap)) {
      latestMap[e.kpi_definition_id] = e.value_numeric;
    }
  }

  // All creatives definitions + ad content performance from marketing
  const allDefs = [...(creativesKpiDefs ?? []), ...(mktAdContentDefs ?? [])];

  // Group creatives definitions by category
  const defsByCategory: Record<string, typeof allDefs> = {};
  for (const d of creativesKpiDefs ?? []) {
    if (!defsByCategory[d.category]) defsByCategory[d.category] = [];
    defsByCategory[d.category].push(d);
  }
  const adContentDefs   = mktAdContentDefs ?? [];
  const outputDefs      = defsByCategory["Output"] ?? [];
  const stillsOutDefs   = defsByCategory["Stills Output"] ?? [];
  const stillsPerfDefs  = defsByCategory["Stills Performance"] ?? [];
  const organicDefs     = defsByCategory["Organic Performance"] ?? [];

  // Overall KPI health counts
  let kpiGreen = 0, kpiAmber = 0, kpiRed = 0, kpiNoData = 0;
  for (const d of allDefs) {
    const val = latestMap[d.id];
    if (val === undefined) { kpiNoData++; continue; }
    const r = rag(val, d.threshold_green, d.threshold_amber, d.direction);
    if (r === "green") kpiGreen++;
    else if (r === "amber") kpiAmber++;
    else kpiRed++;
  }
  const kpiTotal = allDefs.length;

  const PIPELINE_STAGES = [
    { key: "idea",      label: "Ideas",     color: "bg-[var(--color-border-primary)]" },
    { key: "draft",     label: "Drafts",    color: "bg-amber-400" },
    { key: "scheduled", label: "Scheduled", color: "bg-blue-400" },
    { key: "published", label: "Published", color: "bg-[var(--color-success-light)]0" },
    { key: "backlog",   label: "Backlog",   color: "bg-purple-400" },
  ];

  return (
    <div className="space-y-6">

      {/* ── Overall KPI Health ─────────────────────────────────────────── */}
      {kpiTotal > 0 && (
        <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Overall KPI Health</h2>
            <span className="text-xs text-[var(--color-text-tertiary)]">{kpiTotal} metrics tracked</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-3 rounded-full bg-[var(--color-bg-tertiary)] overflow-hidden flex">
              {kpiGreen  > 0 && <div className="bg-[var(--color-success-light)]0 h-full" style={{ flex: kpiGreen }} />}
              {kpiAmber  > 0 && <div className="bg-amber-400 h-full" style={{ flex: kpiAmber }} />}
              {kpiRed    > 0 && <div className="bg-[var(--color-error-light)]0   h-full" style={{ flex: kpiRed }} />}
              {kpiNoData > 0 && <div className="bg-[var(--color-border-primary)]  h-full" style={{ flex: kpiNoData }} />}
            </div>
          </div>
          <div className="flex items-center gap-4 mt-3 text-xs">
            {kpiGreen  > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[var(--color-success-light)]0" /><span className="text-[var(--color-text-secondary)]">{kpiGreen} on target</span></span>}
            {kpiAmber  > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" /><span className="text-[var(--color-text-secondary)]">{kpiAmber} needs attention</span></span>}
            {kpiRed    > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[var(--color-error-light)]0" /><span className="text-[var(--color-text-secondary)]">{kpiRed} off target</span></span>}
            {kpiNoData > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[var(--color-border-primary)]" /><span className="text-[var(--color-text-secondary)]">{kpiNoData} no data</span></span>}
          </div>
        </div>
      )}

      {/* ── Ad Content Performance (from marketing dept) ───────────────── */}
      <KpiSection
        title="Ad Content Performance"
        subtitle="Weekly video ad metrics — sourced from Marketing / Meta Ads"
        defs={adContentDefs}
        latestMap={latestMap}
      />

      {/* ── Ad Content Output (creatives dept) ─────────────────────────── */}
      <KpiSection
        title="Ad Content Output"
        subtitle="Video delivery & efficiency"
        defs={outputDefs}
        latestMap={latestMap}
      />

      {/* ── Stills Output / Quality ────────────────────────────────────── */}
      <KpiSection
        title="Stills Output / Quality"
        subtitle="Stills delivery & revision metrics"
        defs={stillsOutDefs}
        latestMap={latestMap}
      />

      {/* ── Stills Performance ─────────────────────────────────────────── */}
      <KpiSection
        title="Stills Performance"
        subtitle="Stills ad performance metrics"
        defs={stillsPerfDefs}
        latestMap={latestMap}
      />

      {/* ── Organic Content Performance ────────────────────────────────── */}
      <KpiSection
        title="Organic Content Performance"
        subtitle="Organic social metrics — TikTok, Instagram, YouTube"
        defs={organicDefs}
        latestMap={latestMap}
      />

      {/* ── Content pipeline ───────────────────────────────────────────── */}
      <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Content pipeline · all time</h2>
          <span className="text-xs text-[var(--color-text-tertiary)]">{totalPosts} total posts</span>
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
                <p className="text-xl font-bold text-[var(--color-text-primary)]">{count}</p>
                <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{stage.label}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Platform breakdown + upcoming ──────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Platform distribution */}
        <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-5">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)] mb-4">Posts by platform</h2>
          <div className="space-y-3">
            {Object.entries(platformPostCounts)
              .sort(([, a], [, b]) => b - a)
              .map(([platform, count]) => {
                const pct = (count / Math.max(1, totalPosts)) * 100;
                const colorClass = PLATFORM_COLORS[platform] ?? "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]";
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
                      <span className="text-sm font-semibold text-[var(--color-text-primary)]">{count}</span>
                    </div>
                    <div className="h-1.5 bg-[var(--color-bg-tertiary)] rounded-full overflow-hidden">
                      <div className={`h-full ${barColor} rounded-full`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* Upcoming scheduled */}
        <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--color-border-secondary)]">
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Upcoming scheduled posts</h2>
            <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">{statusCounts.scheduled ?? 0} total scheduled</p>
          </div>
          {upcoming.length === 0 ? (
            <p className="px-5 py-8 text-sm text-[var(--color-text-tertiary)] text-center">No upcoming scheduled posts.</p>
          ) : (
            <div className="divide-y divide-[var(--color-border-secondary)]">
              {upcoming.map((p) => (
                <div key={p.id} className="px-5 py-3 flex items-center gap-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PLATFORM_COLORS[p.platform] ?? "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]"}`}>
                    {p.platform.charAt(0).toUpperCase() + p.platform.slice(1)}
                  </span>
                  <span className="text-xs text-[var(--color-text-secondary)] flex-1">
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
        <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--color-border-secondary)]">
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Platform analytics · last 7 days</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[var(--color-border-secondary)]">
            {Object.entries(platformAnalytics).map(([platformId, stats]) => {
              const plat = platformMap[platformId];
              if (!plat) return null;
              const colorClass = PLATFORM_COLORS[plat.platform] ?? "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]";
              const engRate = stats.reach > 0 ? ((stats.engagements / stats.reach) * 100).toFixed(1) : "—";
              return (
                <div key={platformId} className="p-5">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colorClass} mb-3 inline-block`}>
                    {plat.platform.charAt(0).toUpperCase() + plat.platform.slice(1)}
                  </span>
                  <p className="text-xs text-[var(--color-text-tertiary)] mt-2 mb-0.5">Reach</p>
                  <p className="text-2xl font-bold text-[var(--color-text-primary)]">{fmtK(stats.reach)}</p>
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <div>
                      <p className="text-xs text-[var(--color-text-tertiary)]">Engagements</p>
                      <p className="text-sm font-semibold text-[var(--color-text-primary)]">{fmtK(stats.engagements)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--color-text-tertiary)]">Eng. rate</p>
                      <p className="text-sm font-semibold text-[var(--color-text-primary)]">{engRate}{engRate !== "—" ? "%" : ""}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--color-text-tertiary)]">Followers</p>
                      <p className="text-sm font-semibold text-[var(--color-text-primary)]">{fmtK(stats.follower_count)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--color-text-tertiary)]">Growth</p>
                      <p className={`text-sm font-semibold ${stats.growth >= 0 ? "text-[var(--color-success)]" : "text-[var(--color-error)]"}`}>
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
          <h2 className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-3">Top posts by engagement</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {(topPosts ?? []).map((post) => {
              const plat = platformMap[post.platform_id];
              const colorClass = PLATFORM_COLORS[plat?.platform ?? ""] ?? "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]";
              return (
                <div key={post.id} className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] overflow-hidden">
                  <div className="aspect-video bg-[var(--color-bg-tertiary)] relative">
                    {post.thumbnail_url ? (
                      <img src={post.thumbnail_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[var(--color-text-tertiary)] text-2xl">📷</div>
                    )}
                    <span className={`absolute top-1 right-1 text-[9px] px-1 py-0.5 rounded-full font-medium ${colorClass}`}>
                      {plat?.platform?.slice(0, 2).toUpperCase() ?? "—"}
                    </span>
                  </div>
                  <div className="p-2">
                    {post.caption_preview && (
                      <p className="text-[10px] text-[var(--color-text-secondary)] line-clamp-2 mb-1.5">{post.caption_preview}</p>
                    )}
                    <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)]">
                      <span>❤️ {fmtK(post.engagements)}</span>
                      <span>👁 {fmtK(post.reach)}</span>
                    </div>
                    {post.published_at && (
                      <p className="text-[9px] text-[var(--color-text-tertiary)] mt-1">{format(parseISO(post.published_at), "d MMM")}</p>
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
