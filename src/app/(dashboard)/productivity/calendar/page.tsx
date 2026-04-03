import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { CalendarView } from "./calendar-view";

export default async function CalendarPage() {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) redirect("/login");

  const month = new Date().toISOString().slice(0, 7); // YYYY-MM

  // Fetch initial events for current month
  const [year, mon] = month.split("-").map(Number);
  const firstStr = `${month}-01`;
  const lastStr  = new Date(year, mon, 0).toISOString().split("T")[0];

  const [leavesRes, birthdaysRes, bookingsRes, cardsRes] = await Promise.all([
    supabase
      .from("leaves")
      .select("id, leave_type, start_date, end_date, profile:profiles!user_id(first_name, last_name)")
      .eq("status", "approved")
      .lte("start_date", lastStr)
      .gte("end_date", firstStr),
    supabase
      .from("profiles")
      .select("id, first_name, last_name, birthday")
      .eq("status", "active")
      .is("deleted_at", null)
      .not("birthday", "is", null),
    supabase
      .from("room_bookings")
      .select("id, title, start_time, room:rooms(name)")
      .gte("start_time", `${firstStr}T00:00:00Z`)
      .lte("start_time", `${lastStr}T23:59:59Z`),
    supabase
      .from("kanban_cards")
      .select("id, title, due_date")
      .not("due_date", "is", null)
      .gte("due_date", firstStr)
      .lte("due_date", lastStr),
  ]);

  // Build events server-side for initial render
  type CalendarEvent = {
    id: string; title: string; date: string;
    end_date?: string; type: string; color: string;
  };

  const events: CalendarEvent[] = [];

  for (const l of leavesRes.data ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = l.profile as any;
    const name = p ? `${p.first_name} ${p.last_name}` : "Someone";
    events.push({ id: l.id, title: `${name} — ${l.leave_type.replace(/_/g, " ")}`, date: l.start_date, end_date: l.end_date, type: "leave", color: "#f59e0b" });
  }

  for (const p of birthdaysRes.data ?? []) {
    const bday = new Date(p.birthday!);
    const bdayStr = new Date(year, bday.getMonth(), bday.getDate()).toISOString().split("T")[0];
    if (bdayStr >= firstStr && bdayStr <= lastStr) {
      events.push({ id: `bday-${p.id}`, title: `${p.first_name} ${p.last_name}'s birthday`, date: bdayStr, type: "birthday", color: "#ec4899" });
    }
  }

  for (const b of bookingsRes.data ?? []) {
    const date = new Date(b.start_time).toISOString().split("T")[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const room = b.room as any;
    events.push({ id: b.id, title: `${b.title}${room ? ` · ${room.name}` : ""}`, date, type: "booking", color: "#3b82f6" });
  }

  for (const c of cardsRes.data ?? []) {
    events.push({ id: c.id, title: c.title, date: c.due_date!, type: "task", color: "#8b5cf6" });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <CalendarView initialMonth={month} initialEvents={events as any} />;
}
