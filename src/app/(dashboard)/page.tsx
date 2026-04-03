import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isOps, isManagerOrAbove } from "@/lib/permissions";
import { redirect } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";

// ─── helpers ─────────────────────────────────────────────────────────────────

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
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
    case "currency_php": return `₱${value.toFixed(2)}`;
    case "days":         return `${value}d`;
    case "weeks":        return `${value}w`;
    case "seconds":      return `${value}s`;
    default:             return value.toLocaleString();
  }
}

// ─── sub-components ───────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  href,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  href?: string;
  accent?: "red" | "amber" | "green";
}) {
  const accentCls =
    accent === "red"
      ? "border-red-200 bg-red-50"
      : accent === "amber"
      ? "border-amber-200 bg-amber-50"
      : "border-gray-200 bg-white";

  const inner = (
    <div className={`rounded-xl border p-5 ${accentCls} ${href ? "hover:shadow-md transition-shadow cursor-pointer" : ""}`}>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${accent === "red" ? "text-red-700" : accent === "amber" ? "text-amber-700" : "text-gray-900"}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );

  return href ? <Link href={href}>{inner}</Link> : inner;
}

type RagStatus = { green: number; amber: number; red: number; noData: number; total: number };

function KpiHealthBar({ status, deptName, href }: { status: RagStatus; deptName: string; href: string }) {
  if (status.total === 0) return null;
  return (
    <Link href={href} className="block bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-gray-700">{deptName} KPIs</p>
        <span className="text-xs text-gray-400">{status.total} tracked</span>
      </div>
      <div className="flex items-center gap-4 mb-3">
        {[
          { label: "On Track", count: status.green,  cls: "text-green-600" },
          { label: "Monitor",  count: status.amber,  cls: "text-amber-600" },
          { label: "Critical", count: status.red,    cls: "text-red-600"   },
          { label: "No Data",  count: status.noData, cls: "text-gray-400"  },
        ].filter(s => s.count > 0).map(s => (
          <div key={s.label} className="flex items-center gap-1.5">
            <span className={`text-sm font-bold ${s.cls}`}>{s.count}</span>
            <span className="text-xs text-gray-400">{s.label}</span>
          </div>
        ))}
      </div>
      <div className="h-2 rounded-full overflow-hidden flex gap-0.5">
        {status.green  > 0 && <div className="bg-green-500 rounded-full" style={{ flex: status.green  }} />}
        {status.amber  > 0 && <div className="bg-amber-400 rounded-full" style={{ flex: status.amber  }} />}
        {status.red    > 0 && <div className="bg-red-500   rounded-full" style={{ flex: status.red    }} />}
        {status.noData > 0 && <div className="bg-gray-200  rounded-full" style={{ flex: status.noData }} />}
      </div>
    </Link>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const supabase = await createClient();
  const admin = createAdminClient();
  const user = await getCurrentUser(supabase);
  if (!user) redirect("/login");

  const userIsOps = isOps(user);
  const userIsManager = isManagerOrAbove(user);
  const deptId = user.department_id;
  const deptSlug = user.department?.slug ?? "";
  const today = new Date().toISOString().slice(0, 10);

  // ── 1. Unread notifications (own) ─────────────────────────────────────────
  const { count: unreadCount } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .is("read_at", null);

  // ── 2. Pending leaves ─────────────────────────────────────────────────────
  let pendingLeavesQuery = admin
    .from("leaves")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending");

  if (!userIsOps && userIsManager && deptId) {
    const { data: deptUsers } = await admin
      .from("profiles")
      .select("id")
      .eq("department_id", deptId)
      .is("deleted_at", null);
    const ids = (deptUsers ?? []).map((u) => u.id);
    if (ids.length) pendingLeavesQuery = pendingLeavesQuery.in("user_id", ids);
  } else if (!userIsOps && !userIsManager) {
    pendingLeavesQuery = pendingLeavesQuery.eq("user_id", user.id);
  }
  const { count: pendingLeaves } = await pendingLeavesQuery;

  // ── 3. Kanban cards assigned to me ────────────────────────────────────────
  const { count: myCards } = await supabase
    .from("kanban_cards")
    .select("*", { count: "exact", head: true })
    .eq("assigned_to", user.id);

  // ── 4. Active goals ───────────────────────────────────────────────────────
  let goalsQuery = supabase
    .from("goals")
    .select("*", { count: "exact", head: true })
    .eq("status", "active");
  if (!userIsOps && deptId) goalsQuery = goalsQuery.eq("department_id", deptId);
  const { count: activeGoals } = await goalsQuery;

  // ── 5. Department KPI health ──────────────────────────────────────────────
  const kpiStatus: RagStatus = { green: 0, amber: 0, red: 0, noData: 0, total: 0 };
  if (deptId) {
    const { data: defs } = await supabase
      .from("kpi_definitions")
      .select("id, threshold_green, threshold_amber, direction")
      .eq("department_id", deptId)
      .eq("is_active", true);

    if (defs && defs.length > 0) {
      kpiStatus.total = defs.length;
      const defIds = defs.map((d) => d.id);
      const { data: latestEntries } = await supabase
        .from("kpi_entries")
        .select("kpi_definition_id, value_numeric, period_date")
        .in("kpi_definition_id", defIds)
        .is("profile_id", null)
        .order("period_date", { ascending: false });

      // Latest entry per definition
      const latestMap: Record<string, number> = {};
      for (const e of latestEntries ?? []) {
        if (!(e.kpi_definition_id in latestMap)) {
          latestMap[e.kpi_definition_id] = e.value_numeric;
        }
      }

      for (const def of defs) {
        const val = latestMap[def.id];
        if (val === undefined) { kpiStatus.noData++; continue; }
        const r = rag(val, def.threshold_green, def.threshold_amber, def.direction);
        kpiStatus[r]++;
      }
    }
  }

  // ── 6. Recent announcements ───────────────────────────────────────────────
  const { data: announcements } = await supabase
    .from("announcements")
    .select("id, title, body, priority, created_at, department_id")
    .or(`department_id.is.null,department_id.eq.${deptId ?? "00000000-0000-0000-0000-000000000000"}`)
    .or("expires_at.is.null,expires_at.gt." + new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(3);

  // ── 7. OPS extras — obs alerts + all-dept pending leaves ──────────────────
  let obsAlertCount = 0;
  let allPendingLeaves = 0;
  if (userIsOps) {
    const { count: ac } = await admin
      .from("obs_alerts")
      .select("*", { count: "exact", head: true })
      .eq("acknowledged", false);
    obsAlertCount = ac ?? 0;

    const { count: lc } = await admin
      .from("leaves")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending");
    allPendingLeaves = lc ?? 0;
  }

  // ── 8. Sales today snapshot ───────────────────────────────────────────────
  let salesToday: { agent: string; pairs: number }[] = [];
  if (deptSlug === "sales" || userIsOps) {
    const { data: volRows } = await admin
      .from("sales_daily_volume")
      .select("agent_id, pairs_sold, profiles(first_name, last_name)")
      .eq("date", today);
    salesToday = (volRows ?? []).map((r) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = r.profiles as any;
      return {
        agent: p ? `${p.first_name} ${p.last_name}` : r.agent_id,
        pairs: r.pairs_sold,
      };
    }).sort((a, b) => b.pairs - a.pairs);
  }

  const PRIORITY_STYLES: Record<string, string> = {
    urgent:    "border-l-4 border-red-400",
    important: "border-l-4 border-amber-400",
    normal:    "border-l-4 border-gray-200",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">
          {getGreeting()}, {user.first_name}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {userIsOps
            ? "Platform overview · all departments"
            : `${user.department?.name ?? ""} · ${format(new Date(), "EEEE, d MMMM yyyy")}`}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label={userIsOps ? "Pending leaves (all)" : userIsManager ? "Pending leaves" : "My leave requests"}
          value={userIsOps ? allPendingLeaves ?? 0 : pendingLeaves ?? 0}
          sub="awaiting review"
          href="/people/leaves"
          accent={(userIsOps ? allPendingLeaves : pendingLeaves) ?? 0 > 3 ? "amber" : undefined}
        />
        <StatCard
          label="Unread notifications"
          value={unreadCount ?? 0}
          href="/communications/notifications"
          accent={(unreadCount ?? 0) > 0 ? "amber" : undefined}
        />
        <StatCard
          label="My kanban cards"
          value={myCards ?? 0}
          sub="assigned to me"
          href="/productivity/kanban"
        />
        <StatCard
          label="Active goals"
          value={activeGoals ?? 0}
          href="/analytics/goals"
        />
      </div>

      {/* OPS: observability alert banner */}
      {userIsOps && obsAlertCount > 0 && (
        <Link
          href="/admin/observability"
          className="flex items-center justify-between bg-red-50 border border-red-200 rounded-xl px-5 py-3 hover:bg-red-100 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-sm font-medium text-red-700">
              {obsAlertCount} unacknowledged {obsAlertCount === 1 ? "alert" : "alerts"} in Observability
            </span>
          </div>
          <span className="text-xs text-red-500">View →</span>
        </Link>
      )}

      {/* KPI health */}
      {kpiStatus.total > 0 && (
        <KpiHealthBar
          status={kpiStatus}
          deptName={user.department?.name ?? "Department"}
          href="/analytics/kpis"
        />
      )}

      {/* Sales today (sales dept or OPS) */}
      {(deptSlug === "sales" || userIsOps) && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Sales today</h2>
              <p className="text-xs text-gray-400 mt-0.5">{format(new Date(), "EEEE d MMMM")}</p>
            </div>
            <Link href="/sales-ops/daily-volume" className="text-xs text-gray-400 hover:text-gray-700">
              Log volume →
            </Link>
          </div>
          {salesToday.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-gray-400">
              No volume logged yet today.
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {salesToday.map((row) => (
                <div key={row.agent} className="px-5 py-3 flex items-center justify-between">
                  <span className="text-sm text-gray-700">{row.agent}</span>
                  <div className="flex items-center gap-3">
                    <span className={`text-sm font-semibold ${
                      row.pairs >= 8 ? "text-green-600" : row.pairs >= 6 ? "text-amber-600" : "text-red-600"
                    }`}>
                      {row.pairs} pairs
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      row.pairs >= 8
                        ? "bg-green-50 text-green-700"
                        : row.pairs >= 6
                        ? "bg-amber-50 text-amber-700"
                        : "bg-red-50 text-red-700"
                    }`}>
                      {row.pairs >= 8 ? "On track" : row.pairs >= 6 ? "Monitor" : "Below target"}
                    </span>
                  </div>
                </div>
              ))}
              <div className="px-5 py-3 flex items-center justify-between bg-gray-50">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Team total</span>
                <span className="text-sm font-bold text-gray-900">
                  {salesToday.reduce((s, r) => s + r.pairs, 0)} pairs
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Recent announcements */}
      {(announcements ?? []).length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Announcements</h2>
          <div className="space-y-2">
            {(announcements ?? []).map((a) => (
              <Link
                key={a.id}
                href="/communications/announcements"
                className={`block bg-white border border-gray-200 rounded-xl px-5 py-3.5 hover:shadow-sm transition-shadow ${PRIORITY_STYLES[a.priority] ?? PRIORITY_STYLES.normal}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{a.title}</p>
                    {a.body && (
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{a.body}</p>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 shrink-0 mt-0.5">
                    {format(new Date(a.created_at), "d MMM")}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
