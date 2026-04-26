import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isManagerOrAbove } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";

type RouteContext = { params: Promise<{ id: string }> };

// ─── POST /api/sales/orders/[id]/bundle-split ───────────────────────────────
//
// Splits the order's subtotal evenly across all line items by writing
// adjusted_unit_price_amount + line_total_amount on order_items. Used for
// COD waybill clarity (B1T1 ₱7,000 → ₱3,500 / ₱3,500 instead of ₱7k / ₱0).
//
// Records an order_adjustments row of type bundle_split_pricing.
//
// Permissions: order owner OR manager.
// Status:
//   - draft           → applies cleanly. Re-confirm pushes adjusted prices to Shopify.
//   - confirmed/synced → applies locally + writes adjustment row, but Shopify line-item
//                        prices are NOT updated (Shopify's PUT /orders does not edit
//                        line-item prices on existing orders — that needs the Order
//                        Edit API, deferred). Response includes shopify_split_pending=true
//                        so the UI can warn the agent. Recommended path: revert-to-draft
//                        and re-confirm if Shopify-side waybill needs to reflect the split.
//   - cancelled        → 409.

export async function POST(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: order } = await (admin as any)
    .from("orders")
    .select("id, status, sync_status, created_by_user_id")
    .eq("id", id)
    .maybeSingle();
  if (!order) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (
    order.created_by_user_id !== currentUser.id &&
    !isManagerOrAbove(currentUser)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (order.status === "cancelled") {
    return NextResponse.json(
      { error: "Cannot split a cancelled order." },
      { status: 409 },
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: items } = await (admin as any)
    .from("order_items")
    .select("id, quantity, unit_price_amount, adjusted_unit_price_amount")
    .eq("order_id", id);

  if (!items || items.length < 2) {
    return NextResponse.json(
      { error: "Need at least 2 line items to split a bundle." },
      { status: 409 },
    );
  }

  // Use original unit_price_amount as the basis for the split — never the
  // already-adjusted price (so re-splitting is idempotent).
  const total = items.reduce(
    (sum: number, it: { quantity: number; unit_price_amount: number }) =>
      sum + Number(it.unit_price_amount) * it.quantity,
    0,
  );
  const totalUnits = items.reduce(
    (sum: number, it: { quantity: number }) => sum + it.quantity,
    0,
  );
  if (totalUnits === 0) {
    return NextResponse.json(
      { error: "Order has zero units; nothing to split." },
      { status: 409 },
    );
  }
  const splitPrice = Math.round((total / totalUnits) * 100) / 100;

  // Update each line. Round the final line totals individually using the per-unit
  // split price so the math reads cleanly on the receipt; rounding remainder
  // (sub-cent) is absorbed into the last line so the sum still matches `total`.
  let runningSum = 0;
  for (let i = 0; i < items.length; i++) {
    const it = items[i] as {
      id: string;
      quantity: number;
      unit_price_amount: number;
    };
    const isLast = i === items.length - 1;
    const lineTotal = isLast
      ? Math.round((total - runningSum) * 100) / 100
      : Math.round(splitPrice * it.quantity * 100) / 100;
    runningSum += lineTotal;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updErr } = await (admin as any)
      .from("order_items")
      .update({
        adjusted_unit_price_amount: splitPrice,
        line_total_amount: lineTotal,
      })
      .eq("id", it.id);
    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }
  }

  // Audit row.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: adjustment, error: adjErr } = await (admin as any)
    .from("order_adjustments")
    .insert({
      order_id: id,
      adjustment_type: "bundle_split_pricing",
      status: "resolved",
      request_text: `Bundle split applied (${order.status}/${order.sync_status}): ₱${total.toFixed(2)} across ${totalUnits} units → ₱${splitPrice.toFixed(2)} each.`,
      structured_payload: {
        split_price: splitPrice,
        original_total: total,
        line_count: items.length,
        unit_count: totalUnits,
        applied_at_stage: order.status,
        order_sync_status: order.sync_status,
      },
      created_by_user_id: currentUser.id,
      created_by_name: `${currentUser.first_name} ${currentUser.last_name}`,
      resolved_by_user_id: currentUser.id,
      resolved_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (adjErr) {
    return NextResponse.json({ error: adjErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    adjustment,
    split_price: splitPrice,
    line_count: items.length,
    unit_count: totalUnits,
    // True if the order is already in Shopify and the split was NOT pushed to
    // Shopify (line-item prices on existing orders need Order Edit API).
    // Agent should consider revert-to-draft + re-confirm if waybill needs update.
    shopify_split_pending:
      order.sync_status === "synced" || order.sync_status === "syncing",
  });
}
