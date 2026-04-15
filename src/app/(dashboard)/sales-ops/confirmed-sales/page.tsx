import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isManagerOrAbove } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { ConfirmedSalesView } from "./confirmed-sales-view";

export default async function ConfirmedSalesPage() {
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

  const currentMonth = new Date().toISOString().slice(0, 7);
  const { data: initialRows } = await supabase
    .from("sales_confirmed_sales")
    .select("*")
    .gte("confirmed_date", `${currentMonth}-01`)
    .lte("confirmed_date", `${currentMonth}-31`)
    .eq("agent_id", currentUser.id)
    .order("confirmed_date", { ascending: false });

  return (
    <ConfirmedSalesView
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      agents={(agents ?? []) as any}
      currentUserId={currentUser.id}
      canManage={isManagerOrAbove(currentUser)}
      initialRows={initialRows ?? []}
    />
  );
}
