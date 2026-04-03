import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isManagerOrAbove } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { QaLogView } from "./qa-log-view";

export default async function QaLogPage() {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) redirect("/login");

  const { data: salesDept } = await supabase
    .from("departments")
    .select("id")
    .eq("slug", "sales")
    .single();

  const { data: agents } = salesDept
    ? await supabase
        .from("profiles")
        .select("id, first_name, last_name, email")
        .eq("department_id", salesDept.id)
        .eq("status", "active")
        .order("first_name")
    : { data: [] };

  return (
    <QaLogView
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      agents={(agents ?? []) as any}
      canManage={isManagerOrAbove(currentUser)}
    />
  );
}
