import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isManagerOrAbove } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateBody } from "@/lib/api/validate";
import { cancelShopifyOrder } from "@/lib/shopify/client";

// ─── POST /api/sales/orders/[id]/complete ───────────────────────────────────
//
// Marks a synced order complete. Captures the post-delivery attribution
// fields the agent records once the COD parcel comes back, so reporting
// can split gross-sold from net GMV.
//
// Flips:
//   status: confirmed → completed
//   completion_status: incomplete → complete
//   completed_by_user_id, completed_at
// And persists the user-entered fields (net_value_amount, ad_creative_id,
// ad_creative_name, is_abandoned_cart, alex_ai_assist_level).
//
// 200 → { order } (updated row)
// 400 → bad payload
// 403 → not the order's owner or a manager
// 404 → not found
// 409 → wrong order state (must be status='confirmed' + sync_status='synced')

const bodySchema = z.object({
  net_value_amount: z.number().positive(),
  ad_creative_id: z.string().min(1),
  ad_creative_name: z.string().min(1),
  is_abandoned_cart: z.boolean().default(false),
  alex_ai_assist_level: z.enum(["none", "partial", "full"]),
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
  const { data: body, error: validationError } = validateBody(bodySchema, raw);
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
      if (body.is_abandoned_cart) {
        // Customer didn't pay → cancel on Shopify. Idempotent: if Shopify
        // already reports cancelled, treat as ok.
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
      } else {
        // Non-abandoned completes leave Shopify financial_status pending;
        // we no longer mark the order paid via a sale transaction here.
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

  // The "Complete" action is the sales-agent's handoff to CS, NOT the
  // post-delivery finalization. Flip completion_status='complete' so the
  // order appears in the CS Inbox, but leave status='confirmed' so it stays
  // in the active CS pipeline. A separate post-delivery wrap-up flow will
  // flip status to 'completed' once the order is fully done.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: updated, error } = await (admin as any)
    .from("orders")
    .update({
      completion_status: "complete",
      completed_by_user_id: currentUser.id,
      completed_at: new Date().toISOString(),
      net_value_amount: body.net_value_amount,
      ad_creative_id: body.ad_creative_id,
      ad_creative_name: body.ad_creative_name,
      is_abandoned_cart: body.is_abandoned_cart,
      alex_ai_assist_level: body.alex_ai_assist_level,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ order: updated, shopify_sync: shopifySync });
}
