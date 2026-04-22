import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { ReceiveClient } from "./receive-client";

export default async function ReceivePage() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data: locations } = await admin
    .from("inventory_locations")
    .select("id, location_code, location_name, location_type, is_source, sort_order")
    .eq("is_active", true)
    .order("sort_order");

  return <ReceiveClient locations={locations ?? []} />;
}
