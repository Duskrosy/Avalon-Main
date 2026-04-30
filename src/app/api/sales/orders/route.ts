import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isManagerOrAbove } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateBody } from "@/lib/api/validate";

// ─── GET /api/sales/orders?scope=mine|all&range=today|7d|...&route=... ──────

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const scope = params.get("scope") ?? "mine";
  const range = params.get("range") ?? "today";
  const customFrom = params.get("custom_from");
  const customTo = params.get("custom_to");
  const route = params.get("route"); // 'normal' | 'tnvs' | null
  const picBucket = params.get("pic_bucket"); // 'inventory' | 'fulfillment' | null
  const q = (params.get("q") ?? "").trim();
  // Combined-state filter: matches the visible badge in the UI. Mapped to
  // status + sync_status server-side so the chip the agent clicks (Draft,
  // Syncing, Synced, Failed, Cancelled, Completed) becomes one query.
  const statusFilter = params.get("status"); // null | "draft" | "syncing" | "synced" | "failed" | "cancelled" | "completed"
  const limit = Math.min(parseInt(params.get("limit") ?? "100", 10) || 100, 500);

  // Range → date filter
  const now = new Date();
  let fromDate: string | null = null;
  if (range === "today") {
    const t = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    fromDate = t.toISOString();
  } else if (range === "yesterday") {
    const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    fromDate = y.toISOString();
  } else if (range === "7d") {
    const d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    fromDate = d.toISOString();
  } else if (range === "14d") {
    const d = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    fromDate = d.toISOString();
  } else if (range === "30d") {
    const d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    fromDate = d.toISOString();
  } else if (range === "custom" && customFrom) {
    fromDate = customFrom;
  }

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (admin as any)
    .from("orders")
    .select(
      "id, avalon_order_number, shopify_order_id, shopify_order_name, " +
        "shopify_order_number, customer_id, created_by_user_id, " +
        "created_by_name, status, sync_status, sync_error, subtotal_amount, " +
        "voucher_code, voucher_discount_amount, manual_discount_amount, " +
        "shipping_fee_amount, final_total_amount, mode_of_payment, " +
        "payment_other_label, payment_receipt_path, " +
        "delivery_method, delivery_method_notes, " +
        "person_in_charge_type, person_in_charge_user_id, person_in_charge_label, " +
        "route_type, completion_status, notes, net_value_amount, is_abandoned_cart, " +
        "ad_creative_id, ad_creative_name, alex_ai_assist_level, " +
        "delivery_status, shopify_financial_status, shopify_fulfillment_status, " +
        "cs_hold_reason, " +
        "created_at, updated_at, confirmed_at, " +
        "customer:customers(id, first_name, last_name, full_name, phone, email)",
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  // PIC bucket queries are department-scoped (Inv/Fulfillment dashboards)
  // and bypass the scope=mine creator filter — agents on those teams see
  // every order routed to their bucket regardless of who created it.
  if (picBucket === "inventory" || picBucket === "fulfillment") {
    // No-op on scope; bucket itself is the filter.
  } else if (scope === "mine") {
    query = query.eq("created_by_user_id", currentUser.id);
  } else if (scope === "all") {
    if (!isManagerOrAbove(currentUser)) {
      return NextResponse.json(
        { error: "Manager role required for scope=all" },
        { status: 403 },
      );
    }
  }

  if (fromDate) {
    query = query.gte("created_at", fromDate);
  }
  if (customTo) {
    query = query.lte("created_at", customTo);
  }
  if (route === "normal" || route === "tnvs") {
    query = query.eq("route_type", route);
  }

  // PIC bucket → orders assigned to a department-style label. Drives
  // /operations/inventory-handoffs and /operations/fulfillment-handoffs.
  // Routing model C (per design): the order's person_in_charge_label
  // is the queue source; no adjustment-row indirection.
  if (picBucket === "inventory") {
    query = query
      .ilike("person_in_charge_label", "%inventory%")
      .not("status", "in", "(cancelled)");
  } else if (picBucket === "fulfillment") {
    query = query
      .ilike("person_in_charge_label", "%fulfillment%")
      .not("status", "in", "(cancelled)");
  }

  // Status chip → status + sync_status filter. Matches the SyncStatusBadge
  // labels exactly so what the agent clicks is what they see.
  switch (statusFilter) {
    case "draft":
      query = query.eq("status", "draft");
      break;
    case "syncing":
      query = query
        .not("status", "in", "(cancelled,completed)")
        .eq("sync_status", "syncing");
      break;
    case "synced":
      query = query
        .not("status", "in", "(cancelled,completed)")
        .eq("sync_status", "synced");
      break;
    case "failed":
      query = query
        .not("status", "in", "(cancelled,completed)")
        .eq("sync_status", "failed");
      break;
    case "cancelled":
      query = query.eq("status", "cancelled");
      break;
    case "completed":
      query = query.eq("status", "completed");
      break;
    default:
      // No status filter — return everything in range.
      break;
  }

  // Search by avalon order number, customer name, or customer phone.
  // PostgREST .or() doesn't traverse foreign tables in one string, so we
  // resolve matching customers first and OR their ids alongside the
  // order-number ilike. Commas stripped defensively (.or() field separator).
  if (q.length >= 2) {
    const safe = q.replace(/,/g, " ");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: matchedCustomers } = await (admin as any)
      .from("customers")
      .select("id")
      .or(`full_name.ilike.%${safe}%,phone.ilike.%${safe}%`)
      .limit(200);
    const matchedIds = ((matchedCustomers ?? []) as Array<{ id: string }>).map(
      (c) => c.id,
    );
    const idsClause =
      matchedIds.length > 0
        ? `customer_id.in.(${matchedIds.join(",")})`
        : null;
    const orParts = [`avalon_order_number.ilike.%${safe}%`];
    if (idsClause) orParts.push(idsClause);
    query = query.or(orParts.join(","));
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Enrich each row with lifecycle_stage + lifecycle_method from v_order_lifecycle.
  const ids = (data ?? []).map((r: { id: string }) => r.id);
  const lifecycleMap = new Map<
    string,
    { lifecycle_stage: string; lifecycle_method: string | null }
  >();
  if (ids.length) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: lifeRows } = await (admin as any)
      .from("v_order_lifecycle")
      .select("order_id, lifecycle_stage, lifecycle_method")
      .in("order_id", ids);
    for (const r of (lifeRows ?? []) as Array<{
      order_id: string;
      lifecycle_stage: string;
      lifecycle_method: string | null;
    }>) {
      lifecycleMap.set(r.order_id, {
        lifecycle_stage: r.lifecycle_stage,
        lifecycle_method: r.lifecycle_method,
      });
    }
  }
  const enriched = (data ?? []).map(
    (row: { id: string } & Record<string, unknown>) => ({
      ...row,
      lifecycle_stage:
        lifecycleMap.get(row.id)?.lifecycle_stage ?? "in_progress",
      lifecycle_method: lifecycleMap.get(row.id)?.lifecycle_method ?? null,
    }),
  );

  return NextResponse.json({ orders: enriched });
}

