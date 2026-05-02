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
import {
  fetchShopifyOrderShippingAddress,
  type ShopifyShippingAddress,
} from "@/lib/shopify/client";
import type { AddressPayload } from "@/lib/cs/edit-plan/op-shapes";

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

  // 3. Stuck plan auto-recovery (eng review [2.1A] + Phase B-Lite Lane D).
  //
  // A plan stuck in 'applying' for >60s is either:
  //   (a) Begin/UpdateShipping never reached Commit → safely revert to draft
  //   (b) Commit fired but response was lost (network drop, function crash)
  //       → Shopify side committed; flipping to 'draft' loses audit trail
  //
  // Disambiguate (b) from (a) by re-polling Shopify's current shipping
  // address and comparing it to the proposed payload:
  //   match    → flip to 'applied' + synthetic shopify_commit_id
  //   no-match → existing revert path (a)
  //   GET err  → existing revert path (defense-in-depth — can't lose more
  //              than the existing behaviour even if Shopify is down)
  //
  // Shape:
  //   stuck plan detected (applying >60s)
  //      │
  //      ▼
  //   has shopify_calculated_order_id AND no shopify_commit_id?
  //      ├── no   → revert to draft (existing behavior)
  //      └── yes  → fetch order from Shopify by shopify_order_id
  //                    │
  //                    ├── error/null    → revert to draft
  //                    └── address match → flip to 'applied' + synthetic id
  //                    └── no match      → revert to draft
  const sixtySecondsAgo = new Date(Date.now() - 60_000).toISOString();
  const { data: stuckPlan, error: stuckErr } = await db
    .from("cs_edit_plans")
    .select(
      "id, shopify_calculated_order_id, shopify_commit_id, " +
        "items:cs_edit_plan_items(op, payload)",
    )
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
    const recovery = await disambiguateStuckPlan(db, id, stuckPlan);

    if (recovery === "applied") {
      // Shopify side has the proposed address — flip to applied with a
      // synthetic commit_id so audit views can identify recovered plans
      // distinctly from cleanly-committed ones.
      const { error: appliedErr } = await db
        .from("cs_edit_plans")
        .update({
          status: "applied",
          shopify_commit_id: `recovered_${id}`,
          applied_at: new Date().toISOString(),
        })
        .eq("id", stuckPlan.id)
        .eq("status", "applying"); // CAS to avoid stomping a concurrent revert
      if (appliedErr) {
        console.error("[full-drawer] stuck-plan recovery flip-to-applied failed", { code: appliedErr.code, message: appliedErr.message, hint: appliedErr.hint, details: appliedErr.details });
      }
    } else {
      // Idempotent: if two concurrent reads both revert, both writes set
      // status='draft' — last write wins, no correctness issue.
      const { error: revertErr } = await db
        .from("cs_edit_plans")
        .update({ status: "draft", error_message: "Auto-reverted: stuck in applying >60s" })
        .eq("id", stuckPlan.id)
        .eq("status", "applying");
      if (revertErr) {
        console.error("[full-drawer] stuck-plan revert failed", { code: revertErr.code, message: revertErr.message, hint: revertErr.hint, details: revertErr.details });
      }
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

// ─── Stuck-plan disambiguation (Phase B-Lite Lane D) ─────────────────────────

interface StuckPlanRow {
  id: number;
  shopify_calculated_order_id: string | null;
  shopify_commit_id: string | null;
  items?: Array<{ op: string; payload: unknown }>;
}

/**
 * Decide whether a stuck-in-applying plan should be flipped to 'applied' or
 * reverted to 'draft' by re-polling Shopify.
 *
 * Returns "applied" only if we have positive evidence that Shopify already
 * committed the proposed address. Any other case returns "revert" — failures
 * (Shopify down, parse error, missing fields) bias toward the safer revert.
 */
async function disambiguateStuckPlan(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  orderId: string,
  plan: StuckPlanRow,
): Promise<"applied" | "revert"> {
  // (a) If commit_id is already populated, the plan should not have been
  // 'applying' at all — flag and revert defensively. Should never happen.
  if (plan.shopify_commit_id) {
    console.warn("[full-drawer] stuck plan had commit_id but was still applying", {
      plan_id: plan.id,
      commit_id: plan.shopify_commit_id,
    });
    return "revert";
  }

  // (b) No calc_order_id means Begin never succeeded. Safe to revert.
  if (!plan.shopify_calculated_order_id) {
    return "revert";
  }

  // (c) No address_shipping op in the items → nothing to compare. Revert.
  const addressOp = plan.items?.find((i) => i.op === "address_shipping");
  if (!addressOp) {
    return "revert";
  }
  const proposed = addressOp.payload as AddressPayload;

  // (d) Look up the order's shopify_order_id. We need this for the GET.
  const { data: orderRow } = await db
    .from("orders")
    .select("shopify_order_id")
    .eq("id", orderId)
    .maybeSingle();

  if (!orderRow?.shopify_order_id) {
    return "revert";
  }

  // (e) Re-poll Shopify. Network/parse errors → revert (defense-in-depth).
  let shopifyAddress: ShopifyShippingAddress | null;
  try {
    shopifyAddress = await fetchShopifyOrderShippingAddress(
      String(orderRow.shopify_order_id),
    );
  } catch {
    return "revert";
  }

  if (!shopifyAddress) {
    return "revert";
  }

  // (f) Compare the normalized fields. Match all required fields strictly
  // — false positives flip the audit trail incorrectly.
  return shippingAddressMatches(shopifyAddress, proposed) ? "applied" : "revert";
}

/**
 * Strict comparison of Shopify's current shipping address against the
 * proposed payload. Required fields (street, city, country) must match
 * normalized; optional fields (zip, phone) only block when both are present
 * and differ.
 */
function shippingAddressMatches(
  shopify: ShopifyShippingAddress,
  proposed: AddressPayload,
): boolean {
  const norm = (s: string | null | undefined): string =>
    (s ?? "").trim().toLowerCase();

  // Required fields — strict match.
  if (norm(shopify.address1) !== norm(proposed.street)) return false;
  if (norm(shopify.city) !== norm(proposed.city)) return false;
  // Country: Shopify exposes both ISO code and full name; match either.
  const shopifyCountry =
    norm(shopify.country_code) || norm(shopify.country);
  if (shopifyCountry !== norm(proposed.country)) return false;

  // Optional fields — block only when proposed has a value AND Shopify
  // disagrees. If proposed omits the field, don't compare.
  if (proposed.zip !== undefined && proposed.zip !== "" &&
      norm(shopify.zip) !== norm(proposed.zip)) {
    return false;
  }
  if (proposed.phone !== undefined && proposed.phone !== "" &&
      norm(shopify.phone) !== norm(proposed.phone)) {
    return false;
  }

  return true;
}

// Exported for tests so the comparison rules are unit-testable without
// running the full route handler.
export { shippingAddressMatches as __shippingAddressMatchesForTests };
