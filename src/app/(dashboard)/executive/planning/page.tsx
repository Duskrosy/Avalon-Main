import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { redirect } from "next/navigation";
import Link from "next/link";
import { CalendarWidget } from "../calendar-widget";
import { LookAhead, computeAlerts } from "../look-ahead";
import { AttendanceCard } from "../attendance-card";
import { CeoPlanning } from "../ceo-planning";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CalEvent = any;

export default async function ExecutivePlanningPage() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);

  // Read featured-board setting (falls back to current user's board)
  const { data: setting } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", "executive_featured_user_id")
    .maybeSingle();
  const settingUserId =
    (setting?.value as { user_id?: string } | null)?.user_id ?? null;
  const featuredUserId = settingUserId ?? user.id;

  const [
    { count: headcount },
    { count: approvedLeavesToday },
    { data: calendarEventsRaw },
    { data: featuredBoard },
    { data: allProfiles },
  ] = await Promise.all([
    admin.from("profiles").select("*", { count: "exact", head: true }).is("deleted_at", null),
    admin
      .from("leaves")
      .select("*", { count: "exact", head: true })
      .eq("status", "approved")
      .lte("start_date", today)
      .gte("end_date", today),
    admin.from("calendar_events").select("*"),
    admin
      .from("kanban_boards")
      .select("id, owner_id")
      .eq("scope", "personal")
      .eq("owner_id", featuredUserId)
      .limit(1)
      .maybeSingle(),
    admin
      .from("profiles")
      .select("id, first_name, last_name, avatar_url, department_id")
      .is("deleted_at", null)
      .order("first_name"),
  ]);

  // Expand yearly recurring events to this year's instance
  const calEvents = ((calendarEventsRaw ?? []) as CalEvent[]).flatMap((evt: CalEvent) => {
    if (!evt.is_recurring || evt.recurrence_rule !== "yearly") return [evt];
    const origMonth = new Date(evt.event_date).getMonth();
    const origDay = new Date(evt.event_date).getDate();
    const year = new Date().getFullYear();
    return [{ ...evt, event_date: `${year}-${String(origMonth + 1).padStart(2, "0")}-${String(origDay).padStart(2, "0")}` }];
  });
  const lookAheadAlerts = computeAlerts(calEvents);

  // Featured kanban columns + owner
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let ceoPlanningColumns: any[] = [];
  let featuredOwner: { id: string; first_name: string; last_name: string } | null = null;
  if (featuredBoard?.id) {
    const [{ data: cols }, { data: ownerProfile }] = await Promise.all([
      admin
        .from("kanban_columns")
        .select("id, name, sort_order, kanban_cards(id, title, priority, due_date, sort_order)")
        .eq("board_id", featuredBoard.id)
        .order("sort_order"),
      admin
        .from("profiles")
        .select("id, first_name, last_name")
        .eq("id", featuredBoard.owner_id)
        .maybeSingle(),
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ceoPlanningColumns = (cols ?? []).map((c: any) => ({
      ...c,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cards: (c.kanban_cards ?? []).sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    }));
    featuredOwner = ownerProfile ?? null;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">Planning</h2>
          <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
            Your calendar, look-ahead alerts, and personal planning board.
          </p>
        </div>
        <Link
          href="/executive"
          className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]"
        >
          ← Back to Overview
        </Link>
      </div>

      {/* CEO Planning — full width */}
      <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4">
        <CeoPlanning
          columns={ceoPlanningColumns}
          allUsers={allProfiles ?? []}
          featuredUserId={featuredUserId}
          featuredOwner={featuredOwner}
          currentUserId={user.id}
          canManage={isOps(user)}
        />
      </div>

      {/* Calendar + Look Ahead */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <div className="lg:col-span-3 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4">
          <CalendarWidget events={calEvents} month={new Date()} />
        </div>
        <div className="lg:col-span-2 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4">
          <LookAhead alerts={lookAheadAlerts} />
        </div>
      </div>

      {/* Attendance */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <AttendanceCard headcount={headcount ?? 0} onLeaveToday={approvedLeavesToday ?? 0} />
      </div>
    </div>
  );
}
