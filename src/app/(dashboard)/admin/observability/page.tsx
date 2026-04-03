import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { ObsDashboard } from "./obs-dashboard";

export default async function ObservabilityPage() {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) redirect("/login");
  if (!isOps(currentUser)) redirect("/");

  return <ObsDashboard />;
}