// ─── POST /api/sales/orders ──────────────────────────────────────────────────
//
// Create a draft order. The drawer's footer "Save as Draft" / "Continue" both
// hit this endpoint. Re-saving a draft uses PATCH /api/sales/orders/[id].

const itemSchema = z.object({
  product_variant_id: z.string().uuid().nullable().optional(),
  shopify_product_id: z.string().nullable().optional(),
  shopify_variant_id: z.string().nullable().optional(),
  product_name: z.string().min(1),
  variant_name: z.string().nullable().optional(),
  image_url: z.string().nullable().optional(),
  size: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  quantity: z.number().int().min(1),
  unit_price_amount: z.number().min(0),
  adjusted_unit_price_amount: z.number().min(0).nullable().optional(),
  line_total_amount: z.number().min(0),
});

const orderSchema = z.object({
  customer_id: z.string().uuid(),
  subtotal_amount: z.number().min(0).default(0),
  voucher_code: z.string().nullable().optional(),
  voucher_discount_amount: z.number().min(0).default(0),
  manual_discount_amount: z.number().min(0).default(0),
  shipping_fee_amount: z.number().min(0).default(0),
  final_total_amount: z.number().min(0).default(0),
  mode_of_payment: z.string().nullable().optional(),
  payment_other_label: z.string().nullable().optional(),
  payment_receipt_path: z.string().nullable().optional(),
  delivery_method: z.enum(["lwe", "tnvs", "other"]).nullable().optional(),
  delivery_method_notes: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  net_value_amount: z.number().min(0).nullable().optional(),
  is_abandoned_cart: z.boolean().nullable().optional(),
  ad_creative_id: z.string().nullable().optional(),
  ad_creative_name: z.string().nullable().optional(),
  alex_ai_assist_level: z.enum(["none", "partial", "full"]).nullable().optional(),
  delivery_status: z.string().nullable().optional(),
  manual_discount_reason: z.string().nullable().optional(),
  apply_automatic_discounts: z.boolean().default(false),
  automatic_discount_snapshot: z.unknown().nullable().optional(),
  payment_reference_number: z.string().nullable().optional(),
  payment_transaction_at: z.string().nullable().optional(),
  items: z.array(itemSchema).min(1),
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = await req.json();
  const { data: body, error: validationError } = validateBody(orderSchema, raw);
  if (validationError) return validationError;

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: order, error: orderErr } = await (admin as any)
    .from("orders")
    .insert({
      customer_id: body.customer_id,
      created_by_user_id: currentUser.id,
      created_by_name: `${currentUser.first_name} ${currentUser.last_name}`,
      status: "draft",
      sync_status: "not_synced",
      subtotal_amount: body.subtotal_amount,
      voucher_code: body.voucher_code ?? null,
      voucher_discount_amount: body.voucher_discount_amount,
      manual_discount_amount: body.manual_discount_amount,
      shipping_fee_amount: body.shipping_fee_amount,
      final_total_amount: body.final_total_amount,
      mode_of_payment: body.mode_of_payment ?? null,
      payment_other_label: body.payment_other_label ?? null,
      payment_receipt_path: body.payment_receipt_path ?? null,
      delivery_method: body.delivery_method ?? null,
      delivery_method_notes: body.delivery_method_notes ?? null,
      // route_type derived server-side from delivery_method (was previously PIC).
      route_type: body.delivery_method === "tnvs" ? "tnvs" : "normal",
      notes: body.notes ?? null,
      net_value_amount: body.net_value_amount ?? null,
      is_abandoned_cart: body.is_abandoned_cart ?? null,
      ad_creative_id: body.ad_creative_id ?? null,
      ad_creative_name: body.ad_creative_name ?? null,
      alex_ai_assist_level: body.alex_ai_assist_level ?? "none",
      delivery_status: body.delivery_status ?? null,
      manual_discount_reason: body.manual_discount_reason ?? null,
      apply_automatic_discounts: body.apply_automatic_discounts ?? false,
      automatic_discount_snapshot: body.automatic_discount_snapshot ?? null,
      payment_reference_number: body.payment_reference_number ?? null,
      payment_transaction_at: body.payment_transaction_at ?? null,
    })
    .select("*")
    .single();

  if (orderErr) {
    return NextResponse.json({ error: orderErr.message }, { status: 500 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: itemsErr } = await (admin as any).from("order_items").insert(
    body.items.map((it) => ({
      order_id: order.id,
      product_variant_id: it.product_variant_id ?? null,
      shopify_product_id: it.shopify_product_id ?? null,
      shopify_variant_id: it.shopify_variant_id ?? null,
      product_name: it.product_name,
      variant_name: it.variant_name ?? null,
      image_url: it.image_url ?? null,
      size: it.size ?? null,
      color: it.color ?? null,
      quantity: it.quantity,
      unit_price_amount: it.unit_price_amount,
      adjusted_unit_price_amount: it.adjusted_unit_price_amount ?? null,
      line_total_amount: it.line_total_amount,
    })),
  );

  if (itemsErr) {
    // Roll back the order row so we don't leave an orphaned header.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any).from("orders").delete().eq("id", order.id);
    return NextResponse.json({ error: itemsErr.message }, { status: 500 });
  }

  // If the draft was created with adjusted prices (bundle-split applied
  // in the drawer), write a single resolved adjustment row for audit.
  // The audit_log_trigger on order_items already captures the raw write;
  // this row gives the CS queue a structured, type-tagged history.
  const splitItems = body.items.filter(
    (it) =>
      it.adjusted_unit_price_amount != null &&
      it.adjusted_unit_price_amount !== it.unit_price_amount,
  );
  if (splitItems.length >= 2) {
    const total = splitItems.reduce(
      (sum, it) => sum + it.unit_price_amount * it.quantity,
      0,
    );
    const totalUnits = splitItems.reduce((sum, it) => sum + it.quantity, 0);
    const splitPrice = splitItems[0].adjusted_unit_price_amount ?? 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any).from("order_adjustments").insert({
      order_id: order.id,
      adjustment_type: "bundle_split_pricing",
      status: "resolved",
      request_text: `Bundle split applied at draft creation (₱${total.toFixed(2)} across ${totalUnits} units → ₱${splitPrice.toFixed(2)} each).`,
      structured_payload: {
        split_price: splitPrice,
        original_total: total,
        line_count: splitItems.length,
        unit_count: totalUnits,
        applied_at_stage: "create",
      },
      created_by_user_id: currentUser.id,
      created_by_name: `${currentUser.first_name} ${currentUser.last_name}`,
      resolved_by_user_id: currentUser.id,
      resolved_at: new Date().toISOString(),
    });
  }

  return NextResponse.json({ order }, { status: 201 });
}
