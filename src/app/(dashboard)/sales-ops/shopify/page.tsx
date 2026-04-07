import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { ShopifyReconciliation } from "./shopify-reconciliation";

export default async function ShopifyPage() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) redirect("/login");

  const admin = createAdminClient();

  // ── Last sync run ─────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: lastSync } = await (admin as any)
    .from("shopify_sync_runs")
    .select("status, triggered_by, orders_synced, started_at, completed_at, error_log")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  type ShopifyOrderRow = {
    shopify_order_id: string;
    order_number: number;
    order_number_display: string;
    created_at_shopify: string;
    financial_status: string | null;
    fulfillment_status: string | null;
    total_price: number;
    first_line_item_name: string | null;
    total_quantity: number;
    customer_name: string | null;
  };

  // ── 1. Unmatched Shopify orders (in Shopify, not logged as confirmed sale) ─
  // Join shopify_orders against sales_confirmed_sales by normalised order number.
  // We fetch shopify_orders and then do the match in JS — Supabase PostgREST
  // doesn't support NOT EXISTS across tables, so we pull both sides and filter.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: allShopifyOrdersRaw } = await (admin as any)
    .from("shopify_orders")
    .select(
      "shopify_order_id, order_number, order_number_display, created_at_shopify, " +
      "financial_status, fulfillment_status, total_price, first_line_item_name, " +
      "total_quantity, customer_name",
    )
    .gte(
      "created_at_shopify",
      new Date(Date.now() - 90 * 86400000).toISOString(),
    )
    .order("created_at_shopify", { ascending: false });
  const allShopifyOrders = (allShopifyOrdersRaw ?? []) as ShopifyOrderRow[];

  // ── 2. Confirmed sales with numeric order IDs ──────────────────────────────
  const { data: confirmedSales } = await admin
    .from("sales_confirmed_sales")
    .select("id, order_id, confirmed_date, net_value, agent_id, profiles(first_name, last_name)")
    .gte("confirmed_date", new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10))
    .order("confirmed_date", { ascending: false });

  // ── Build lookup sets ─────────────────────────────────────────────────────
  // Normalise: strip all non-digits from order_id
  const loggedOrderNumbers = new Set<number>();
  for (const cs of confirmedSales ?? []) {
    const digits = cs.order_id.replace(/[^0-9]/g, "");
    const n = parseInt(digits, 10);
    if (!isNaN(n)) loggedOrderNumbers.add(n);
  }

  const shopifyOrderNumbers = new Set<number>(
    allShopifyOrders.map((o) => o.order_number),
  );

  // Tab 1: Shopify orders not logged
  const unmatchedOrders = allShopifyOrders.filter(
    (o) => !loggedOrderNumbers.has(o.order_number),
  );

  // Tab 2: Confirmed sales not found in Shopify (numeric order IDs only)
  const unverifiedSales = (confirmedSales ?? []).filter((cs) => {
    const digits = cs.order_id.replace(/[^0-9]/g, "");
    const n = parseInt(digits, 10);
    if (isNaN(n)) return false; // skip non-numeric (manual/external IDs)
    return !shopifyOrderNumbers.has(n);
  });

  // Tab 3: Value mismatches (both exist, net_value differs > ₱1)
  const shopifyPriceMap: Record<number, number> = {};
  for (const o of allShopifyOrders ?? []) {
    shopifyPriceMap[o.order_number] = Number(o.total_price);
  }
  const shopifyDisplayMap: Record<number, string> = {};
  for (const o of allShopifyOrders ?? []) {
    shopifyDisplayMap[o.order_number] = o.order_number_display ?? `#${o.order_number}`;
  }

  const mismatches = (confirmedSales ?? []).filter((cs) => {
    const digits = cs.order_id.replace(/[^0-9]/g, "");
    const n = parseInt(digits, 10);
    if (isNaN(n)) return false;
    const shopifyPrice = shopifyPriceMap[n];
    if (shopifyPrice === undefined) return false;
    return Math.abs(Number(cs.net_value) - shopifyPrice) > 1;
  }).map((cs) => {
    const digits = cs.order_id.replace(/[^0-9]/g, "");
    const n = parseInt(digits, 10);
    return {
      ...cs,
      shopify_price:          shopifyPriceMap[n] ?? 0,
      shopify_order_display:  shopifyDisplayMap[n] ?? `#${n}`,
      diff:                   Number(cs.net_value) - (shopifyPriceMap[n] ?? 0),
    };
  });

  const shopifyDomain = process.env.SHOPIFY_SHOP_DOMAIN ?? "";

  return (
    <ShopifyReconciliation
      lastSync={lastSync ?? null}
      unmatchedOrders={unmatchedOrders ?? []}
      unverifiedSales={unverifiedSales ?? []}
      mismatches={mismatches}
      shopifyDomain={shopifyDomain}
    />
  );
}
