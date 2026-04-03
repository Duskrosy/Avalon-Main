import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isManagerOrAbove } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { FpsDailyView } from "./fps-daily-view";

export default async function FpsDailyPage() {
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
    <FpsDailyView
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      agents={(agents ?? []) as any}
      currentUserId={currentUser.id}
      canManage={isManagerOrAbove(currentUser)}
    />
  );
}
