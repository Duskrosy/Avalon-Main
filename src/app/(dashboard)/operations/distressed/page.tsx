import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { DistressedView } from "./distressed-view";

export default async function DistressedPage() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) redirect("/login");

  const admin = createAdminClient();

  const { data: parcels } = await admin
    .from("distressed_parcels")
    .select(`
      *,
      order:ops_orders!order_id(id, order_number, customer_name),
      creator:profiles!created_by(id, first_name, last_name)
    `)
    .order("created_at", { ascending: false });

  return (
    <DistressedView
      initialParcels={parcels ?? []}
      currentUserId={user.id}
    />
  );
}
