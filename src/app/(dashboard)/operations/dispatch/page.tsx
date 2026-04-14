import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { DispatchView } from "./dispatch-view";

export default async function DispatchPage() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) redirect("/login");

  const admin = createAdminClient();

  const { data: dispatches } = await admin
    .from("dispatch_queue")
    .select(`
      *,
      order:ops_orders!order_id(id, order_number, customer_name, total_price),
      assigned:profiles!assigned_to(id, first_name, last_name)
    `)
    .order("created_at", { ascending: false })
    .limit(200);

  // Fetch profiles for assignment dropdown
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, first_name, last_name")
    .eq("status", "active")
    .order("first_name");

  // Fetch orders for the create-dispatch modal (only unfulfilled/partial)
  const { data: orders } = await admin
    .from("ops_orders")
    .select("id, order_number, customer_name, total_price")
    .in("fulfillment_status", ["unfulfilled", "partial"])
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <DispatchView
      initialDispatches={dispatches ?? []}
      profiles={profiles ?? []}
      orders={orders ?? []}
      currentUserId={user.id}
    />
  );
}
