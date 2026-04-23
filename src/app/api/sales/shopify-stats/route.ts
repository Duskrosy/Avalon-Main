import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/permissions";
import { fetchAllRows } from "@/lib/supabase/paginate";
import { NextRequest, NextResponse } from "next/server";
import { fetchShopifyOrders } from "@/lib/shopify/client";

// ─── GET /api/sales/shopify-stats?from=YYYY-MM-DD&to=YYYY-MM-DD ──────────────
//
// Returns aggregated Shopify order stats for the given date range.
// - For ranges that include today: fetches live from Shopify API (+ DB fallback)
// - For past-only ranges: queries shopify_orders DB table
// Returns daily breakdown for charts.

function toManilaRange(from: string, to: string) {
  // Manila = UTC+8. Shopify stores UTC.
  const fromUTC = new Date(`${from}T00:00:00+08:00`).toISOString();
  const toUTC   = new Date(`${to}T23:59:59+08:00`).toISOString();
  return { fromUTC, toUTC };
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp   = req.nextUrl.searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const from  = sp.get("from") ?? today;
  const to    = sp.get("to")   ?? today;

  const { fromUTC, toUTC } = toManilaRange(from, to);

  // Compute previous period for comparison (same length window before `from`)
  const fromDate   = new Date(from);
  const toDate     = new Date(to);
  const rangeDays  = Math.ceil((toDate.getTime() - fromDate.getTime()) / 86400000) + 1;
  const prevFrom   = new Date(fromDate.getTime() - rangeDays * 86400000).toISOString().slice(0, 10);
  const prevTo     = new Date(fromDate.getTime() - 86400000).toISOString().slice(0, 10);
  const { fromUTC: prevFromUTC, toUTC: prevToUTC } = toManilaRange(prevFrom, prevTo);

  const admin = createAdminClient();

  // ── 1. DB query for selected range ────────────────────────────────────────
  type DbOrderRow = {
    order_number: number;
    total_price: string;
    financial_status: string | null;
    fulfillment_status: string | null;
    created_at_shopify: string;
    payment_gateway: string | null;
    total_quantity: number;
  };
  const dbOrders = await fetchAllRows<DbOrderRow>(() =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any)
      .from("shopify_orders")
      .select("order_number, total_price, financial_status, fulfillment_status, created_at_shopify, payment_gateway, total_quantity")
      .gte("created_at_shopify", fromUTC)
      .lte("created_at_shopify", toUTC)
      .order("created_at_shopify", { ascending: true }),
  );

  // ── 2. If range includes today: supplement with live Shopify data ─────────
  let liveOrders: { order_number: number; total_price: string; created_at: string; financial_status: string | null }[] = [];
  const includestoday = to >= today;
  if (includestoday) {
    try {
      const raw = await fetchShopifyOrders({
        createdAtMin: new Date(`${today}T00:00:00+08:00`).toISOString(),
        status: "any",
        limit: 250,
      });
      // Deduplicate against DB (DB is source of truth for older, live fills today's gap)
      const dbNums = new Set((dbOrders ?? []).map((o: { order_number: number }) => o.order_number));
      liveOrders = raw
        .filter((o) => !dbNums.has(o.order_number))
        .map((o) => ({
          order_number:     o.order_number,
          total_price:      o.total_price,
          created_at:       o.created_at,
          financial_status: o.financial_status,
        }));
    } catch {
      // Live fetch failed — DB data only
    }
  }

  // ── 3. DB query for previous period ──────────────────────────────────────
  const prevOrders = await fetchAllRows<{ total_price: string }>(() =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any)
      .from("shopify_orders")
      .select("total_price")
      .gte("created_at_shopify", prevFromUTC)
      .lte("created_at_shopify", prevToUTC),
  );

  // ── 4. Last sync info ─────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: lastSync } = await (admin as any)
    .from("shopify_sync_runs")
    .select("status, completed_at")
    .eq("status", "success")
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // ── 5. Compute current period metrics ─────────────────────────────────────
  const allCurrent = [
    ...(dbOrders ?? []).map((o: { total_price: string }) => Number(o.total_price ?? "0")),
    ...liveOrders.map((o) => Number(o.total_price ?? "0")),
  ];
  const totalSales   = allCurrent.reduce((s, v) => s + v, 0);
  const orderCount   = allCurrent.length;
  const avgOrderValue = orderCount > 0 ? totalSales / orderCount : 0;

  // ── 6. Previous period metrics ────────────────────────────────────────────
  const prevSales  = (prevOrders ?? []).reduce((s: number, o: { total_price: string }) => s + Number(o.total_price ?? "0"), 0);
  const prevCount  = (prevOrders ?? []).length;

  // ── 7. Daily breakdown for chart ──────────────────────────────────────────
  const dailyMap: Record<string, { sales: number; orders: number }> = {};

  // Fill all dates in range with zeros
  const cur = new Date(from);
  const end = new Date(to);
  while (cur <= end) {
    dailyMap[cur.toISOString().slice(0, 10)] = { sales: 0, orders: 0 };
    cur.setDate(cur.getDate() + 1);
  }

  // DB orders
  for (const o of dbOrders ?? []) {
    const d = new Date(o.created_at_shopify).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
    if (dailyMap[d]) {
      dailyMap[d].sales  += Number(o.total_price ?? "0");
      dailyMap[d].orders += 1;
    }
  }
  // Live orders (today only)
  for (const o of liveOrders) {
    const d = new Date(o.created_at).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
    if (dailyMap[d]) {
      dailyMap[d].sales  += Number(o.total_price ?? "0");
      dailyMap[d].orders += 1;
    }
  }

  const daily = Object.entries(dailyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, ...v }));

  // ── 8. Status breakdown ───────────────────────────────────────────────────
  const statusMap: Record<string, { count: number; total: number }> = {};
  for (const o of dbOrders ?? []) {
    const s = (o.financial_status ?? "unknown") as string;
    if (!statusMap[s]) statusMap[s] = { count: 0, total: 0 };
    statusMap[s].count++;
    statusMap[s].total += Number(o.total_price ?? "0");
  }

  return NextResponse.json({
    total_sales:    totalSales,
    order_count:    orderCount,
    avg_order_value: avgOrderValue,
    prev_sales:     prevSales,
    prev_count:     prevCount,
    sales_change_pct: prevSales > 0 ? ((totalSales - prevSales) / prevSales) * 100 : null,
    orders_change_pct: prevCount > 0 ? ((orderCount - prevCount) / prevCount) * 100 : null,
    daily,
    status_breakdown: statusMap,
    has_live_data:  liveOrders.length > 0,
    live_order_count: liveOrders.length,
    last_synced:    lastSync?.completed_at ?? null,
    range: { from, to, prev_from: prevFrom, prev_to: prevTo },
  });
}
