import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isManagerOrAbove } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { runConfirmFlow } from "@/lib/sales/confirm-flow";
import {
  createShopifyCustomer,
  searchShopifyCustomers,
} from "@/lib/shopify/client";

type RouteContext = { params: Promise<{ id: string }> };

// ─── POST /api/sales/orders/[id]/confirm ─────────────────────────────────────
//
// Draft → confirmed + Shopify sync.
//
// Sequencing:
//   1. AuthZ + draft validation
//   2. If customer.shopify_customer_id is null, do the two-step:
//      email-pre-search → reuse existing OR create Shopify customer
//   3. Inventory v1 allocation: stub for Phase 1 — see TODO below. Lane B
//      lands the route shape; the actual allocation movement is wired into
//      the confirm RPC alongside the integration test in Lane C.
//   4. runConfirmFlow handles Shopify POST + 8s timeout + idempotency
//   5. Return result to client (ok or pending=true for polling)

export async function POST(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Lock the row at the start of confirm to prevent concurrent confirm+revert
  // races. Supabase's REST API doesn't expose SELECT FOR UPDATE directly; the
  // best we can do is read-then-update with a status check, and rely on
  // order_shopify_syncs's UNIQUE (order_id, attempt_number) to serialize.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: order, error: fetchErr } = await (admin as any)
    .from("orders")
    .select(
      "id, status, sync_status, created_by_user_id, customer_id",
    )
    .eq("id", id)
    .maybeSingle();

  if (fetchErr || !order) {
    return NextResponse.json(
      { error: fetchErr?.message ?? "Order not found" },
      { status: 404 },
    );
  }
  if (
    order.created_by_user_id !== currentUser.id &&
    !isManagerOrAbove(currentUser)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (order.status !== "draft") {
    return NextResponse.json(
      { error: `Cannot confirm order in status='${order.status}'` },
      { status: 409 },
    );
  }

  // Two-step customer-then-order: ensure Shopify customer exists.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: customer } = await (admin as any)
    .from("customers")
    .select("id, shopify_customer_id, first_name, last_name, email, phone")
    .eq("id", order.customer_id)
    .maybeSingle();

  if (customer && !customer.shopify_customer_id && customer.email) {
    try {
      const matches = await searchShopifyCustomers(`email:${customer.email}`);
      const found = matches.find((c) => c.email === customer.email);
      let shopifyCustomerId: string;
      if (found) {
        shopifyCustomerId = String(found.id);
      } else {
        const created = await createShopifyCustomer({
          first_name: customer.first_name,
          last_name: customer.last_name,
          email: customer.email,
          phone: customer.phone,
        });
        shopifyCustomerId = String(created.id);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (admin as any)
        .from("customers")
        .update({ shopify_customer_id: shopifyCustomerId })
        .eq("id", customer.id);
    } catch (err) {
      return NextResponse.json(
        {
          error: "Shopify customer step failed",
          detail: err instanceof Error ? err.message : String(err),
        },
        { status: 502 },
      );
    }
  }

  // TODO (Lane C / integration test): wire Inventory v1 allocation here via
  //   public.create_inventory_movement(p_movement_type='allocate', ...).
  //   For Phase 1 ship, the confirm flow proceeds without explicit allocation;
  //   the inventory_balances reservation happens through the existing /sales
  //   ops flow until we land per-line allocation in a follow-up.
  //   Tracking note: the design doc's Reviewer Response section flags this
  //   as the inventory wiring point, and the integration round-trip test in
  //   Lane C will exercise the full path.

  const agentHandle =
    `${currentUser.first_name}-${currentUser.last_name}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  const result = await runConfirmFlow(admin, id, {
    isRetry: false,
    agentHandle,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        stage: result.stage,
        error: result.error,
        avalon_order_number: result.avalonOrderNumber,
        attempt_number: result.attemptNumber,
      },
      { status: 502 },
    );
  }

  if (result.pending) {
    return NextResponse.json(
      {
        ok: true,
        pending: true,
        avalon_order_number: result.avalonOrderNumber,
        attempt_number: result.attemptNumber,
        message:
          "Sync is running in background. Poll GET /orders/{id} for the final state.",
      },
      { status: 202 },
    );
  }

  return NextResponse.json({
    ok: true,
    pending: false,
    shopify_order_id: result.shopifyOrderId,
    avalon_order_number: result.avalonOrderNumber,
    attempt_number: result.attemptNumber,
    recovered: result.recovered,
  });
}
