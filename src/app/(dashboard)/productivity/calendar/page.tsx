import { format } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { CalendarView } from "./calendar-view";
import { LookAhead, computeAlerts } from "@/app/(dashboard)/executive/look-ahead";

const PLATFORM_COLORS: Record<string, string> = {
  facebook: "#1877F2",
  instagram: "#E1306C",
  tiktok: "#010101",
  youtube: "#FF0000",
};

export default async function CalendarPage() {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) redirect("/login");

  const ops = isOps(currentUser);
  const deptId = currentUser.department_id;

  // Get dept slug to determine SMM post visibility
  let deptSlug: string | null = null;
  if (deptId) {
    const { data: deptRow } = await supabase
      .from("departments")
      .select("slug")
      .eq("id", deptId)
      .maybeSingle();
    deptSlug = deptRow?.slug ?? null;
  }
  const showSmmPosts = ops || ["creatives", "marketing", "ad-ops"].includes(deptSlug ?? "");

  const month = format(new Date(), "yyyy-MM");
  const [year, mon] = month.split("-").map(Number);
  const firstStr = `${month}-01`;
  const lastStr  = format(new Date(year, mon, 0), "yyyy-MM-dd");

  // Leaves (approved + pre_approved)
  let leavesQ = supabase
    .from("leaves")
    .select("id, leave_type, start_date, end_date, status, profile:profiles!user_id(first_name, last_name, department_id)")
    .in("status", ["approved", "pre_approved"])
    .lte("start_date", lastStr)
    .gte("end_date", firstStr);

  // Birthdays
  let birthdaysQ = supabase
    .from("profiles")
    .select("id, first_name, last_name, birthday, department_id")
    .eq("status", "active")
    .is("deleted_at", null)
    .not("birthday", "is", null);
  if (!ops && deptId) birthdaysQ = birthdaysQ.eq("department_id", deptId);

  // Room bookings (shared)
  const bookingsQ = supabase
    .from("room_bookings")
    .select("id, title, start_time, room:rooms(name)")
    .gte("start_time", `${firstStr}T00:00:00Z`)
    .lte("start_time", `${lastStr}T23:59:59Z`);

  // Kanban cards
  let cardsQ = supabase
    .from("kanban_cards")
    .select(`id, title, due_date, column:kanban_columns!inner(board:kanban_boards!inner(department_id))`)
    .not("due_date", "is", null)
    .gte("due_date", firstStr)
    .lte("due_date", lastStr);
  if (!ops && deptId) cardsQ = cardsQ.eq("column.board.department_id", deptId);

  // Calendar settings
  const { data: calSettingsRow } = await supabase
    .from("user_calendar_settings")
    .select("*")
    .eq("user_id", currentUser.id)
    .maybeSingle();

  const calSettings = calSettingsRow ?? {
    show_tasks: true,
    show_leaves: true,
    show_rooms: true,
    show_birthdays: true,
    show_posts: true,
  };

  const [leavesRes, birthdaysRes, bookingsRes, cardsRes] = await Promise.all([
    leavesQ, birthdaysQ, bookingsQ, cardsQ,
  ]);

  type CalendarEvent = {
    id: string; title: string; date: string;
    end_date?: string; type: string; color: string; meta?: string;
  };

  const events: CalendarEvent[] = [];

  for (const l of leavesRes.data ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = l.profile as any;
    if (!ops && p?.department_id && p.department_id !== deptId) continue;
    const name = p ? `${p.first_name} ${p.last_name}` : "Someone";
    const isPreApproved = l.status === "pre_approved";
    events.push({
      id: l.id,
      title: `${name} — ${l.leave_type.replace(/_/g, " ")}${isPreApproved ? " (pending)" : ""}`,
      date: l.start_date,
      end_date: l.end_date,
      type: "leave",
      color: isPreApproved ? "#fcd34d" : "#f59e0b",
    });
  }

  for (const p of birthdaysRes.data ?? []) {
    const [, bmm, bdd] = (p.birthday as string).split("-");
    const bdayStr = `${year}-${bmm}-${bdd}`;
    if (bdayStr >= firstStr && bdayStr <= lastStr) {
      events.push({ id: `bday-${p.id}`, title: `${p.first_name} ${p.last_name}'s birthday`, date: bdayStr, type: "birthday", color: "#ec4899" });
    }
  }

  for (const b of bookingsRes.data ?? []) {
    const date = format(new Date(b.start_time), "yyyy-MM-dd");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const room = b.room as any;
    events.push({ id: b.id, title: `${b.title}${room ? ` · ${room.name}` : ""}`, date, type: "booking", color: "#3b82f6" });
  }

  for (const c of cardsRes.data ?? []) {
    events.push({ id: c.id, title: c.title, date: c.due_date!, type: "task", color: "#8b5cf6" });
  }

  // SMM posts — only for creatives, marketing, ad-ops, OPS
  if (showSmmPosts) {
    const { data: posts } = await supabase
      .from("smm_posts")
      .select("id, platform, post_type, caption, scheduled_at, group:smm_groups(name)")
      .in("status", ["scheduled", "published"])
      .not("scheduled_at", "is", null)
      .gte("scheduled_at", `${firstStr}T00:00:00Z`)
      .lte("scheduled_at", `${lastStr}T23:59:59Z`);

    for (const p of posts ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const group = p.group as any;
      const dateStr = format(new Date(p.scheduled_at!), "yyyy-MM-dd");
      const platformLabel = p.platform.charAt(0).toUpperCase() + p.platform.slice(1);
      const captionPreview = p.caption ? ` — ${p.caption.slice(0, 40)}${p.caption.length > 40 ? "…" : ""}` : "";
      events.push({
        id: `post-${p.id}`,
        title: `${platformLabel}${captionPreview}`,
        date: dateStr,
        type: "post",
        color: PLATFORM_COLORS[p.platform] ?? "#6b7280",
        meta: `${group?.name ?? ""}${p.post_type ? ` · ${p.post_type.replace(/_/g, " ")}` : ""}`,
      });
    }
  }

  // Look-ahead: upcoming holidays and sales in the next 14 days
  const { data: upcomingCalEvents } = await supabase
    .from("calendar_events")
    .select("id, title, event_date, event_type, is_recurring, recurrence_rule")
    .in("event_type", ["holiday", "sale_event"]);

  const thisYear = new Date().getFullYear();
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const expandedForLookAhead = (upcomingCalEvents ?? []).map((e) => {
    if (e.is_recurring && e.recurrence_rule === "yearly") {
      const [, mm, dd] = (e.event_date as string).split("-");
      const projected = `${thisYear}-${mm}-${dd}`;
      return { ...e, event_date: projected < todayStr ? `${thisYear + 1}-${mm}-${dd}` : projected };
    }
    return e;
  });

  const lookAheadAlerts = computeAlerts(expandedForLookAhead);

  // Include holidays and sale events in initial calendar events
  for (const ce of upcomingCalEvents ?? []) {
    if (!["holiday", "sale_event"].includes(ce.event_type as string)) continue;
    const parts = (ce.event_date as string).split("-");
    const eventDate =
      ce.is_recurring && ce.recurrence_rule === "yearly"
        ? `${year}-${parts[1]}-${parts[2]}`
        : (ce.event_date as string);
    if (eventDate < firstStr || eventDate > lastStr) continue;
    events.push({
      id: `cal-${ce.id}`,
      title: ce.title as string,
      date: eventDate,
      type: ce.event_type as string,
      color: ce.event_type === "sale_event" ? "#f97316" : "#ef4444",
    });
  }

  return (
    <div>
      {lookAheadAlerts.length > 0 && (
        <div className="mb-4 p-4 rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]">
          <LookAhead alerts={lookAheadAlerts} />
        </div>
      )}
      <CalendarView
        initialMonth={month}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        initialEvents={events as any}
        showSmmPosts={showSmmPosts}
        settings={calSettings}
      />
    </div>
  );
}
