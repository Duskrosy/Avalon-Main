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
  /** UI MUST send confirmRevert=true when the order is already synced
   *  (it cancels the live Shopify order). Server enforces. */
  confirm_revert: z.boolean().optional(),
});

// ─── POST /api/sales/orders/[id]/revert-to-draft ────────────────────────────
//
// Confirmed/synced/failed → draft. Preserves order row + relations; allocates
// a fresh avalon_order_number on re-confirm. For synced orders, cancels the
// Shopify order first (split-brain prevention).

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
  if (!order) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (
    order.created_by_user_id !== currentUser.id &&
    !isManagerOrAbove(currentUser)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (order.status === "draft") {
    return NextResponse.json(
      { error: "Order is already a draft." },
      { status: 409 },
    );
  }
  if (order.status === "cancelled") {
    return NextResponse.json(
      { error: "Cannot revert a cancelled order." },
      { status: 409 },
    );
  }
  if (order.sync_status === "syncing") {
    return NextResponse.json(
      {
        error:
          "Order is mid-sync. Wait 5 minutes (reconciler) or click Retry, then revert.",
      },
      { status: 409 },
    );
  }
  if (order.sync_status === "synced" && !body.confirm_revert) {
    return NextResponse.json(
      {
        error:
          "Reverting a synced order will cancel the Shopify order. Send confirm_revert=true to proceed.",
        requires_confirmation: true,
        shopify_order_id: order.shopify_order_id,
      },
      { status: 412 },
    );
  }

  const result = await releaseOrder(admin, {
    orderId: id,
    action: "revert",
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

  // TODO (Lane C): release Inventory v1 reservation here via
  //   public.create_inventory_movement(p_movement_type='reallocate', ...) or
  //   a dedicated 'release' movement type. Track which location the order
  //   originally allocated from on order_shopify_syncs.metadata or a sibling
  //   per-line table. The integration test in Lane C wires this end-to-end.

  return NextResponse.json({
    ok: true,
    shopify_cancelled: result.shopifyCancelled,
    previous_shopify_order_id: result.shopifyOrderId,
    previous_avalon_order_number: result.avalonOrderNumber,
  });
}
