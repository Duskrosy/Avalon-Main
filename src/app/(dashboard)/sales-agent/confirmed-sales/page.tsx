import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isManagerOrAbove } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { ConfirmedSalesView } from "./confirmed-sales-view";

export default async function ConfirmedSalesPage() {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) redirect("/login");

  return (
    <ConfirmedSalesView
      currentUserId={currentUser.id}
      canManage={isManagerOrAbove(currentUser)}
    />
  );
}
