import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isManagerOrAbove } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateBody } from "@/lib/api/validate";
import {
  cancelShopifyOrder,
  createShopifyOrderTransaction,
  listShopifyOrderTransactions,
} from "@/lib/shopify/client";

// Delivery statuses that map to "the customer didn't pay" — these cancel
// the Shopify order. "rescheduled" is in-flight, no Shopify action.
const NEGATIVE_DELIVERY_STATUSES = new Set([
  "abandoned",
  "rejected",
  "returned",
  "lost",
]);

// ─── POST /api/sales/orders/[id]/complete ───────────────────────────────────
//
// Marks a synced order complete. Captures the post-delivery attribution
// fields the agent records once the COD parcel comes back (delivered /
// rejected / returned), so reporting can split gross-sold from net GMV.
//
// Flips:
//   status: confirmed → completed
//   completion_status: incomplete → complete
//   completed_by_user_id, completed_at
// And persists the user-entered fields (net_value_amount,
// is_abandoned_cart, ad_campaign_source, alex_ai_assist, delivery_status).
//
// 200 → { order } (updated row)
// 400 → bad payload
// 403 → not the order's owner or a manager
// 404 → not found
// 409 → wrong order state (must be status='confirmed' + sync_status='synced')

const completeSchema = z.object({
  net_value_amount: z.number().min(0),
  delivery_status: z.string().min(1),
  is_abandoned_cart: z.boolean().optional().default(false),
  ad_campaign_source: z.string().nullable().optional(),
  alex_ai_assist: z.boolean().optional().default(false),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = await req.json();
  const { data: body, error: validationError } = validateBody(
    completeSchema,
    raw,
  );
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
  if (order.status !== "confirmed" || order.sync_status !== "synced") {
    return NextResponse.json(
      {
        error:
          "Only confirmed + synced orders can be completed (current: " +
          `status=${order.status}, sync_status=${order.sync_status})`,
      },
      { status: 409 },
    );
  }

  // Push the financial outcome to Shopify before flipping local status —
  // if the Shopify side errors we'd rather leave the order at status=
  // 'confirmed' so the agent can retry, instead of having a "completed"
  // local order that Shopify still thinks is COD-pending.
  const shopifyOrderId = order.shopify_order_id;
  let shopifySync: { ok: boolean; action: string; detail?: string } = {
    ok: true,
    action: "skip",
  };
  if (shopifyOrderId) {
    try {
      if (NEGATIVE_DELIVERY_STATUSES.has(body.delivery_status)) {
        // Cancel on Shopify — covers abandoned / rejected / returned / lost.
        // If Shopify already reports cancelled (idempotent retry), the
        // 422 from /cancel.json mentions "already" — we treat that as ok.
        try {
          await cancelShopifyOrder(shopifyOrderId, "customer");
          shopifySync = { ok: true, action: "cancelled" };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (/already|cancelled/i.test(msg)) {
            shopifySync = { ok: true, action: "cancel-already" };
          } else {
            throw err;
          }
        }
      } else if (body.net_value_amount > 0) {
        // Mark paid — sale transaction. Idempotency guard: skip if a
        // successful sale transaction already exists on this order.
        const txns = await listShopifyOrderTransactions(shopifyOrderId);
        const alreadyPaid = txns.some(
          (t) => t.kind === "sale" && t.status === "success",
        );
        if (alreadyPaid) {
          shopifySync = { ok: true, action: "paid-already" };
        } else {
          await createShopifyOrderTransaction(shopifyOrderId, {
            kind: "sale",
            status: "success",
            amount: body.net_value_amount.toFixed(2),
            gateway: "cash",
            authorization: `avalon-complete-${id}`,
          });
          shopifySync = { ok: true, action: "paid" };
        }
      } else {
        // net_value 0 with a non-cancelled delivery status (e.g.
        // "rescheduled"). Don't touch Shopify — order is still in flight.
        shopifySync = { ok: true, action: "noop" };
      }
    } catch (err) {
      return NextResponse.json(
        {
          error: "Shopify completion sync failed",
          detail: err instanceof Error ? err.message : String(err),
        },
        { status: 502 },
      );
    }
  } else {
    // status='confirmed' + sync_status='synced' but no shopify_order_id is
    // unexpected — probably a stale row. Fall through and let local
    // completion record what the agent saw; the reconciler can repair.
    shopifySync = { ok: false, action: "no-shopify-id" };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: updated, error } = await (admin as any)
    .from("orders")
    .update({
      status: "completed",
      completion_status: "complete",
      completed_by_user_id: currentUser.id,
      completed_at: new Date().toISOString(),
      net_value_amount: body.net_value_amount,
      is_abandoned_cart: body.is_abandoned_cart ?? false,
      ad_campaign_source: body.ad_campaign_source ?? null,
      alex_ai_assist: body.alex_ai_assist ?? false,
      delivery_status: body.delivery_status,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ order: updated, shopify_sync: shopifySync });
}
