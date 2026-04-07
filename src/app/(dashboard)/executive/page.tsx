import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";
import { redirect } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rag(v: number, green: number, amber: number, dir: string) {
  if (dir === "higher_better") {
    return v >= green ? "green" : v >= amber ? "amber" : "red";
  }
  return v <= green ? "green" : v <= amber ? "amber" : "red";
}

function fmtMoney(n: number, currency = "PHP") {
  if (n >= 1_000_000) return `₱${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `₱${(n / 1_000).toFixed(1)}K`;
  return `₱${n.toFixed(0)}`;
}
function fmtK(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

// ─── Metric card ──────────────────────────────────────────────────────────────

function MetricCard({
  label, value, sub, accent, href, badge,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: "green" | "amber" | "red" | "blue" | "none";
  href?: string;
  badge?: string;
}) {
  const bg =
    accent === "red"   ? "bg-red-50 border-red-200" :
    accent === "amber" ? "bg-amber-50 border-amber-200" :
    accent === "green" ? "bg-green-50 border-green-200" :
    accent === "blue"  ? "bg-blue-50 border-blue-200" :
    "bg-white border-gray-200";
  const valColor =
    accent === "red"   ? "text-red-700" :
    accent === "amber" ? "text-amber-700" :
    accent === "green" ? "text-green-700" :
    accent === "blue"  ? "text-blue-700" :
    "text-gray-900";

  const inner = (
    <div className={`rounded-xl border p-5 h-full ${bg} ${href ? "hover:shadow-md transition-shadow cursor-pointer" : ""}`}>
      <div className="flex items-start justify-between gap-2 mb-1">
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wide leading-tight">{label}</p>
        {badge && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white border border-gray-200 text-gray-500 font-medium shrink-0">
            {badge}
          </span>
        )}
      </div>
      <p className={`text-3xl font-bold tracking-tight ${valColor}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1.5">{sub}</p>}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

// ─── KPI health bar ───────────────────────────────────────────────────────────

function KpiBar({
  deptName, green, amber, red, noData, total, href,
}: {
  deptName: string; green: number; amber: number; red: number; noData: number; total: number; href: string;
}) {
  if (total === 0) return null;
  const status =
    red > 0          ? "red" :
    amber > 0        ? "amber" :
    noData === total ? "none" :
    "green";

  const dot =
    status === "red"   ? "bg-red-500" :
    status === "amber" ? "bg-amber-400" :
    status === "none"  ? "bg-gray-300" :
    "bg-green-500";

  return (
    <Link href={href} className="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-gray-50 transition-colors group">
      <div className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
      <span className="text-sm text-gray-700 flex-1 font-medium">{deptName}</span>
      <div className="flex items-center gap-2 text-xs text-gray-400">
        {green  > 0 && <span className="text-green-600 font-semibold">{green}✓</span>}
        {amber  > 0 && <span className="text-amber-600 font-semibold">{amber}!</span>}
        {red    > 0 && <span className="text-red-600   font-semibold">{red}✗</span>}
        {noData > 0 && <span className="text-gray-400">{noData}—</span>}
      </div>
      <div className="w-24 h-1.5 rounded-full bg-gray-100 overflow-hidden flex gap-px shrink-0">
        {green  > 0 && <div className="bg-green-500 rounded-full" style={{ flex: green  }} />}
        {amber  > 0 && <div className="bg-amber-400 rounded-full" style={{ flex: amber  }} />}
        {red    > 0 && <div className="bg-red-500   rounded-full" style={{ flex: red    }} />}
        {noData > 0 && <div className="bg-gray-200  rounded-full" style={{ flex: noData }} />}
      </div>
      <span className="text-xs text-gray-300 group-hover:text-gray-500">→</span>
    </Link>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function ExecutiveOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; preset?: string }>;
}) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) redirect("/login");

  const sp          = await searchParams;
  const admin       = createAdminClient();
  const today       = new Date().toISOString().slice(0, 10);
  const yesterday   = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const sevenDaysAgo   = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const thisMonthStart = `${today.slice(0, 7)}-01`;

  // Date range from picker (defaults to today)
  const dateFrom = sp.from ?? today;
  const dateTo   = sp.to   ?? today;

  // ── Parallel data fetch ───────────────────────────────────────────────────
  const [
    { data: salesTodayRows },
    { data: salesWeekRows },
    { data: confirmedSalesMonth },
    { data: adStats7d },
    { count: activeCampaigns },
    { count: pendingLeaves },
    { count: obsAlerts },
    { count: headcount },
    { data: allKpiDefs },
    { data: allKpiEntries },
    { data: departments },
    { data: announcements },
    { data: smmAnalytics7d },
    { data: smmPlatforms },
  ] = await Promise.all([
    // Sales today
    admin.from("sales_daily_volume")
      .select("confirmed_regular, agent_id, profiles(first_name, last_name)")
      .eq("date", today),

    // Sales this week (daily totals)
    admin.from("sales_daily_volume")
      .select("confirmed_regular, date")
      .gte("date", sevenDaysAgo)
      .order("date", { ascending: true }),

    // Confirmed sales this month
    admin.from("sales_confirmed_sales")
      .select("net_value, quantity")
      .gte("confirmed_date", thisMonthStart)
      .eq("status", "confirmed"),

    // Ad stats for selected date range
    admin.from("meta_ad_stats")
      .select("spend, impressions, clicks, conversions, conversion_value, campaign_id, campaign_name, metric_date")
      .gte("metric_date", dateFrom)
      .lte("metric_date", dateTo),

    // Active meta campaigns
    admin.from("meta_campaigns")
      .select("*", { count: "exact", head: true })
      .eq("effective_status", "ACTIVE"),

    // Pending leaves
    admin.from("leaves")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending"),

    // Unacknowledged alerts
    admin.from("obs_alerts")
      .select("*", { count: "exact", head: true })
      .eq("acknowledged", false),

    // Active headcount
    admin.from("profiles")
      .select("*", { count: "exact", head: true })
      .is("deleted_at", null),

    // All KPI definitions
    admin.from("kpi_definitions")
      .select("id, department_id, threshold_green, threshold_amber, direction")
      .eq("is_active", true),

    // Latest KPI entries
    admin.from("kpi_entries")
      .select("kpi_definition_id, value_numeric, period_date")
      .is("profile_id", null)
      .order("period_date", { ascending: false })
      .limit(500),

    // Departments
    admin.from("departments")
      .select("id, name, slug")
      .order("name"),

    // Recent announcements
    admin.from("announcements")
      .select("id, title, priority, created_at")
      .or("expires_at.is.null,expires_at.gt." + new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(4),

    // SMM analytics last 7d
    admin.from("smm_analytics")
      .select("platform_id, metric_date, reach, engagements, follower_count, follower_growth")
      .gte("metric_date", sevenDaysAgo)
      .order("metric_date", { ascending: false }),

    // SMM platforms (to label them)
    admin.from("smm_group_platforms")
      .select("id, platform, page_name")
      .eq("is_active", true),
  ]);

  // ── Shopify summary (selected date range) ─────────────────────────────────
  const manilaFrom = new Date(`${dateFrom}T00:00:00+08:00`).toISOString();
  const manilaTo   = new Date(`${dateTo}T23:59:59+08:00`).toISOString();
  const manilaFromPrev = new Date(`${new Date(Date.now() - (new Date(dateTo).getTime() - new Date(dateFrom).getTime() + 86400000)).toISOString().slice(0,10)}T00:00:00+08:00`).toISOString();
  const manilaFromPrevTo = new Date(`${new Date(new Date(dateFrom).getTime() - 86400000).toISOString().slice(0,10)}T23:59:59+08:00`).toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [{ data: shopifyOrdersCur }, { data: shopifyOrdersPrev }] = await Promise.all([
    (admin as any).from("shopify_orders").select("total_price").gte("created_at_shopify", manilaFrom).lte("created_at_shopify", manilaTo),
    (admin as any).from("shopify_orders").select("total_price").gte("created_at_shopify", manilaFromPrev).lte("created_at_shopify", manilaFromPrevTo),
  ]);

  const shopifyRevenue   = (shopifyOrdersCur ?? []).reduce((s: number, o: { total_price: string }) => s + Number(o.total_price ?? 0), 0);
  const shopifyCount     = (shopifyOrdersCur ?? []).length;
  const shopifyRevPrev   = (shopifyOrdersPrev ?? []).reduce((s: number, o: { total_price: string }) => s + Number(o.total_price ?? 0), 0);
  const shopifyRevChange = shopifyRevPrev > 0 ? ((shopifyRevenue - shopifyRevPrev) / shopifyRevPrev) * 100 : null;

  // ── Compute sales metrics ─────────────────────────────────────────────────
  const totalPairsToday = (salesTodayRows ?? []).reduce((s, r) => s + (r.confirmed_regular ?? 0), 0);
  const totalPairsWeek  = (salesWeekRows  ?? []).reduce((s, r) => s + (r.confirmed_regular ?? 0), 0);
  const salesYesterday  = (salesWeekRows  ?? []).filter((r) => r.date === yesterday).reduce((s, r) => s + (r.confirmed_regular ?? 0), 0);
  const monthRevenue    = (confirmedSalesMonth ?? []).reduce((s, r) => s + Number(r.net_value), 0);
  const monthSalesCount = (confirmedSalesMonth ?? []).reduce((s, r) => s + (r.quantity ?? 1), 0);

  // Daily breakdown for sparkline
  const salesByDay = (salesWeekRows ?? []).reduce<Record<string, number>>((m, r) => {
    m[r.date] = (m[r.date] ?? 0) + (r.confirmed_regular ?? 0);
    return m;
  }, {});
  const maxDailyPairs = Math.max(1, ...Object.values(salesByDay));

  // Agent ranking today
  const agentRanking = (salesTodayRows ?? [])
    .map((r) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = r.profiles as any;
      return {
        name: p ? `${p.first_name} ${p.last_name}` : r.agent_id,
        pairs: r.confirmed_regular ?? 0,
      };
    })
    .sort((a, b) => b.pairs - a.pairs)
    .slice(0, 8);

  // ── Compute ad metrics ────────────────────────────────────────────────────
  const totalSpend7d     = (adStats7d ?? []).reduce((s, r) => s + Number(r.spend), 0);
  const totalConvValue7d = (adStats7d ?? []).reduce((s, r) => s + Number(r.conversion_value), 0);
  const totalImpr7d      = (adStats7d ?? []).reduce((s, r) => s + (r.impressions ?? 0), 0);
  const totalConv7d      = (adStats7d ?? []).reduce((s, r) => s + (r.conversions ?? 0), 0);
  const overallRoas      = totalSpend7d > 0 ? totalConvValue7d / totalSpend7d : 0;

  // Top campaigns 7d
  const campaignMap: Record<string, { name: string; spend: number; value: number; impressions: number }> = {};
  for (const row of adStats7d ?? []) {
    const id = row.campaign_id;
    if (!id) continue;
    if (!campaignMap[id]) campaignMap[id] = { name: row.campaign_name ?? id, spend: 0, value: 0, impressions: 0 };
    campaignMap[id].spend       += Number(row.spend);
    campaignMap[id].value       += Number(row.conversion_value);
    campaignMap[id].impressions += row.impressions ?? 0;
  }
  const topCampaigns = Object.entries(campaignMap)
    .map(([id, c]) => ({ id, ...c, roas: c.spend > 0 ? c.value / c.spend : 0 }))
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 4);

  // ── Compute KPI health per department ────────────────────────────────────
  const latestKpiMap: Record<string, number> = {};
  for (const e of allKpiEntries ?? []) {
    if (!(e.kpi_definition_id in latestKpiMap)) {
      latestKpiMap[e.kpi_definition_id] = e.value_numeric;
    }
  }
  const deptKpiHealth: Record<string, { green: number; amber: number; red: number; noData: number; total: number }> = {};
  for (const def of allKpiDefs ?? []) {
    if (!def.department_id) continue;
    if (!deptKpiHealth[def.department_id]) {
      deptKpiHealth[def.department_id] = { green: 0, amber: 0, red: 0, noData: 0, total: 0 };
    }
    deptKpiHealth[def.department_id].total++;
    const val = latestKpiMap[def.id];
    if (val === undefined) { deptKpiHealth[def.department_id].noData++; continue; }
    const r = rag(val, def.threshold_green, def.threshold_amber, def.direction);
    deptKpiHealth[def.department_id][r]++;
  }
  const deptsWithKpis = (departments ?? []).filter((d) => deptKpiHealth[d.id]?.total > 0);

  // Overall KPI health
  let kpiGreen = 0, kpiAmber = 0, kpiRed = 0, kpiNoData = 0;
  for (const h of Object.values(deptKpiHealth)) {
    kpiGreen  += h.green;
    kpiAmber  += h.amber;
    kpiRed    += h.red;
    kpiNoData += h.noData;
  }
  const kpiTotal = kpiGreen + kpiAmber + kpiRed + kpiNoData;

  // ── Compute SMM metrics ───────────────────────────────────────────────────
  const smmPlatformMap = Object.fromEntries((smmPlatforms ?? []).map((p) => [p.id, p]));
  const latestFollowerByPlatform: Record<string, number> = {};
  let totalReach7d = 0;
  let totalFollowers = 0;

  for (const row of smmAnalytics7d ?? []) {
    totalReach7d += row.reach ?? 0;
    if (row.follower_count != null && !(row.platform_id in latestFollowerByPlatform)) {
      latestFollowerByPlatform[row.platform_id] = row.follower_count;
    }
  }
  totalFollowers = Object.values(latestFollowerByPlatform).reduce((s, v) => s + v, 0);

  // Follower growth 7d (sum of non-null growth entries)
  const followerGrowth7d = (smmAnalytics7d ?? []).reduce((s, r) => s + (r.follower_growth ?? 0), 0);

  // ── Render ────────────────────────────────────────────────────────────────
  const pairsAccent = totalPairsToday >= 40 ? "green" : totalPairsToday >= 25 ? "amber" : "red";
  const roasAccent  = overallRoas >= 2 ? "green" : overallRoas >= 1 ? "amber" : "red";
  const alertAccent = (obsAlerts ?? 0) > 0 ? "red" : "none";

  return (
    <div className="space-y-7">

      {/* ── Alert banner ─────────────────────────────────────────────────── */}
      {(obsAlerts ?? 0) > 0 && (
        <Link href="/admin/observability"
          className="flex items-center justify-between bg-red-50 border border-red-200 rounded-xl px-5 py-3 hover:bg-red-100 transition-colors">
          <div className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse inline-block" />
            <span className="text-sm font-semibold text-red-700">
              {obsAlerts} unacknowledged system {obsAlerts === 1 ? "alert" : "alerts"}
            </span>
          </div>
          <span className="text-xs text-red-500 font-medium">View →</span>
        </Link>
      )}

      {/* ── Top metric cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <MetricCard
          label="Pairs sold today"
          value={totalPairsToday}
          sub={`vs ${salesYesterday} yesterday · ${totalPairsWeek} this week`}
          accent={pairsAccent as "green" | "amber" | "red"}
          href="/executive/sales"
          badge="Sales"
        />
        <MetricCard
          label="Revenue this month"
          value={fmtMoney(monthRevenue)}
          sub={`${monthSalesCount} confirmed orders`}
          href="/executive/sales"
          badge="Sales"
        />
        <MetricCard
          label={`Ad spend · ${sp.preset === "7d" ? "7 days" : sp.preset === "30d" ? "30 days" : sp.preset === "yesterday" ? "Yesterday" : "Today"}`}
          value={fmtMoney(totalSpend7d)}
          sub={`ROAS ${overallRoas.toFixed(2)}x · ${fmtK(totalImpr7d)} impressions`}
          accent={roasAccent as "green" | "amber" | "red" | "none"}
          href="/executive/ad-ops"
          badge="Ad Ops"
        />
        <MetricCard
          label="Active campaigns"
          value={activeCampaigns ?? 0}
          sub={`${totalConv7d} conversions this week`}
          href="/executive/ad-ops"
          badge="Ad Ops"
        />
        <MetricCard
          label="Social followers"
          value={fmtK(totalFollowers)}
          sub={`${totalReach7d > 0 ? fmtK(totalReach7d) + " reach" : "—"} · ${followerGrowth7d >= 0 ? "+" : ""}${followerGrowth7d} growth this week`}
          accent="blue"
          href="/executive/marketing"
          badge="Marketing"
        />
        <MetricCard
          label="Team · pending leaves"
          value={`${headcount ?? 0} people`}
          sub={`${pendingLeaves ?? 0} leave ${(pendingLeaves ?? 0) === 1 ? "request" : "requests"} pending`}
          accent={(pendingLeaves ?? 0) > 3 ? "amber" : "none"}
          href="/executive/people"
          badge="People"
        />
        <MetricCard
          label={`Shopify revenue · ${sp.preset === "7d" ? "7 days" : sp.preset === "30d" ? "30 days" : sp.preset === "yesterday" ? "Yesterday" : "Today"}`}
          value={shopifyRevenue > 0 ? fmtMoney(shopifyRevenue) : "—"}
          sub={
            shopifyRevChange !== null
              ? `${shopifyRevChange >= 0 ? "+" : ""}${shopifyRevChange.toFixed(1)}% vs prev · ${shopifyCount} orders`
              : `${shopifyCount} orders`
          }
          accent={shopifyRevChange !== null ? (shopifyRevChange >= 5 ? "green" : shopifyRevChange < -5 ? "red" : "none") : "none"}
          href="/sales-ops/shopify"
          badge="Sales"
        />
      </div>

      {/* ── Two-column: Sales today + Ad ops ─────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Sales agent ranking */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Sales · today</h2>
              <p className="text-xs text-gray-400 mt-0.5">{format(new Date(), "EEEE d MMMM")}</p>
            </div>
            <Link href="/executive/sales" className="text-xs text-gray-400 hover:text-gray-700">More →</Link>
          </div>
          {agentRanking.length === 0 ? (
            <p className="px-5 py-8 text-sm text-gray-400 text-center">No volume logged yet today.</p>
          ) : (
            <div className="px-5 py-3 space-y-2.5">
              {agentRanking.map((agent, i) => {
                const pct = (agent.pairs / maxDailyPairs) * 100;
                const color =
                  agent.pairs >= 8 ? "bg-green-500" :
                  agent.pairs >= 6 ? "bg-amber-400" :
                  "bg-red-400";
                const badge =
                  agent.pairs >= 8 ? "bg-green-50 text-green-700" :
                  agent.pairs >= 6 ? "bg-amber-50 text-amber-700" :
                  "bg-red-50 text-red-700";
                return (
                  <div key={agent.name} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400 w-4 text-right">{i + 1}</span>
                        <span className="text-sm text-gray-700 font-medium">{agent.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${badge}`}>
                          {agent.pairs} pairs
                        </span>
                      </div>
                    </div>
                    <div className="ml-6 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
              <div className="pt-1.5 border-t border-gray-100 flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Team total</span>
                <span className="text-sm font-bold text-gray-900">{totalPairsToday} pairs</span>
              </div>
            </div>
          )}
        </div>

        {/* Top campaigns */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Ad Operations</h2>
              <p className="text-xs text-gray-400 mt-0.5">Spend {fmtMoney(totalSpend7d)} · ROAS {overallRoas.toFixed(2)}x</p>
            </div>
            <Link href="/executive/ad-ops" className="text-xs text-gray-400 hover:text-gray-700">More →</Link>
          </div>
          {topCampaigns.length === 0 ? (
            <p className="px-5 py-8 text-sm text-gray-400 text-center">No campaign data for this period.</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {topCampaigns.map((c) => {
                const roasBadge =
                  c.roas >= 2 ? "bg-green-50 text-green-700" :
                  c.roas >= 1 ? "bg-amber-50 text-amber-700" :
                  "bg-red-50 text-red-700";
                return (
                  <div key={c.id} className="px-5 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 font-medium truncate">{c.name}</p>
                      <p className="text-xs text-gray-400">{fmtK(c.impressions)} impressions</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-gray-900">
                        {fmtMoney(c.spend)}
                      </p>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${roasBadge}`}>
                        {c.roas.toFixed(2)}x ROAS
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── KPI health across departments ────────────────────────────────── */}
      {deptsWithKpis.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">KPI Health · all departments</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {kpiTotal} KPIs tracked ·{" "}
                <span className="text-green-600 font-medium">{kpiGreen} on track</span>
                {kpiAmber > 0 && <span className="text-amber-600 font-medium"> · {kpiAmber} monitor</span>}
                {kpiRed   > 0 && <span className="text-red-600   font-medium"> · {kpiRed} critical</span>}
              </p>
            </div>
            <Link href="/analytics/kpis" className="text-xs text-gray-400 hover:text-gray-700">All KPIs →</Link>
          </div>
          <div className="px-2 py-2 grid grid-cols-1 sm:grid-cols-2 gap-0.5">
            {deptsWithKpis.map((dept) => {
              const h = deptKpiHealth[dept.id];
              return (
                <KpiBar
                  key={dept.id}
                  deptName={dept.name}
                  green={h.green}
                  amber={h.amber}
                  red={h.red}
                  noData={h.noData}
                  total={h.total}
                  href="/analytics/kpis"
                />
              );
            })}
          </div>
        </div>
      )}

      {/* ── Announcements ────────────────────────────────────────────────── */}
      {(announcements ?? []).length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Announcements</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(announcements ?? []).map((a) => {
              const border =
                a.priority === "urgent"    ? "border-l-4 border-l-red-400" :
                a.priority === "important" ? "border-l-4 border-l-amber-400" :
                "border-l-4 border-l-gray-200";
              return (
                <Link key={a.id} href="/communications/announcements"
                  className={`bg-white border border-gray-200 rounded-xl px-4 py-3 hover:shadow-sm transition-shadow ${border}`}>
                  <p className="text-sm font-medium text-gray-900 truncate">{a.title}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{format(new Date(a.created_at), "d MMM yyyy")}</p>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
