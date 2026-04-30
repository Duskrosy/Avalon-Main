import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { OrderAdjustmentsView } from "./order-adjustments-view";

export default async function OrderAdjustmentsPage() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) redirect("/login");

  return <OrderAdjustmentsView currentUserId={user.id} />;
}
