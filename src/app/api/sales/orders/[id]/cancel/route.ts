import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isManagerOrAbove } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateBody } from "@/lib/api/validate";
import { releaseOrder } from "@/lib/sales/release-order";

type RouteContext = { params: Promise<{ id: string }> };

const schema = z.object({
  reason: z.string().optional(),
  /** UI MUST send confirm_cancel=true when the order is already synced
   *  (it cancels the live Shopify order). Server enforces. */
  confirm_cancel: z.boolean().optional(),
});

// ─── POST /api/sales/orders/[id]/cancel ─────────────────────────────────────
//
// Destructive soft-delete. Three branches:
//   • draft        → straight transition to cancelled (no stock allocated)
//   • confirmed/failed → release Inventory v1 reservation, transition
//   • synced       → manager-only (Shopify cancel + release + transition)

export async function POST(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = await req.json().catch(() => ({}));
  const { data: body, error: validationError } = validateBody(schema, raw);
  if (validationError) return validationError;

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: order } = await (admin as any)
    .from("orders")
    .select("id, status, sync_status, created_by_user_id, shopify_order_id")
    .eq("id", id)
    .maybeSingle();
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (
    order.created_by_user_id !== currentUser.id &&
    !isManagerOrAbove(currentUser)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (order.status === "cancelled") {
    return NextResponse.json({ ok: true, message: "Already cancelled." });
  }
  if (order.sync_status === "syncing") {
    return NextResponse.json(
      { error: "Order is mid-sync. Wait or retry, then cancel." },
      { status: 409 },
    );
  }
  if (order.sync_status === "synced" && !body.confirm_cancel) {
    return NextResponse.json(
      {
        error:
          "Cancelling a synced order will cancel the Shopify order. Send confirm_cancel=true to proceed.",
        requires_confirmation: true,
        shopify_order_id: order.shopify_order_id,
      },
      { status: 412 },
    );
  }

  const result = await releaseOrder(admin, {
    orderId: id,
    action: "cancel",
    reason: body.reason,
    actingUserId: currentUser.id,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        stage: result.stage,
        error: result.error,
        partial_state: result.partialState,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    shopify_cancelled: result.shopifyCancelled,
    previous_shopify_order_id: result.shopifyOrderId,
    previous_avalon_order_number: result.avalonOrderNumber,
  });
}
