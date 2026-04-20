import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps } from "@/lib/permissions";

export type CalendarEvent = {
  id: string;
  title: string;
  date: string;       // YYYY-MM-DD
  end_date?: string;
  type: "leave" | "booking" | "birthday" | "task" | "post" | "holiday" | "sale_event";
  color: string;
  meta?: string;      // extra context (platform, room name, etc.)
};

const PLATFORM_COLORS: Record<string, string> = {
  facebook: "#1877F2",
  instagram: "#E1306C",
  tiktok: "#010101",
  youtube: "#FF0000",
};

// GET /api/calendar?month=YYYY-MM
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month") ?? new Date().toISOString().slice(0, 7);

  const [year, mon] = month.split("-").map(Number);
  const firstDay = new Date(year, mon - 1, 1);
  const lastDay  = new Date(year, mon, 0, 23, 59, 59);
  const firstStr = firstDay.toISOString().split("T")[0];
  const lastStr  = lastDay.toISOString().split("T")[0];

  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ops = isOps(currentUser);
  const deptId = currentUser.department_id;

  // Get current user's department slug (for SMM post check)
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

  const events: CalendarEvent[] = [];

  // --- LEAVES (approved + pre_approved) ---
  const { data: leaves } = await supabase
    .from("leaves")
    .select("id, leave_type, start_date, end_date, status, profile:profiles!user_id(id, first_name, last_name, department_id)")
    .in("status", ["approved", "pre_approved"])
    .lte("start_date", lastStr)
    .gte("end_date", firstStr);

  for (const l of leaves ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const profile = l.profile as any;
    // Non-OPS: only show leaves from own department
    if (!ops && profile?.department_id && profile.department_id !== deptId) continue;
    const name = profile ? `${profile.first_name} ${profile.last_name}` : "Someone";
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

  // --- BIRTHDAYS ---
  let birthdaysQuery = supabase
    .from("profiles")
    .select("id, first_name, last_name, birthday, department_id")
    .eq("status", "active")
    .is("deleted_at", null)
    .not("birthday", "is", null);

  const { data: birthdays } = await birthdaysQuery;

  for (const p of birthdays ?? []) {
    const [, bmm, bdd] = (p.birthday as string).split("-");
    const bdayStr = `${year}-${bmm}-${bdd}`;
    if (bdayStr >= firstStr && bdayStr <= lastStr) {
      events.push({
        id: `bday-${p.id}`,
        title: `${p.first_name} ${p.last_name}'s birthday`,
        date: bdayStr,
        type: "birthday",
        color: "#ec4899",
      });
    }
  }

  // --- ROOM BOOKINGS (shared — all depts see these) ---
  const { data: bookings } = await supabase
    .from("room_bookings")
    .select("id, title, start_time, room:rooms(name)")
    .gte("start_time", `${firstStr}T00:00:00Z`)
    .lte("start_time", `${lastStr}T23:59:59Z`);

  for (const b of bookings ?? []) {
    const date = new Date(b.start_time).toISOString().split("T")[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const room = b.room as any;
    events.push({
      id: b.id,
      title: `${b.title}${room ? ` · ${room.name}` : ""}`,
      date,
      type: "booking",
      color: "#3b82f6",
    });
  }

  // --- KANBAN TASKS with due_date ---
  let cardsQuery = supabase
    .from("kanban_cards")
    .select(`
      id, title, due_date,
      column:kanban_columns!inner(
        board:kanban_boards!inner(department_id)
      )
    `)
    .not("due_date", "is", null)
    .gte("due_date", firstStr)
    .lte("due_date", lastStr);

  // Non-OPS: filter to own dept's boards
  if (!ops && deptId) {
    cardsQuery = cardsQuery.eq("column.board.department_id", deptId);
  }

  const { data: cards } = await cardsQuery;

  for (const c of cards ?? []) {
    events.push({
      id: c.id,
      title: c.title,
      date: c.due_date!,
      type: "task",
      color: "#8b5cf6",
    });
  }

  // --- SMM POSTS (scheduled/published) — creatives, marketing, ad-ops, OPS ---
  if (showSmmPosts) {
    const { data: posts, error: postsErr } = await supabase
      .from("smm_posts")
      .select("id, platform, post_type, status, caption, scheduled_at, group:smm_groups(name)")
      .in("status", ["scheduled", "published"])
      .not("scheduled_at", "is", null)
      .gte("scheduled_at", `${firstStr}T00:00:00Z`)
      .lte("scheduled_at", `${lastStr}T23:59:59Z`);

    if (!postsErr) {
      for (const p of posts ?? []) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const group = p.group as any;
        const dateStr = new Date(p.scheduled_at!).toISOString().split("T")[0];
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
  }

  // --- CALENDAR EVENTS (holidays, sale events) ---
  const { data: calEvents } = await supabase
    .from("calendar_events")
    .select("id, title, event_date, end_date, event_type, is_recurring, recurrence_rule")
    .in("event_type", ["holiday", "sale_event"]);

  for (const ce of calEvents ?? []) {
    const parts = (ce.event_date as string).split("-");
    const eventDate =
      ce.is_recurring && ce.recurrence_rule === "yearly"
        ? `${year}-${parts[1]}-${parts[2]}`
        : (ce.event_date as string);

    if (eventDate < firstStr || eventDate > lastStr) continue;

    const endDate = ce.end_date
      ? ce.is_recurring && ce.recurrence_rule === "yearly"
        ? (() => {
            const ep = (ce.end_date as string).split("-");
            return `${year}-${ep[1]}-${ep[2]}`;
          })()
        : (ce.end_date as string)
      : undefined;

    events.push({
      id: `cal-${ce.id}`,
      title: ce.title as string,
      date: eventDate,
      ...(endDate ? { end_date: endDate } : {}),
      type: ce.event_type as "holiday" | "sale_event",
      color: ce.event_type === "sale_event" ? "#f97316" : "#ef4444",
    });
  }

  return NextResponse.json(events);
}
