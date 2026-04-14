import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { CourierView } from "./courier-view";

export default async function CourierPage() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) redirect("/login");

  const admin = createAdminClient();

  // Fetch dispatches that have tracking numbers
  const { data: dispatches } = await admin
    .from("dispatch_queue")
    .select(`
      *,
      order:ops_orders!order_id(id, order_number, customer_name, total_price)
    `)
    .not("tracking_number", "is", null)
    .order("created_at", { ascending: false })
    .limit(200);

  // Fetch latest courier_event per dispatch
  const dispatchIds = (dispatches ?? []).map((d) => d.id);
  let latestEvents: Record<string, any> = {};

  if (dispatchIds.length > 0) {
    const { data: allEvents } = await admin
      .from("courier_events")
      .select("*")
      .in("dispatch_id", dispatchIds)
      .order("event_time", { ascending: false });

    for (const ev of allEvents ?? []) {
      if (!latestEvents[ev.dispatch_id]) {
        latestEvents[ev.dispatch_id] = ev;
      }
    }
  }

  // Merge latest event onto each dispatch
  const shipments = (dispatches ?? []).map((d) => ({
    ...d,
    latest_event: latestEvents[d.id] ?? null,
  }));

  return <CourierView initialShipments={shipments} />;
}
