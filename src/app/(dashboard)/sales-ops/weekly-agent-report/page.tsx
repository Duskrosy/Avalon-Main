import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { WeeklyReportView } from "./weekly-report-view";

export default async function WeeklyAgentReportPage() {
  const supabase = await createClient();
  const admin = createAdminClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) redirect("/login");

  const { data: salesDept } = await admin
    .from("departments")
    .select("id")
    .eq("slug", "sales")
    .single();

  const { data: agents } = await admin
    .from("profiles")
    .select("id, first_name, last_name")
    .eq("status", "active")
    .eq("department_id", salesDept?.id ?? "")
    .is("deleted_at", null)
    .order("first_name");

  return <WeeklyReportView agents={(agents ?? []) as { id: string; first_name: string; last_name: string }[]} />;
}
