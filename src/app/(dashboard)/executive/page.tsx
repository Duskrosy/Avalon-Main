import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";
import { redirect } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { LiveAdsPanel } from "./live-ads-panel";
import { CalendarWidget } from "./calendar-widget";
import { LookAhead, computeAlerts } from "./look-ahead";
import { RevenueCard } from "./revenue-card";
import { AttendanceCard } from "./attendance-card";
import { CeoPlanning } from "./ceo-planning";

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
    accent === "red"   ? "bg-[var(--color-error-light)] border-red-200" :
    accent === "amber" ? "bg-[var(--color-warning-light)] border-[var(--color-border-primary)]" :
    accent === "green" ? "bg-[var(--color-success-light)] border-green-200" :
    accent === "blue"  ? "bg-[var(--color-accent-light)] border-[var(--color-accent)]" :
    "bg-[var(--color-bg-primary)] border-[var(--color-border-primary)]";
  const valColor =
    accent === "red"   ? "text-[var(--color-error)]" :
    accent === "amber" ? "text-[var(--color-warning-text)]" :
    accent === "green" ? "text-[var(--color-success)]" :
    accent === "blue"  ? "text-[var(--color-accent)]" :
    "text-[var(--color-text-primary)]";

  const inner = (
    <div className={`rounded-[var(--radius-lg)] border p-5 h-full ${bg} ${href ? "hover:shadow-[var(--shadow-md)] transition-shadow cursor-pointer" : ""}`}>
      <div className="flex items-start justify-between gap-2 mb-1">
        <p className="text-xs text-[var(--color-text-secondary)] font-medium uppercase tracking-wide leading-tight">{label}</p>
        {badge && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] text-[var(--color-text-secondary)] font-medium shrink-0">
            {badge}
          </span>
        )}
      </div>
      <p className={`text-3xl font-bold tracking-tight ${valColor}`}>{value}</p>
      {sub && <p className="text-xs text-[var(--color-text-tertiary)] mt-1.5">{sub}</p>}
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
    status === "red"   ? "bg-[var(--color-error)]" :
    status === "amber" ? "bg-amber-400" :
    status === "none"  ? "bg-[var(--color-border-primary)]" :
    "bg-[var(--color-success)]";

  return (
    <Link href={href} className="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-[var(--color-surface-hover)] transition-colors group">
      <div className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
      <span className="text-sm text-[var(--color-text-primary)] flex-1 font-medium">{deptName}</span>
      <div className="flex items-center gap-2 text-xs text-[var(--color-text-tertiary)]">
        {green  > 0 && <span className="text-[var(--color-success)] font-semibold">{green}✓</span>}
        {amber  > 0 && <span className="text-[var(--color-warning)] font-semibold">{amber}!</span>}
        {red    > 0 && <span className="text-[var(--color-error)]   font-semibold">{red}✗</span>}
        {noData > 0 && <span className="text-[var(--color-text-tertiary)]">{noData}—</span>}
      </div>
      <div className="w-24 h-1.5 rounded-full bg-[var(--color-bg-tertiary)] overflow-hidden flex gap-px shrink-0">
        {green  > 0 && <div className="bg-[var(--color-success)] rounded-full" style={{ flex: green  }} />}
        {amber  > 0 && <div className="bg-amber-400 rounded-full" style={{ flex: amber  }} />}
        {red    > 0 && <div className="bg-[var(--color-error)]   rounded-full" style={{ flex: red    }} />}
        {noData > 0 && <div className="bg-[var(--color-border-primary)]  rounded-full" style={{ flex: noData }} />}
      </div>
      <span className="text-xs text-[var(--color-text-tertiary)] group-hover:text-[var(--color-text-secondary)]">→</span>
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

  // Date range for Shopify (still used, defaults to today)
  const dateFrom = sp.from ?? today;
  const dateTo   = sp.to   ?? today;

  // ── Parallel data fetch ───────────────────────────────────────────────────
  const [
    { data: salesTodayRows },
    { data: salesWeekRows },
    { data: confirmedSalesMonth },
    { count: pendingLeaves },
    { count: obsAlerts },
    { count: headcount },
    { data: allKpiDefs },
    { data: allKpiEntries },
    { data: departments },
    { data: announcements },
    { data: smmAnalytics7d },
    { data: smmPlatforms },
    { count: tasksCompletedWeek },
    { count: tasksOverdue },
    { data: calendarEventsRaw },
    { data: personalBoard },
    { count: approvedLeavesToday },
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

    // Kanban: tasks completed this week
    admin.from("kanban_cards")
      .select("id", { count: "exact", head: true })
      .gte("completed_at", sevenDaysAgo),

    // Kanban: overdue tasks (due_date passed, not completed)
    admin.from("kanban_cards")
      .select("id", { count: "exact", head: true })
      .lt("due_date", today)
      .is("completed_at", null),

    // Calendar events (all, will filter/expand client-side)
    admin.from("calendar_events").select("*"),

    // Personal kanban board for CEO Planning
    admin.from("kanban_boards")
      .select("id")
      .eq("scope", "personal")
      .eq("owner_id", user.id)
      .limit(1)
      .maybeSingle(),

    // Approved leaves today (for attendance)
    admin.from("leaves")
      .select("*", { count: "exact", head: true })
      .eq("status", "approved")
      .lte("start_date", today)
      .gte("end_date", today),
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

  // Calendar events — expand recurring for current year
  const calEvents = (calendarEventsRaw ?? []).flatMap((evt: any) => {
    if (!evt.is_recurring || evt.recurrence_rule !== "yearly") return [evt];
    const origMonth = new Date(evt.event_date).getMonth();
    const origDay = new Date(evt.event_date).getDate();
    const year = new Date().getFullYear();
    return [{ ...evt, event_date: `${year}-${String(origMonth+1).padStart(2,"0")}-${String(origDay).padStart(2,"0")}` }];
  });
  const lookAheadAlerts = computeAlerts(calEvents);

  // Personal kanban columns for CEO Planning
  let ceoPlanningColumns: any[] = [];
  if (personalBoard?.id) {
    const { data: cols } = await admin
      .from("kanban_columns")
      .select("id, name, sort_order, kanban_cards(id, title, priority, due_date)")
      .eq("board_id", personalBoard.id)
      .order("sort_order");
    ceoPlanningColumns = (cols ?? []).map((c: any) => ({
      ...c,
      cards: (c.kanban_cards ?? []).sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    }));
  }

  // Revenue by channel
  const messengerRevenue = (confirmedSalesMonth ?? [])
    .filter((r: any) => r.platform === "messenger" || !r.platform)
    .reduce((s: number, r: any) => s + Number(r.net_value), 0);
  const todayRevenue = {
    all: shopifyRevenue + messengerRevenue,
    store: 0,
    conversion: shopifyRevenue,
    messenger: messengerRevenue,
  };
  const yesterdayRevenue = {
    all: shopifyRevPrev,
    store: 0,
    conversion: shopifyRevPrev,
    messenger: 0,
  };

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
  const alertAccent = (obsAlerts ?? 0) > 0 ? "red" : "none";

  return (
    <div className="space-y-7">

      {/* ── Alert banner ─────────────────────────────────────────────────── */}
      {(obsAlerts ?? 0) > 0 && (
        <Link href="/admin/observability"
          className="flex items-center justify-between bg-[var(--color-error-light)] border border-red-200 rounded-[var(--radius-lg)] px-5 py-3 hover:bg-[var(--color-error-light)] transition-colors">
          <div className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-[var(--color-error)] animate-pulse inline-block" />
            <span className="text-sm font-semibold text-[var(--color-error)]">
              {obsAlerts} unacknowledged system {obsAlerts === 1 ? "alert" : "alerts"}
            </span>
          </div>
          <span className="text-xs text-[var(--color-error)] font-medium">View →</span>
        </Link>
      )}

      {/* ── KPI health across departments ────────────────────────────────── */}
      {deptsWithKpis.length > 0 && (
        <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--color-border-secondary)] flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">KPI Health · all departments</h2>
              <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
                {kpiTotal} KPIs tracked ·{" "}
                <span className="text-[var(--color-success)] font-medium">{kpiGreen} on track</span>
                {kpiAmber > 0 && <span className="text-[var(--color-warning)] font-medium"> · {kpiAmber} monitor</span>}
                {kpiRed   > 0 && <span className="text-[var(--color-error)]   font-medium"> · {kpiRed} critical</span>}
              </p>
            </div>
            <Link href="/analytics/kpis" className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]">All KPIs →</Link>
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

      {/* ── Key metrics row ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <RevenueCard revenue={todayRevenue} yesterdayRevenue={yesterdayRevenue} />
        <MetricCard
          label="Shopify Revenue"
          value={shopifyRevenue > 0 ? fmtMoney(shopifyRevenue) : "—"}
          sub={shopifyRevChange !== null ? `${shopifyRevChange >= 0 ? "+" : ""}${shopifyRevChange.toFixed(1)}% vs prev · ${shopifyCount} orders` : `${shopifyCount} orders`}
          accent={shopifyRevChange !== null ? (shopifyRevChange >= 5 ? "green" : shopifyRevChange < -5 ? "red" : "none") : "none"}
          badge="Shopify"
        />
        <MetricCard
          label="Revenue this month"
          value={fmtMoney(monthRevenue)}
          sub={`${monthSalesCount} confirmed orders`}
          badge="Sales"
        />
        <AttendanceCard headcount={headcount ?? 0} onLeaveToday={approvedLeavesToday ?? 0} />
      </div>

      {/* ── Two-column: Sales today + Ad ops ─────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Sales agent ranking */}
        <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--color-border-secondary)] flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Sales · today</h2>
              <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">{format(new Date(), "EEEE d MMMM")}</p>
            </div>
            <Link href="/executive/sales" className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]">More →</Link>
          </div>
          {agentRanking.length === 0 ? (
            <p className="px-5 py-8 text-sm text-[var(--color-text-tertiary)] text-center">No volume logged yet today.</p>
          ) : (
            <div className="px-5 py-3 space-y-2.5">
              {agentRanking.map((agent, i) => {
                const pct = (agent.pairs / maxDailyPairs) * 100;
                const color =
                  agent.pairs >= 8 ? "bg-[var(--color-success)]" :
                  agent.pairs >= 6 ? "bg-amber-400" :
                  "bg-red-400";
                const badge =
                  agent.pairs >= 8 ? "bg-[var(--color-success-light)] text-[var(--color-success)]" :
                  agent.pairs >= 6 ? "bg-[var(--color-warning-light)] text-[var(--color-warning-text)]" :
                  "bg-[var(--color-error-light)] text-[var(--color-error)]";
                return (
                  <div key={agent.name} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-[var(--color-text-tertiary)] w-4 text-right">{i + 1}</span>
                        <span className="text-sm text-[var(--color-text-primary)] font-medium">{agent.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${badge}`}>
                          {agent.pairs} pairs
                        </span>
                      </div>
                    </div>
                    <div className="ml-6 h-1.5 bg-[var(--color-bg-tertiary)] rounded-full overflow-hidden">
                      <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
              <div className="pt-1.5 border-t border-[var(--color-border-secondary)] flex items-center justify-between">
                <span className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide">Team total</span>
                <span className="text-sm font-bold text-[var(--color-text-primary)]">{totalPairsToday} pairs</span>
              </div>
            </div>
          )}
        </div>

        <LiveAdsPanel />
      </div>

      {/* ── Calendar + Look-ahead ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <div className="lg:col-span-3 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4">
          <CalendarWidget events={calEvents} month={new Date()} />
        </div>
        <div className="lg:col-span-2 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4">
          <LookAhead alerts={lookAheadAlerts} />
        </div>
      </div>

      {/* ── Task Velocity + CEO Planning ─────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <div className="lg:col-span-2 flex items-center justify-between bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-[var(--color-text-primary)]">Task Velocity</p>
            <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">Kanban board · last 7 days</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-center">
              <p className="text-xl font-bold text-[var(--color-success)]">{tasksCompletedWeek ?? 0}</p>
              <p className="text-[10px] text-[var(--color-text-tertiary)] uppercase tracking-wide">Completed</p>
            </div>
            <div className="text-center">
              <p className={`text-xl font-bold ${(tasksOverdue ?? 0) > 0 ? "text-[var(--color-error)]" : "text-[var(--color-text-tertiary)]"}`}>
                {tasksOverdue ?? 0}
              </p>
              <p className="text-[10px] text-[var(--color-text-tertiary)] uppercase tracking-wide">Overdue</p>
            </div>
          </div>
        </div>
        <div className="lg:col-span-3 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4">
          <CeoPlanning columns={ceoPlanningColumns} />
        </div>
      </div>

      {/* ── Announcements ────────────────────────────────────────────────── */}
      {(announcements ?? []).length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-2">Announcements</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(announcements ?? []).map((a) => {
              const border =
                a.priority === "urgent"    ? "border-l-4 border-l-red-400" :
                a.priority === "important" ? "border-l-4 border-l-amber-400" :
                "border-l-4 border-l-gray-200";
              return (
                <Link key={a.id} href="/communications/announcements"
                  className={`bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] px-4 py-3 hover:shadow-[var(--shadow-sm)] transition-shadow ${border}`}>
                  <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">{a.title}</p>
                  <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">{format(new Date(a.created_at), "d MMM yyyy")}</p>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
