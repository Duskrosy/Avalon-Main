import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { fetchShopifyOrderByNumber } from "@/lib/shopify/client";

// ─── GET /api/sales/shopify-order?order_number=1234 ───────────────────────────
//
// Lookup a single Shopify order for auto-fill in the confirmed sales form.
// Strategy: DB-first (returns instantly from synced cache), falls back to live API.
// Returns a consistent shape regardless of source.

export async function GET(req: NextRequest) {
  // Any authenticated user can look up orders (agents need this in the form)
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = req.nextUrl.searchParams.get("order_number") ?? "";

  // Normalise: strip #, spaces, non-digits
  const cleaned = raw.replace(/[^0-9]/g, "").trim();
  const orderNum = parseInt(cleaned, 10);

  if (!cleaned || isNaN(orderNum)) {
    return NextResponse.json({ found: false, source: null, order: null });
  }

  // ── 1. DB-first lookup ────────────────────────────────────────────────────
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: dbRow } = await (admin as any)
    .from("shopify_orders")
    .select(
      "order_number, total_price, first_line_item_name, total_quantity, " +
      "payment_gateway, financial_status, fulfillment_status, customer_name, " +
      "attributed_agent_id, attributed_agent_handle, shopify_order_id",
    )
    .eq("order_number", orderNum)
    .maybeSingle();

  if (dbRow) {
    return NextResponse.json({
      found: true,
      source: "db",
      order: {
        shopify_order_id:        dbRow.shopify_order_id,
        order_number:            dbRow.order_number,
        quantity:                dbRow.total_quantity,
        net_value:               Number(dbRow.total_price),
        design:                  dbRow.first_line_item_name ?? null,
        payment_mode:            dbRow.payment_gateway ?? null,
        financial_status:        dbRow.financial_status ?? null,
        fulfillment_status:      dbRow.fulfillment_status ?? null,
        customer_name:           dbRow.customer_name ?? null,
        attributed_agent_id:     dbRow.attributed_agent_id ?? null,
        attributed_agent_handle: dbRow.attributed_agent_handle ?? null,
      },
    });
  }

  // ── 2. Live Shopify API fallback ──────────────────────────────────────────
  const liveOrder = await fetchShopifyOrderByNumber(orderNum);
  if (!liveOrder) {
    return NextResponse.json({ found: false, source: null, order: null });
  }

  const totalQty = liveOrder.line_items.reduce((s, li) => s + li.quantity, 0);
  const firstName = liveOrder.customer?.first_name ?? "";
  const lastName  = liveOrder.customer?.last_name  ?? "";

  return NextResponse.json({
    found: true,
    source: "shopify_live",
    order: {
      shopify_order_id:        String(liveOrder.id),
      order_number:            liveOrder.order_number,
      quantity:                totalQty,
      net_value:               parseFloat(liveOrder.total_price ?? "0"),
      design:                  liveOrder.line_items[0]?.name ?? null,
      payment_mode:            liveOrder.payment_gateway ?? null,
      financial_status:        liveOrder.financial_status ?? null,
      fulfillment_status:      liveOrder.fulfillment_status ?? null,
      customer_name:           [firstName, lastName].filter(Boolean).join(" ") || null,
      attributed_agent_id:     null,
      attributed_agent_handle: null,
    },
  });
}
