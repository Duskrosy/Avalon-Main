import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { PicHandoffsView } from "../_pic-handoffs/pic-handoffs-view";

export default async function InventoryHandoffsPage() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) redirect("/login");
  return <PicHandoffsView bucket="inventory" />;
}
