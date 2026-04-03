import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isManagerOrAbove } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { SalesDashboard } from "./sales-dashboard";

export default async function SalesOpsPage() {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) redirect("/login");

  const currentMonth = new Date().toISOString().slice(0, 7);

  const { data: salesDept } = await supabase
    .from("departments")
    .select("id")
    .eq("slug", "sales")
    .single();

  if (!salesDept) {
    return (
      <div className="p-12 text-center text-gray-400 text-sm">
        Sales department not found in database.
      </div>
    );
  }

  const [
    { data: agents },
    { data: volumeRows },
    { data: payouts },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, first_name, last_name, email")
      .eq("department_id", salesDept.id)
      .eq("status", "active")
      .order("first_name"),
    supabase
      .from("sales_daily_volume")
      .select("agent_id, confirmed_regular, confirmed_total, confirmed_abandoned, follow_ups, on_leave, date")
      .gte("date", `${currentMonth}-01`)
      .lte("date", `${currentMonth}-31`),
    supabase
      .from("sales_incentive_payouts")
      .select("agent_id, total_payout, gate_passed, final_fps, payout_tier, status, month")
      .eq("month", currentMonth),
  ]);

  return (
    <SalesDashboard
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      agents={(agents ?? []) as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      volumeRows={(volumeRows ?? []) as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      payouts={(payouts ?? []) as any}
      canManage={isManagerOrAbove(currentUser)}
      currentMonth={currentMonth}
    />
  );
}
