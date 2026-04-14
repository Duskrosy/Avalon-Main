import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { redirect } from "next/navigation";
import CatalogView from "./catalog-view";

export default async function CatalogPage() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data: items } = await admin
    .from("catalog_items")
    .select("*")
    .order("product_name");

  return <CatalogView items={items ?? []} isOps={isOps(user)} />;
}
