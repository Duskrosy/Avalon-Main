import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";
import { redirect } from "next/navigation";
import InventoryView from "./inventory-view";

export default async function InventoryPage() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data: records } = await admin
    .from("inventory_records")
    .select(
      "*, catalog:catalog_items(id, sku, product_name, color, size, product_family)"
    )
    .order("catalog_item_id");

  return <InventoryView records={records ?? []} />;
}
