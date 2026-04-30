import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { ConfirmedOrdersView } from "./confirmed-orders-view";

export default async function ConfirmedOrdersPage() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) redirect("/login");
  return <ConfirmedOrdersView currentUserId={user.id} />;
}
