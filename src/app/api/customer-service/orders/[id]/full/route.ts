// src/app/api/customer-service/orders/[id]/full/route.ts
//
// GET /api/customer-service/orders/[id]/full
//
// Returns the full drawer payload for one CS order: order header, customer,
// line items, lane-specific payment block, and the active draft edit plan
// (if any). Used by the CS ticket drawer (Lane 4).
//
// Performance: single nested PostgREST SELECT for the main read. The only
// extra round-trip is the stuck-plan check/revert (per eng review [2.1A]).
//
// NOTE: cs_edit_plans.order_id is declared as bigint in migration 00101 but
// orders.id is uuid. This FK mismatch is a Lane 1 bug — tracked separately.
// The plan SELECT below works at the application level regardless.

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

type RouteContext = { params: Promise<{ id: string }> };

// ── Response shape ───────────────────────────────────────────────────────────

type SalesPayment = {
  payment_receipt_path: string | null;
  cs_payment_receipt_path: string | null;
  payment_reference_number: string | null;
  payment_transaction_at: string | null;
  notes: string | null;
};

type ConversionPayment = {
  shopify_card_last4: string | null;
  shopify_gateway: string | null;
  shopify_transaction_id: string | null;
  shopify_transaction_at: string | null;
};

type QuarantinePayment = {
  quarantine: true;
  admin_url: string;
};

type LanePayment = SalesPayment | ConversionPayment | QuarantinePayment;

type DrawerPlan = {
  id: number;
  status: string;
  chosen_path: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  items: unknown[];
} | null;

type CsNote = {
  id: number;
  author_name_snapshot: string;
  body: string;
  created_at: string;
};

type FullDrawerResponse = {
  order: {
    id: string;
    intake_lane: string | null;
    avalon_order_number: string | null;
    shopify_order_name: string | null;
    shopify_order_number: string | null;
    status: string;
    final_total_amount: number;
    mode_of_payment: string | null;
    payment_other_label: string | null;
    voucher_code: string | null;
    voucher_discount_amount: number;
    manual_discount_amount: number;
    manual_discount_reason: string | null;
    shipping_fee_amount: number;
    shopify_financial_status: string | null;
    shopify_fulfillment_status: string | null;
    delivery_method: string | null;
    delivery_method_notes: string | null;
    cs_hold_reason: string | null;
    claimed_by_user_id: string | null;
    claimed_at: string | null;
    created_at: string;
    completed_at: string | null;
    parent_order_id: number | null;
  };
  customer: {
    id: string;
    first_name: string;
    last_name: string;
    full_name: string;
    phone: string | null;
    email: string | null;
    address_line_1: string | null;
    address_line_2: string | null;
    city_text: string | null;
    region_text: string | null;
    postal_code: string | null;
    full_address: string | null;
    /** Auto-assigned region sent to Shopify's address.province (added in migration 00090). Read-only in CS. */
    shopify_region: string | null;
  } | null;
  items: Array<{
    id: string;
    product_variant_id: string | null;
    product_name: string;
    variant_name: string | null;
    quantity: number;
    unit_price_amount: number;  // matches actual schema (00086_sales_orders_phase1.sql)
    line_total_amount: number;
    size: string | null;
    color: string | null;
    image_url: string | null;
  }>;
  payment: LanePayment;
  notes: string | null;
  cs_notes: CsNote[];
  plan: DrawerPlan;
};

// ── SELECT strings ───────────────────────────────────────────────────────────

const ORDER_SELECT = [
  "id, intake_lane, avalon_order_number, shopify_order_name, shopify_order_number,",
  "status, final_total_amount, mode_of_payment, payment_other_label, voucher_code,",
  "voucher_discount_amount, manual_discount_amount, manual_discount_reason, shipping_fee_amount,",
  "payment_receipt_path, cs_payment_receipt_path, payment_reference_number, payment_transaction_at,",
  "shopify_financial_status, shopify_fulfillment_status,",
  "shopify_gateway, shopify_card_last4, shopify_transaction_id, shopify_transaction_at,",
  "delivery_method, delivery_method_notes,",
  "cs_hold_reason, claimed_by_user_id, claimed_at,",
  "notes, created_at, completed_at, parent_order_id,",
  "customer:customers(*),",
  "items:order_items(*),",
  "plan:cs_edit_plans(*, items:cs_edit_plan_items(*))",
].join(" ");

