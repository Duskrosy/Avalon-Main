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
      "id, avalon_order_number, shopify_order_id, customer_id, created_by_user_id, " +
        "created_by_name, status, sync_status, sync_error, subtotal_amount, " +
        "voucher_code, voucher_discount_amount, manual_discount_amount, " +
        "shipping_fee_amount, final_total_amount, mode_of_payment, " +
        "person_in_charge_type, person_in_charge_user_id, person_in_charge_label, " +
        "route_type, completion_status, notes, net_value_amount, is_abandoned_cart, " +
        "ad_campaign_source, alex_ai_assist, delivery_status, " +
        "created_at, updated_at, confirmed_at, " +
        "customer:customers(id, first_name, last_name, full_name, phone, email)",
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (scope === "mine") {
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
  return NextResponse.json({ orders: data ?? [] });
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
  person_in_charge_type: z.enum(["user", "custom", "lalamove"]).nullable().optional(),
  person_in_charge_user_id: z.string().uuid().nullable().optional(),
  person_in_charge_label: z.string().nullable().optional(),
  route_type: z.enum(["normal", "tnvs"]).default("normal"),
  notes: z.string().nullable().optional(),
  // Optional Phase 1 inline completion fields (Handoff step expand-collapse).
  net_value_amount: z.number().min(0).nullable().optional(),
  is_abandoned_cart: z.boolean().nullable().optional(),
  ad_campaign_source: z.string().nullable().optional(),
  alex_ai_assist: z.boolean().nullable().optional(),
  delivery_status: z.string().nullable().optional(),
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

  // Auto-route TNVS based on PIC label (case-insensitive 'lalamove').
  const routeType =
    body.person_in_charge_label?.toLowerCase() === "lalamove" ||
    body.person_in_charge_type === "lalamove"
      ? "tnvs"
      : body.route_type;

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
      person_in_charge_type: body.person_in_charge_type ?? null,
      person_in_charge_user_id: body.person_in_charge_user_id ?? null,
      person_in_charge_label: body.person_in_charge_label ?? null,
      route_type: routeType,
      notes: body.notes ?? null,
      net_value_amount: body.net_value_amount ?? null,
      is_abandoned_cart: body.is_abandoned_cart ?? null,
      ad_campaign_source: body.ad_campaign_source ?? null,
      alex_ai_assist: body.alex_ai_assist ?? null,
      delivery_status: body.delivery_status ?? null,
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

  return NextResponse.json({ order }, { status: 201 });
}
