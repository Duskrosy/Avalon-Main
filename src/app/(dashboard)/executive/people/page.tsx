import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { format, parseISO } from "date-fns";

const LEAVE_COLORS: Record<string, string> = {
  sick:        "bg-red-100 text-red-700",
  vacation:    "bg-[var(--color-accent-light)] text-[var(--color-accent)]",
  emergency:   "bg-orange-100 text-orange-700",
  personal:    "bg-purple-100 text-purple-700",
  maternity:   "bg-pink-100 text-pink-700",
  paternity:   "bg-cyan-100 text-cyan-700",
  unpaid:      "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]",
};

const STATUS_COLORS: Record<string, string> = {
  pending:  "bg-amber-50 text-amber-700 border border-amber-200",
  approved: "bg-green-50 text-green-700 border border-green-200",
  rejected: "bg-red-50 text-red-700 border border-red-200",
};

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default async function ExecutivePeoplePage() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const thisMonthStart = `${today.slice(0, 7)}-01`;
  const sevenDaysAgo   = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const thirtyDaysAhead = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  const [
    { data: profiles },
    { data: departments },
    { data: pendingLeaves },
    { data: recentLeaves },
    { data: upcomingLeaves },
  ] = await Promise.all([
    admin.from("profiles")
      .select("id, first_name, last_name, department_id, is_active")
      .eq("is_active", true),

    admin.from("departments")
      .select("id, name, slug")
      .order("name"),

    admin.from("leaves")
      .select("id, user_id, leave_type, start_date, end_date, status, reason, profiles(first_name, last_name, department_id)")
      .eq("status", "pending")
      .order("created_at", { ascending: false }),

    admin.from("leaves")
      .select("id, user_id, leave_type, start_date, end_date, status, profiles(first_name, last_name, department_id)")
      .gte("start_date", sevenDaysAgo)
      .lte("start_date", today)
      .order("start_date", { ascending: false })
      .limit(10),

    admin.from("leaves")
      .select("id, user_id, leave_type, start_date, end_date, status, profiles(first_name, last_name, department_id)")
      .gt("start_date", today)
      .lte("start_date", thirtyDaysAhead)
      .eq("status", "approved")
      .order("start_date", { ascending: true })
      .limit(10),
  ]);

  const deptMap = Object.fromEntries((departments ?? []).map((d) => [d.id, d]));

  // ── Headcount by department ────────────────────────────────────────────────
  const headcountByDept: Record<string, number> = {};
  for (const p of profiles ?? []) {
    const deptId = p.department_id ?? "__none__";
    headcountByDept[deptId] = (headcountByDept[deptId] ?? 0) + 1;
  }
  const totalHeadcount = (profiles ?? []).length;
  const maxDeptCount = Math.max(1, ...Object.values(headcountByDept));

  // ── Leave type breakdown (this month) ─────────────────────────────────────
  const allLeaves = [...(pendingLeaves ?? []), ...(recentLeaves ?? [])];
  const leaveTypeCounts: Record<string, number> = {};
  for (const leave of allLeaves) {
    leaveTypeCounts[leave.leave_type] = (leaveTypeCounts[leave.leave_type] ?? 0) + 1;
  }
  const maxLeaveCount = Math.max(1, ...Object.values(leaveTypeCounts));

  // ── Currently on leave today ───────────────────────────────────────────────
  const onLeaveToday = (recentLeaves ?? []).filter(
    (l) => l.status === "approved" && l.start_date <= today && l.end_date >= today
  );

  return (
    <div className="space-y-6">

      {/* ── Summary cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: "Total headcount",
            value: totalHeadcount,
            sub: "active employees",
            accent: "text-[var(--color-text-primary)] bg-[var(--color-bg-primary)] border-[var(--color-border-primary)]",
          },
          {
            label: "Pending leaves",
            value: (pendingLeaves ?? []).length,
            sub: "awaiting approval",
            accent: (pendingLeaves ?? []).length > 0
              ? "text-amber-700 bg-amber-50 border-amber-200"
              : "text-[var(--color-text-primary)] bg-[var(--color-bg-primary)] border-[var(--color-border-primary)]",
          },
          {
            label: "On leave today",
            value: onLeaveToday.length,
            sub: "approved absences",
            accent: onLeaveToday.length > 0
              ? "text-orange-700 bg-orange-50 border-orange-200"
              : "text-[var(--color-text-primary)] bg-[var(--color-bg-primary)] border-[var(--color-border-primary)]",
          },
          {
            label: "Upcoming leaves",
            value: (upcomingLeaves ?? []).length,
            sub: "next 30 days",
            accent: "text-[var(--color-text-primary)] bg-[var(--color-bg-primary)] border-[var(--color-border-primary)]",
          },
        ].map((card) => (
          <div key={card.label} className={`rounded-xl border p-5 ${card.accent}`}>
            <p className="text-xs text-[var(--color-text-secondary)] font-medium uppercase tracking-wide mb-1">{card.label}</p>
            <p className={`text-3xl font-bold tracking-tight ${card.accent.split(" ").find(c => c.startsWith("text-")) ?? "text-[var(--color-text-primary)]"}`}>
              {card.value}
            </p>
            <p className="text-xs text-[var(--color-text-tertiary)] mt-1.5">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Headcount by department ─────────────────────────────────────── */}
      <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Headcount by department</h2>
          <span className="text-xs text-[var(--color-text-tertiary)]">{totalHeadcount} total</span>
        </div>
        <div className="space-y-3">
          {(departments ?? []).map((dept) => {
            const count = headcountByDept[dept.id] ?? 0;
            const pct = (count / maxDeptCount) * 100;
            return (
              <div key={dept.id} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[var(--color-text-primary)] font-medium">{dept.name}</span>
                  <span className="font-semibold text-[var(--color-text-primary)] tabular-nums">{count}</span>
                </div>
                <div className="h-2 bg-[var(--color-bg-tertiary)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[var(--color-text-primary)] rounded-full"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Pending leaves ──────────────────────────────────────────────── */}
      <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--color-border-secondary)] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Pending leave requests</h2>
          <span className="text-xs text-[var(--color-text-tertiary)]">{(pendingLeaves ?? []).length} pending</span>
        </div>
        {(pendingLeaves ?? []).length === 0 ? (
          <p className="px-5 py-8 text-sm text-[var(--color-text-tertiary)] text-center">No pending leave requests.</p>
        ) : (
          <div className="divide-y divide-[var(--color-border-secondary)]">
            {(pendingLeaves ?? []).slice(0, 8).map((leave) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const prof = leave.profiles as any;
              const name = prof ? `${prof.first_name} ${prof.last_name}` : "—";
              const dept = prof?.department_id ? deptMap[prof.department_id]?.name : "—";
              const colorClass = LEAVE_COLORS[leave.leave_type] ?? "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]";
              const days = Math.max(
                1,
                Math.round(
                  (new Date(leave.end_date).getTime() - new Date(leave.start_date).getTime()) / 86400000
                ) + 1
              );
              return (
                <div key={leave.id} className="px-5 py-3 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--color-text-primary)]">{name}</p>
                    <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">{dept}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colorClass} shrink-0`}>
                    {capitalize(leave.leave_type)}
                  </span>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-medium text-[var(--color-text-primary)]">
                      {format(parseISO(leave.start_date), "d MMM")}
                      {leave.end_date !== leave.start_date && (
                        <> – {format(parseISO(leave.end_date), "d MMM")}</>
                      )}
                    </p>
                    <p className="text-[10px] text-[var(--color-text-tertiary)]">{days} day{days !== 1 ? "s" : ""}</p>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[leave.status] ?? ""} shrink-0`}>
                    {capitalize(leave.status)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Two column: Leave breakdown + Upcoming ──────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Leave type breakdown */}
        <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-xl p-5">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)] mb-4">Leave breakdown · last 7 days + pending</h2>
          {Object.keys(leaveTypeCounts).length === 0 ? (
            <p className="text-sm text-[var(--color-text-tertiary)]">No leave data.</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(leaveTypeCounts)
                .sort(([, a], [, b]) => b - a)
                .map(([type, count]) => {
                  const pct = (count / maxLeaveCount) * 100;
                  const colorClass = LEAVE_COLORS[type] ?? "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]";
                  const barColor =
                    type === "sick"      ? "bg-red-400" :
                    type === "vacation"  ? "bg-blue-400" :
                    type === "emergency" ? "bg-orange-400" :
                    type === "personal"  ? "bg-purple-400" :
                    type === "maternity" ? "bg-pink-400" :
                    type === "paternity" ? "bg-cyan-400" :
                    "bg-gray-400";
                  return (
                    <div key={type} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colorClass}`}>
                          {capitalize(type)}
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
          )}
        </div>

        {/* Upcoming approved leaves */}
        <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--color-border-secondary)]">
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Upcoming approved leaves</h2>
            <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">Next 30 days</p>
          </div>
          {(upcomingLeaves ?? []).length === 0 ? (
            <p className="px-5 py-8 text-sm text-[var(--color-text-tertiary)] text-center">No upcoming leaves.</p>
          ) : (
            <div className="divide-y divide-[var(--color-border-secondary)]">
              {(upcomingLeaves ?? []).map((leave) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const prof = leave.profiles as any;
                const name = prof ? `${prof.first_name} ${prof.last_name}` : "—";
                const colorClass = LEAVE_COLORS[leave.leave_type] ?? "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]";
                const days = Math.max(
                  1,
                  Math.round(
                    (new Date(leave.end_date).getTime() - new Date(leave.start_date).getTime()) / 86400000
                  ) + 1
                );
                return (
                  <div key={leave.id} className="px-5 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--color-text-primary)]">{name}</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${colorClass}`}>
                        {capitalize(leave.leave_type)}
                      </span>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-medium text-[var(--color-text-primary)]">
                        {format(parseISO(leave.start_date), "d MMM")}
                        {leave.end_date !== leave.start_date && (
                          <> – {format(parseISO(leave.end_date), "d MMM")}</>
                        )}
                      </p>
                      <p className="text-[10px] text-[var(--color-text-tertiary)]">{days} day{days !== 1 ? "s" : ""}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
