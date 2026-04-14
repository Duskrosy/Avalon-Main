import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { OrdersView } from "./orders-view";

export default async function OrdersPage() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) redirect("/login");

  const admin = createAdminClient();

  const { data: orders } = await admin
    .from("ops_orders")
    .select(`
      *,
      assigned:profiles!assigned_to(id, first_name, last_name),
      items:ops_order_items(id)
    `)
    .order("created_at", { ascending: false })
    .limit(200);

  // Transform items array to count
  const rows = (orders ?? []).map((row) => ({
    ...row,
    item_count: Array.isArray(row.items) ? row.items.length : 0,
    items: undefined,
  }));

  // Fetch profiles for assignment dropdown
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, first_name, last_name")
    .eq("status", "active")
    .order("first_name");

  return (
    <OrdersView
      initialOrders={rows}
      profiles={profiles ?? []}
      currentUserId={user.id}
    />
  );
}
