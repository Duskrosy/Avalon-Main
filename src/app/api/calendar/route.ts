import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";

export type CalendarEvent = {
  id: string;
  title: string;
  date: string;       // YYYY-MM-DD
  end_date?: string;
  type: "leave" | "booking" | "birthday" | "task";
  color: string;
  meta?: string;
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

  const events: CalendarEvent[] = [];

  // --- LEAVES ---
  const { data: leaves } = await supabase
    .from("leaves")
    .select("id, leave_type, start_date, end_date, profile:profiles!user_id(first_name, last_name)")
    .eq("status", "approved")
    .lte("start_date", lastStr)
    .gte("end_date", firstStr);

  for (const l of leaves ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const profile = l.profile as any;
    const name = profile ? `${profile.first_name} ${profile.last_name}` : "Someone";
    events.push({
      id: l.id,
      title: `${name} — ${l.leave_type.replace(/_/g, " ")}`,
      date: l.start_date,
      end_date: l.end_date,
      type: "leave",
      color: "#f59e0b",
    });
  }

  // --- BIRTHDAYS ---
  const { data: birthdays } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, birthday")
    .eq("status", "active")
    .is("deleted_at", null)
    .not("birthday", "is", null);

  for (const p of birthdays ?? []) {
    const bday = new Date(p.birthday!);
    const bdayThisYear = new Date(year, bday.getMonth(), bday.getDate());
    const bdayStr = bdayThisYear.toISOString().split("T")[0];
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

  // --- ROOM BOOKINGS ---
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
  const { data: cards } = await supabase
    .from("kanban_cards")
    .select(`
      id, title, due_date,
      column:kanban_columns(board:kanban_boards(department_id))
    `)
    .not("due_date", "is", null)
    .gte("due_date", firstStr)
    .lte("due_date", lastStr);

  for (const c of cards ?? []) {
    events.push({
      id: c.id,
      title: c.title,
      date: c.due_date!,
      type: "task",
      color: "#8b5cf6",
    });
  }

  return NextResponse.json(events);
}
