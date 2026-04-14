import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { IssuesView } from "./issues-view";

export default async function IssuesPage() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) redirect("/login");

  const admin = createAdminClient();

  const { data: issues } = await admin
    .from("order_issues")
    .select(`
      *,
      order:ops_orders!order_id(id, order_number, customer_name),
      follow_up_owner_profile:profiles!follow_up_owner(id, first_name, last_name),
      created_by_profile:profiles!created_by(id, first_name, last_name)
    `)
    .order("created_at", { ascending: false })
    .limit(200);

  // Fetch orders for the create-issue dropdown
  const { data: orders } = await admin
    .from("ops_orders")
    .select("id, order_number, customer_name")
    .order("created_at", { ascending: false })
    .limit(500);

  // Fetch profiles for follow-up owner dropdown
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, first_name, last_name")
    .eq("status", "active")
    .order("first_name");

  return (
    <IssuesView
      initialIssues={issues ?? []}
      orders={orders ?? []}
      profiles={profiles ?? []}
      currentUserId={user.id}
    />
  );
}
