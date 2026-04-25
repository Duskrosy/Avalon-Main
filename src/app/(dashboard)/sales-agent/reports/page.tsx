import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isManagerOrAbove } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { ReportsView } from "./reports-view";

export default async function ReportsPage() {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) redirect("/login");
  return <ReportsView canManage={isManagerOrAbove(currentUser)} />;
}