// ── Lane-specific payment block ──────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildPaymentBlock(order: Record<string, any>): LanePayment {
  const lane = order.intake_lane as string | null;

  if (lane === "sales") {
    return {
      payment_receipt_path: order.payment_receipt_path ?? null,
      cs_payment_receipt_path: order.cs_payment_receipt_path ?? null,
      payment_reference_number: order.payment_reference_number ?? null,
      payment_transaction_at: order.payment_transaction_at ?? null,
      notes: order.notes ?? null,
    };
  }

  if (lane === "conversion") {
    return {
      shopify_card_last4: order.shopify_card_last4 ?? null,
      shopify_gateway: order.shopify_gateway ?? null,
      shopify_transaction_id: order.shopify_transaction_id ?? null,
      shopify_transaction_at: order.shopify_transaction_at ?? null,
    };
  }

  if (lane === "shopify_admin") {
    // If financial_status is pending the order hasn't been paid via Shopify
    // checkout — treat it like a sales order (rep-collected payment). Otherwise
    // it came through Shopify checkout so treat it like a conversion order.
    // TODO: revisit once shopify_financial_status is reliably backfilled for
    // shopify_admin lane rows (migration 00101 backfill only sets intake_lane).
    if (order.shopify_financial_status === "pending") {
      return {
        payment_receipt_path: order.payment_receipt_path ?? null,
        cs_payment_receipt_path: order.cs_payment_receipt_path ?? null,
        payment_reference_number: order.payment_reference_number ?? null,
        payment_transaction_at: order.payment_transaction_at ?? null,
        notes: order.notes ?? null,
      };
    }
    return {
      shopify_card_last4: order.shopify_card_last4 ?? null,
      shopify_gateway: order.shopify_gateway ?? null,
      shopify_transaction_id: order.shopify_transaction_id ?? null,
      shopify_transaction_at: order.shopify_transaction_at ?? null,
    };
  }

  if (lane === "quarantine") {
    return {
      quarantine: true,
      admin_url: `/cs/admin/quarantine?order_id=${order.id}`,
    };
  }

  // Unknown/null lane (typically pre-Pass-2 orders that predate the migration
  // 00101 backfill). Fall back to data-driven detection: if there's a rep-
  // collected receipt path, treat as sales-style; otherwise use conversion
  // shape. This recovers attachments on legacy orders.
  if (order.payment_receipt_path || order.cs_payment_receipt_path) {
    return {
      payment_receipt_path: order.payment_receipt_path ?? null,
      cs_payment_receipt_path: order.cs_payment_receipt_path ?? null,
      payment_reference_number: order.payment_reference_number ?? null,
      payment_transaction_at: order.payment_transaction_at ?? null,
      notes: order.notes ?? null,
    };
  }
  return {
    shopify_card_last4: order.shopify_card_last4 ?? null,
    shopify_gateway: order.shopify_gateway ?? null,
    shopify_transaction_id: order.shopify_transaction_id ?? null,
    shopify_transaction_at: order.shopify_transaction_at ?? null,
  };
}

// ── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;

  // 1. Auth
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Validate id
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
  }

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any;

  // 3. Stuck plan auto-revert (eng review [2.1A]).
  //    If a plan is stuck in 'applying' for >60 seconds, revert it to 'draft'
  //    before returning the payload so the rep doesn't see a permanently-locked plan.
  const sixtySecondsAgo = new Date(Date.now() - 60_000).toISOString();
  const { data: stuckPlan, error: stuckErr } = await db
    .from("cs_edit_plans")
    .select("id")
    .eq("order_id", id)
    .eq("status", "applying")
    .lt("applying_started_at", sixtySecondsAgo)
    .maybeSingle();

  if (stuckErr) {
    // Non-fatal: log and continue with the main fetch. A failed stuck-plan
    // check just means the rep might briefly see a stale 'applying' state.
    console.error("[full-drawer] stuck-plan check failed", { code: stuckErr.code, message: stuckErr.message, hint: stuckErr.hint, details: stuckErr.details });
  }

  if (stuckPlan) {
    // Idempotent: if two concurrent reads both revert, both writes set
    // status='draft' — last write wins, no correctness issue.
    const { error: revertErr } = await db
      .from("cs_edit_plans")
      .update({ status: "draft", error_message: "Auto-reverted: stuck in applying >60s" })
      .eq("id", stuckPlan.id);
    if (revertErr) {
      console.error("[full-drawer] stuck-plan revert failed", { code: revertErr.code, message: revertErr.message, hint: revertErr.hint, details: revertErr.details });
    }
  }

  // 4. Main nested SELECT + cs_notes feed — run in parallel.
  const [{ data: order, error }, { data: rawCsNotes }] = await Promise.all([
    db
      .from("orders")
      .select(ORDER_SELECT)
      .eq("id", id)
      .single(),
    db
      .from("cs_order_notes")
      .select("id, author_name_snapshot, body, created_at")
      .eq("order_id", id)
      .order("created_at", { ascending: true }),
  ]);

  if (error || !order) {
    // PGRST116 = "no rows returned" from PostgREST
    const isNotFound = !order || error?.code === "PGRST116";
    if (isNotFound) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    console.error("[full-drawer] order fetch failed", { code: error?.code, message: error?.message, hint: error?.hint, details: error?.details });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }

  // 5. Filter plans to only draft status.
  //    The nested select returns an array; pick the first draft plan (if any).
  const rawPlans: unknown[] = Array.isArray(order.plan) ? order.plan : [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const draftPlan = (rawPlans as any[]).find((p) => p.status === "draft") ?? null;

  const plan: DrawerPlan = draftPlan
    ? {
        id: draftPlan.id,
        status: draftPlan.status,
        chosen_path: draftPlan.chosen_path ?? null,
        error_message: draftPlan.error_message ?? null,
        created_at: draftPlan.created_at,
        updated_at: draftPlan.updated_at,
        items: Array.isArray(draftPlan.items) ? draftPlan.items : [],
      }
    : null;

  // 6. Compose response.
  const payload: FullDrawerResponse = {
    order: {
      id: order.id,
      intake_lane: order.intake_lane ?? null,
      avalon_order_number: order.avalon_order_number ?? null,
      shopify_order_name: order.shopify_order_name ?? null,
      shopify_order_number: order.shopify_order_number ?? null,
      status: order.status,
      final_total_amount: order.final_total_amount,
      mode_of_payment: order.mode_of_payment ?? null,
      payment_other_label: order.payment_other_label ?? null,
      voucher_code: order.voucher_code ?? null,
      voucher_discount_amount: order.voucher_discount_amount ?? 0,
      manual_discount_amount: order.manual_discount_amount ?? 0,
      manual_discount_reason: order.manual_discount_reason ?? null,
      shipping_fee_amount: order.shipping_fee_amount ?? 0,
      shopify_financial_status: order.shopify_financial_status ?? null,
      shopify_fulfillment_status: order.shopify_fulfillment_status ?? null,
      delivery_method: order.delivery_method ?? null,
      delivery_method_notes: order.delivery_method_notes ?? null,
      cs_hold_reason: order.cs_hold_reason ?? null,
      claimed_by_user_id: order.claimed_by_user_id ?? null,
      claimed_at: order.claimed_at ?? null,
      created_at: order.created_at,
      completed_at: order.completed_at ?? null,
      parent_order_id: order.parent_order_id ?? null,
    },
    customer: order.customer ?? null,
    items: Array.isArray(order.items) ? order.items : [],
    payment: buildPaymentBlock(order),
    notes: order.notes ?? null,
    cs_notes: Array.isArray(rawCsNotes) ? (rawCsNotes as CsNote[]) : [],
    plan,
  };

  return NextResponse.json(payload);
}
