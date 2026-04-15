import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isOps, isManagerOrAbove } from "@/lib/permissions";
import { redirect } from "next/navigation";
import Link from "next/link";
import { format, differenceInDays } from "date-fns";
import { ConfettiBirthday } from "@/components/ui/confetti-birthday";
import { FeedbackButton } from "@/components/ui/feedback-button";

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

function goalRag(deadline: string, greenDays: number | null, amberDays: number | null): "green" | "amber" | "red" {
  const daysLeft = differenceInDays(new Date(deadline), new Date());
  if (greenDays != null && daysLeft >= greenDays) return "green";
  if (amberDays != null && daysLeft >= amberDays) return "amber";
  return "red";
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
      ? "border-red-200 bg-[var(--color-error-light)]"
      : accent === "amber"
      ? "border-[var(--color-border-primary)] bg-[var(--color-warning-light)]"
      : "border-[var(--color-border-primary)] bg-[var(--color-bg-primary)]";

  const inner = (
    <div className={`rounded-[var(--radius-lg)] border p-5 ${accentCls} ${href ? "hover:shadow-[var(--shadow-md)] transition-shadow cursor-pointer" : ""}`}>
      <p className="text-xs text-[var(--color-text-secondary)] mb-1">{label}</p>
      <p className={`text-2xl font-bold ${accent === "red" ? "text-[var(--color-error)]" : accent === "amber" ? "text-[var(--color-warning-text)]" : "text-[var(--color-text-primary)]"}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-[var(--color-text-tertiary)] mt-1">{sub}</p>}
    </div>
  );

  return href ? <Link href={href}>{inner}</Link> : inner;
}

type RagStatus = { green: number; amber: number; red: number; noData: number; total: number };

function KpiHealthBar({
  status,
  deptName,
  href,
  staleDays,
}: {
  status: RagStatus;
  deptName: string;
  href: string;
  staleDays?: number;
}) {
  if (status.total === 0) return null;
  return (
    <Link href={href} className="block bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4 hover:shadow-[var(--shadow-md)] transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-[var(--color-text-primary)]">{deptName} KPIs</p>
          {staleDays != null && staleDays > 2 && (
            <span className="text-[10px] bg-[var(--color-warning-light)] text-[var(--color-warning-text)] px-2 py-0.5 rounded-full font-medium">
              Data last updated {staleDays}d ago
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--color-text-tertiary)]">{status.total} tracked</span>
          <FeedbackButton pageUrl="/" />
        </div>
      </div>
      <div className="flex items-center gap-4 mb-3">
        {[
          { label: "On Track", count: status.green,  cls: "text-[var(--color-success)]" },
          { label: "Monitor",  count: status.amber,  cls: "text-[var(--color-warning)]" },
          { label: "Critical", count: status.red,    cls: "text-[var(--color-error)]"   },
          { label: "No Data",  count: status.noData, cls: "text-[var(--color-text-tertiary)]"  },
        ].filter(s => s.count > 0).map(s => (
          <div key={s.label} className="flex items-center gap-1.5">
            <span className={`text-sm font-bold ${s.cls}`}>{s.count}</span>
            <span className="text-xs text-[var(--color-text-tertiary)]">{s.label}</span>
          </div>
        ))}
      </div>
      <div className="h-2 rounded-full overflow-hidden flex gap-0.5">
        {status.green  > 0 && <div className="bg-[var(--color-success)] rounded-full" style={{ flex: status.green  }} />}
        {status.amber  > 0 && <div className="bg-amber-400 rounded-full" style={{ flex: status.amber  }} />}
        {status.red    > 0 && <div className="bg-[var(--color-error)]   rounded-full" style={{ flex: status.red    }} />}
        {status.noData > 0 && <div className="bg-[var(--color-border-primary)]  rounded-full" style={{ flex: status.noData }} />}
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
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Check if today is the current user's birthday
  let isBirthday = false;
  if (user.birthday) {
    const bday = new Date(user.birthday);
    const now  = new Date();
    isBirthday = bday.getMonth() === now.getMonth() && bday.getDate() === now.getDate();
  }

  // ── Pending leaves (depends on dept users for managers) ────────────────────
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

  // ── Parallelize independent queries with Promise.all ───────────────────────
  const [
    { count: unreadCount },
    { count: pendingLeaves },
    { count: myCards },
    { count: activeGoals },
  ] = await Promise.all([
    // 1. Unread notifications (own)
    supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .is("read_at", null),
    // 2. Pending leaves (query already built above)
    pendingLeavesQuery,
    // 3. Kanban cards assigned to me
    supabase
      .from("kanban_cards")
      .select("*", { count: "exact", head: true })
      .eq("assigned_to", user.id),
    // 4. Active goals count
    (() => {
      let q = supabase
        .from("goals")
        .select("*", { count: "exact", head: true })
        .eq("status", "active");
      if (!userIsOps && deptId) q = q.eq("department_id", deptId);
      return q;
    })(),
  ]);

  // ── Task velocity (managers + OPS) ─────────────────────────────────────────
  let completedThisWeek = 0;
  let overdueTasks = 0;
  if (userIsManager || userIsOps) {
    const [{ count: completed }, { count: overdue }] = await Promise.all([
      admin
        .from("kanban_cards")
        .select("*", { count: "exact", head: true })
        .gte("completed_at", sevenDaysAgo),
      admin
        .from("kanban_cards")
        .select("*", { count: "exact", head: true })
        .lt("due_date", today)
        .is("completed_at", null),
    ]);
    completedThisWeek = completed ?? 0;
    overdueTasks = overdue ?? 0;
  }

  // ── Goal progress mini-list ────────────────────────────────────────────────
  let goalsList: {
    id: string;
    title: string;
    current_value: number;
    target_value: number;
    deadline: string;
    deadline_green_days: number | null;
    deadline_amber_days: number | null;
  }[] = [];
  {
    let goalsQ = supabase
      .from("goals")
      .select("id, title, current_value, target_value, deadline, deadline_green_days, deadline_amber_days")
      .eq("status", "active")
      .order("deadline", { ascending: true })
      .limit(5);
    if (!userIsOps && deptId) goalsQ = goalsQ.eq("department_id", deptId);
    const { data } = await goalsQ;
    goalsList = (data ?? []) as typeof goalsList;
  }

  // ── Department KPI health ──────────────────────────────────────────────────
  const kpiStatus: RagStatus = { green: 0, amber: 0, red: 0, noData: 0, total: 0 };
  let kpiStaleDays: number | undefined;
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

      // Latest entry per definition + track most recent date for staleness
      const latestMap: Record<string, number> = {};
      let newestDate: string | null = null;
      for (const e of latestEntries ?? []) {
        if (!(e.kpi_definition_id in latestMap)) {
          latestMap[e.kpi_definition_id] = e.value_numeric;
        }
        if (!newestDate || e.period_date > newestDate) {
          newestDate = e.period_date;
        }
      }

      // Data staleness warning
      if (newestDate) {
        kpiStaleDays = differenceInDays(new Date(), new Date(newestDate));
      }

      for (const def of defs) {
        const val = latestMap[def.id];
        if (val === undefined) { kpiStatus.noData++; continue; }
        const r = rag(val, def.threshold_green, def.threshold_amber, def.direction);
        kpiStatus[r]++;
      }
    }
  }

  // ── Announcements + OPS extras + Sales — parallelized ──────────────────────
  const announcementsPromise = supabase
    .from("announcements")
    .select("id, title, content, flair_text, flair_color, priority, created_at, department_id")
    .or(`department_id.is.null,department_id.eq.${deptId ?? "00000000-0000-0000-0000-000000000000"}`)
    .or("expires_at.is.null,expires_at.gt." + new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(3);

  const opsExtrasPromise = userIsOps
    ? Promise.all([
        admin
          .from("obs_alerts")
          .select("*", { count: "exact", head: true })
          .eq("acknowledged", false),
        admin
          .from("leaves")
          .select("*", { count: "exact", head: true })
          .eq("status", "pending"),
      ])
    : Promise.resolve([{ count: 0 }, { count: 0 }] as const);

  const salesPromise = (deptSlug === "sales" || userIsOps)
    ? admin
        .from("sales_daily_volume")
        .select("agent_id, pairs_sold, profiles(first_name, last_name)")
        .eq("date", today)
    : Promise.resolve({ data: null });

  const [
    { data: announcements },
    opsExtras,
    { data: volRows },
  ] = await Promise.all([announcementsPromise, opsExtrasPromise, salesPromise]);

  const obsAlertCount = userIsOps ? ((opsExtras as { count: number | null }[])[0]?.count ?? 0) : 0;
  const allPendingLeaves = userIsOps ? ((opsExtras as { count: number | null }[])[1]?.count ?? 0) : 0;

  const salesToday = (volRows ?? []).map((r) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = r.profiles as any;
    return {
      agent: p ? `${p.first_name} ${p.last_name}` : r.agent_id,
      pairs: r.pairs_sold,
    };
  }).sort((a, b) => b.pairs - a.pairs);

  const PRIORITY_STYLES: Record<string, string> = {
    urgent:    "border-l-4 border-red-400",
    important: "border-l-4 border-amber-400",
    normal:    "border-l-4 border-[var(--color-border-primary)]",
  };

  const showVelocity = userIsManager || userIsOps;

  return (
    <div className="space-y-6">
      {isBirthday && <ConfettiBirthday />}

      {/* Birthday banner */}
      {isBirthday && (
        <div className="rounded-[var(--radius-lg)] bg-gradient-to-r from-[#3A5635] to-[#4e7349] px-6 py-4 flex items-center gap-3">
          <span className="text-2xl">🎂</span>
          <div>
            <p className="text-white font-semibold text-base">Happy Birthday, {user.first_name}!</p>
            <p className="text-white/70 text-sm">Wishing you a wonderful day from the whole team.</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">
          {getGreeting()}, {user.first_name}
        </h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          {userIsOps
            ? "Platform overview · all departments"
            : `${user.department?.name ?? ""} · ${format(new Date(), "EEEE, d MMMM yyyy")}`}
        </p>
      </div>

      {/* Stat cards — 6 columns when manager/OPS (velocity cards), 4 otherwise */}
      <div className={`grid grid-cols-2 ${showVelocity ? "lg:grid-cols-6" : "lg:grid-cols-4"} gap-4`}>
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
        {showVelocity && (
          <>
            <StatCard
              label="Completed this week"
              value={completedThisWeek}
              sub="tasks finished (7d)"
              href="/productivity/kanban"
              accent={completedThisWeek > 0 ? "green" : undefined}
            />
            <StatCard
              label="Overdue tasks"
              value={overdueTasks}
              sub="past due date"
              href="/productivity/kanban"
              accent={overdueTasks > 0 ? "red" : undefined}
            />
          </>
        )}
      </div>

      {/* Goal progress mini-list */}
      {goalsList.length > 0 && (
        <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--color-border-secondary)] flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Goal progress</h2>
            <Link href="/analytics/goals" className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]">
              View all →
            </Link>
          </div>
          <div className="divide-y divide-[var(--color-border-secondary)]">
            {goalsList.map((g) => {
              const pct = g.target_value > 0 ? Math.min(100, Math.round((g.current_value / g.target_value) * 100)) : 0;
              const color = g.deadline
                ? goalRag(g.deadline, g.deadline_green_days, g.deadline_amber_days)
                : "green";
              const barColor =
                color === "green" ? "bg-[var(--color-success)]" : color === "amber" ? "bg-amber-400" : "bg-[var(--color-error)]";
              const badgeColor =
                color === "green"
                  ? "bg-[var(--color-success-light)] text-[var(--color-success)]"
                  : color === "amber"
                  ? "bg-[var(--color-warning-light)] text-[var(--color-warning-text)]"
                  : "bg-[var(--color-error-light)] text-[var(--color-error)]";
              const daysLeft = g.deadline ? differenceInDays(new Date(g.deadline), new Date()) : null;

              return (
                <div key={g.id} className="px-5 py-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-sm text-[var(--color-text-primary)] truncate flex-1 mr-3">{g.title}</p>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-semibold text-[var(--color-text-secondary)]">{pct}%</span>
                      {daysLeft != null && (
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${badgeColor}`}>
                          {daysLeft > 0 ? `${daysLeft}d left` : daysLeft === 0 ? "Due today" : `${Math.abs(daysLeft)}d overdue`}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="h-1.5 bg-[var(--color-bg-tertiary)] rounded-full overflow-hidden">
                    <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* OPS: observability alert banner */}
      {userIsOps && obsAlertCount > 0 && (
        <Link
          href="/admin/observability"
          className="flex items-center justify-between bg-[var(--color-error-light)] border border-red-200 rounded-[var(--radius-lg)] px-5 py-3 hover:bg-[var(--color-error-light)] transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-[var(--color-error)] animate-pulse" />
            <span className="text-sm font-medium text-[var(--color-error)]">
              {obsAlertCount} unacknowledged {obsAlertCount === 1 ? "alert" : "alerts"} in Observability
            </span>
          </div>
          <span className="text-xs text-[var(--color-error)]">View →</span>
        </Link>
      )}

      {/* KPI health */}
      {kpiStatus.total > 0 && (
        <KpiHealthBar
          status={kpiStatus}
          deptName={user.department?.name ?? "Department"}
          href="/analytics/kpis"
          staleDays={kpiStaleDays}
        />
      )}

      {/* Empty state guidance when no KPIs */}
      {kpiStatus.total === 0 && deptId && (userIsOps || userIsManager) && (
        <Link
          href="/analytics/kpis"
          className="block bg-[var(--color-bg-primary)] border border-dashed border-[var(--color-border-primary)] rounded-[var(--radius-lg)] px-5 py-4 hover:border-[var(--color-border-primary)] hover:bg-[var(--color-surface-hover)] transition-colors"
        >
          <p className="text-sm text-[var(--color-text-secondary)]">
            {userIsOps
              ? `Set up KPIs for ${user.department?.name ?? "this department"} →`
              : `Request KPI setup from OPS →`}
          </p>
          <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
            KPIs help track department performance with real-time health indicators.
          </p>
        </Link>
      )}

      {/* Sales today (sales dept or OPS) */}
      {(deptSlug === "sales" || userIsOps) && (
        <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--color-border-secondary)] flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Sales today</h2>
              <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">{format(new Date(), "EEEE d MMMM")}</p>
            </div>
            <Link href="/sales-ops/daily-volume" className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]">
              Log volume →
            </Link>
          </div>
          {salesToday.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-[var(--color-text-tertiary)]">
              No volume logged yet today.
            </div>
          ) : (
            <div className="divide-y divide-[var(--color-border-secondary)]">
              {salesToday.map((row) => (
                <div key={row.agent} className="px-5 py-3 flex items-center justify-between">
                  <span className="text-sm text-[var(--color-text-primary)]">{row.agent}</span>
                  <div className="flex items-center gap-3">
                    <span className={`text-sm font-semibold ${
                      row.pairs >= 8 ? "text-[var(--color-success)]" : row.pairs >= 6 ? "text-[var(--color-warning)]" : "text-[var(--color-error)]"
                    }`}>
                      {row.pairs} pairs
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      row.pairs >= 8
                        ? "bg-[var(--color-success-light)] text-[var(--color-success)]"
                        : row.pairs >= 6
                        ? "bg-[var(--color-warning-light)] text-[var(--color-warning-text)]"
                        : "bg-[var(--color-error-light)] text-[var(--color-error)]"
                    }`}>
                      {row.pairs >= 8 ? "On track" : row.pairs >= 6 ? "Monitor" : "Below target"}
                    </span>
                  </div>
                </div>
              ))}
              <div className="px-5 py-3 flex items-center justify-between bg-[var(--color-bg-secondary)]">
                <span className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide">Team total</span>
                <span className="text-sm font-bold text-[var(--color-text-primary)]">
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
          <h2 className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">Announcements</h2>
          <div className="space-y-2">
            {(announcements ?? []).map((a) => (
              <Link
                key={a.id}
                href="/communications/announcements"
                className={`block bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] px-5 py-3.5 hover:shadow-[var(--shadow-sm)] transition-shadow ${PRIORITY_STYLES[a.priority] ?? PRIORITY_STYLES.normal}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">{a.title}</p>
                      {a.flair_text && (
                        <span
                          className="text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0"
                          style={{
                            backgroundColor: a.flair_color ? `${a.flair_color}20` : "#e5e7eb",
                            color: a.flair_color ?? "#6b7280",
                          }}
                        >
                          {a.flair_text}
                        </span>
                      )}
                    </div>
                    {a.content && (
                      <p className="text-xs text-[var(--color-text-secondary)] mt-0.5 line-clamp-2">{a.content}</p>
                    )}
                  </div>
                  <span className="text-xs text-[var(--color-text-tertiary)] shrink-0 mt-0.5">
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
