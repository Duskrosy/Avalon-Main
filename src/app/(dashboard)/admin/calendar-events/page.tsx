import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { EventsView } from "./events-view";

export type CalendarEventRow = {
  id: string;
  title: string;
  event_date: string;
  end_date: string | null;
  event_type: "sale_event" | "holiday" | "company" | "custom";
  is_recurring: boolean;
  recurrence_rule: string | null;
  description: string | null;
  created_at: string;
};

export default async function CalendarEventsAdminPage() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) redirect("/login");
  if (!isOps(user)) redirect("/");

  const admin = createAdminClient();
  const { data: events } = await admin
    .from("calendar_events")
    .select("id, title, event_date, end_date, event_type, is_recurring, recurrence_rule, description, created_at")
    .order("event_date", { ascending: true });

  return <EventsView initialEvents={(events ?? []) as CalendarEventRow[]} />;
}
