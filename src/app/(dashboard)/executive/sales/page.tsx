import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import SalesTabView from "./sales-tab-view";

export default async function ExecutiveSalesPage() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
  const thisMonthStart = `${today.slice(0, 7)}-01`;
  const lastMonthStart = (() => {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 10);
  })();
  const lastMonthEnd = (() => {
    const d = new Date(); d.setDate(0);
    return d.toISOString().slice(0, 10);
  })();

  // Manila timezone bounds for Shopify
  const manilaThisMonthFrom = new Date(`${thisMonthStart}T00:00:00+08:00`).toISOString();
  const manilaThisMonthTo   = new Date(`${today}T23:59:59+08:00`).toISOString();
  const manilaLastMonthFrom = new Date(`${lastMonthStart}T00:00:00+08:00`).toISOString();
  const manilaLastMonthTo   = new Date(`${lastMonthEnd}T23:59:59+08:00`).toISOString();

  const [
    { data: volumeRows },
    { data: confirmedThisMonth },
    { data: confirmedLastMonth },
    { data: qaRows },
    { data: consistencyRows },
    { data: shopifyOrdersCur },
    { data: shopifyOrdersPrev },
  ] = await Promise.all([
    // 14 days of volume (7d + prior 7d for comparison)
    admin.from("sales_daily_volume")
      .select("date, agent_id, confirmed_regular, confirmed_total, confirmed_abandoned, on_leave, profiles(first_name, last_name)")
      .gte("date", fourteenDaysAgo)
      .order("date", { ascending: true }),

    // Confirmed sales this month
    admin.from("sales_confirmed_sales")
      .select("confirmed_date, net_value, quantity, sale_type, agent_id")
      .gte("confirmed_date", thisMonthStart)
      .eq("status", "confirmed")
      .order("confirmed_date", { ascending: false }),

    // Confirmed sales last month (for comparison)
    admin.from("sales_confirmed_sales")
      .select("net_value, quantity")
      .gte("confirmed_date", lastMonthStart)
      .lte("confirmed_date", lastMonthEnd)
      .eq("status", "confirmed"),

    // Recent QA logs
    admin.from("sales_qa_log")
      .select("score, evaluated_at, agent_id, profiles(first_name, last_name)")
      .gte("evaluated_at", sevenDaysAgo)
      .order("evaluated_at", { ascending: false })
      .limit(20),

    // Consistency this month
    admin.from("sales_consistency")
      .select("agent_id, consistent_days, total_days, profiles(first_name, last_name)")
      .gte("period_start", thisMonthStart)
      .order("consistent_days", { ascending: false })
      .limit(20),

    // Shopify orders this month
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any).from("shopify_orders")
      .select("total_price, created_at_shopify")
      .gte("created_at_shopify", manilaThisMonthFrom)
      .lte("created_at_shopify", manilaThisMonthTo)
      .order("created_at_shopify", { ascending: false }),

    // Shopify orders last month (for comparison)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any).from("shopify_orders")
      .select("total_price")
      .gte("created_at_shopify", manilaLastMonthFrom)
      .lte("created_at_shopify", manilaLastMonthTo),
  ]);

  // ── Process volume data ───────────────────────────────────────────────────

  // Daily totals for last 7 days
  const last7Days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    last7Days.push(d.toISOString().slice(0, 10));
  }

  const dailyTotals = last7Days.map((date) => {
    const rows = (volumeRows ?? []).filter((r) => r.date === date);
    return {
      date,
      label: format(new Date(date + "T00:00:00"), "EEE d"),
      total: rows.reduce((s, r) => s + (r.confirmed_regular ?? 0), 0),
      agents: rows.length,
    };
  });
  const maxDayTotal = Math.max(1, ...dailyTotals.map((d) => d.total));

  // Agent totals for last 7 days
  const agentMap: Record<string, { name: string; pairs: number; days: number }> = {};
  for (const row of (volumeRows ?? []).filter((r) => r.date >= sevenDaysAgo)) {
    const id = row.agent_id;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = row.profiles as any;
    const name = p ? `${p.first_name} ${p.last_name}` : id;
    if (!agentMap[id]) agentMap[id] = { name, pairs: 0, days: 0 };
    agentMap[id].pairs += row.confirmed_regular ?? 0;
    if (!row.on_leave && (row.confirmed_regular ?? 0) > 0) agentMap[id].days++;
  }
  const agentRanking = Object.values(agentMap).sort((a, b) => b.pairs - a.pairs);
  const maxAgentPairs = Math.max(1, ...agentRanking.map((a) => a.pairs));

  // Revenue comparison
  const revenueThisMonth = (confirmedThisMonth ?? []).reduce((s, r) => s + Number(r.net_value), 0);
  const revenueLastMonth = (confirmedLastMonth ?? []).reduce((s, r) => s + Number(r.net_value), 0);
  const revGrowth = revenueLastMonth > 0 ? ((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 100 : 0;

  const salesCountThis = (confirmedThisMonth ?? []).reduce((s, r) => s + (r.quantity ?? 1), 0);
  const salesCountLast = (confirmedLastMonth ?? []).reduce((s, r) => s + (r.quantity ?? 1), 0);

  // Today total
  const todayTotal = (volumeRows ?? []).filter((r) => r.date === today).reduce((s, r) => s + (r.confirmed_regular ?? 0), 0);
  const weekTotal  = dailyTotals.reduce((s, d) => s + d.total, 0);

  // QA average
  const qaAvg = (qaRows ?? []).length > 0
    ? (qaRows ?? []).reduce((s, r) => s + (r.score ?? 0), 0) / (qaRows ?? []).length
    : null;

  // Shopify metrics
  const shopifyRevenueThisMonth = (shopifyOrdersCur ?? []).reduce(
    (s: number, o: { total_price: string }) => s + Number(o.total_price ?? 0), 0
  );
  const shopifyRevenueLastMonth = (shopifyOrdersPrev ?? []).reduce(
    (s: number, o: { total_price: string }) => s + Number(o.total_price ?? 0), 0
  );
  const shopifyOrderCount = (shopifyOrdersCur ?? []).length;

  // Normalize consistency rows for client component
  const normalizedConsistency = (consistencyRows ?? []).map((r) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = r.profiles as any;
    return {
      agent_id: r.agent_id,
      consistent_days: r.consistent_days,
      total_days: r.total_days,
      name: p ? `${p.first_name} ${p.last_name}` : r.agent_id,
    };
  });

  // Normalize confirmed sales for client component
  const normalizedSales = (confirmedThisMonth ?? []).map((s) => ({
    confirmed_date: s.confirmed_date,
    agent_id: s.agent_id,
    sale_type: s.sale_type ?? null,
    quantity: s.quantity ?? null,
    net_value: String(s.net_value),
  }));

  return (
    <SalesTabView
      todayTotal={todayTotal}
      weekTotal={weekTotal}
      revenueThisMonth={revenueThisMonth}
      revenueLastMonth={revenueLastMonth}
      revGrowth={revGrowth}
      salesCountThis={salesCountThis}
      salesCountLast={salesCountLast}
      qaAvg={qaAvg}
      qaCount={(qaRows ?? []).length}
      dailyTotals={dailyTotals}
      agentRanking={agentRanking}
      confirmedSales={normalizedSales}
      consistencyRows={normalizedConsistency}
      today={today}
      maxDayTotal={maxDayTotal}
      maxAgentPairs={maxAgentPairs}
      shopifyRevenueThisMonth={shopifyRevenueThisMonth}
      shopifyRevenueLastMonth={shopifyRevenueLastMonth}
      shopifyOrderCount={shopifyOrderCount}
    />
  );
}
