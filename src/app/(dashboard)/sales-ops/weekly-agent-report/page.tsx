import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { WeeklyReportView } from "./weekly-report-view";

export default async function WeeklyAgentReportPage() {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) redirect("/login");

  const { data: agents } = await supabase
    .from("profiles")
    .select("id, first_name, last_name")
    .eq("status", "active")
    .eq("department_id", (
      await supabase.from("departments").select("id").eq("slug", "sales").single()
    ).data?.id ?? "")
    .order("first_name");

  return <WeeklyReportView agents={(agents ?? []) as { id: string; first_name: string; last_name: string }[]} />;
}
