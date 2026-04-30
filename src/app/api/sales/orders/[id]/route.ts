import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isManagerOrAbove } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateBody } from "@/lib/api/validate";

type RouteContext = { params: Promise<{ id: string }> };

// ─── GET /api/sales/orders/[id] ──────────────────────────────────────────────

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: order, error } = await (admin as any)
    .from("orders")
    .select(
      "*, customer:customers(*), items:order_items(*), syncs:order_shopify_syncs(*)",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Owner-or-manager view
  if (
    order.created_by_user_id !== currentUser.id &&
    !isManagerOrAbove(currentUser)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Enrich with lifecycle_stage + lifecycle_method from v_order_lifecycle.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: life } = await (admin as any)
    .from("v_order_lifecycle")
    .select("lifecycle_stage, lifecycle_method")
    .eq("order_id", id)
    .maybeSingle();

  return NextResponse.json({
    order: {
      ...order,
      lifecycle_stage: life?.lifecycle_stage ?? "in_progress",
      lifecycle_method: life?.lifecycle_method ?? null,
    },
  });
}

// ─── PATCH /api/sales/orders/[id] — drafts only ─────────────────────────────
//
// Phase 1 rule: confirmed orders are immutable via PATCH. Use revert-to-draft
// for post-confirm edits. Phase 2 will add the 15-min in-place edit window.

const patchSchema = z.object({
  customer_id: z.string().uuid().nullable().optional(),
  subtotal_amount: z.number().min(0).nullable().optional(),
  voucher_code: z.string().nullable().optional(),
  voucher_discount_amount: z.number().min(0).nullable().optional(),
  manual_discount_amount: z.number().min(0).nullable().optional(),
  shipping_fee_amount: z.number().min(0).nullable().optional(),
  final_total_amount: z.number().min(0).nullable().optional(),
  mode_of_payment: z.string().nullable().optional(),
  payment_other_label: z.string().nullable().optional(),
  payment_receipt_path: z.string().nullable().optional(),
  delivery_method: z.enum(["lwe", "tnvs", "other"]).nullable().optional(),
  delivery_method_notes: z.string().nullable().optional(),
  person_in_charge_type: z
    .enum(["user", "custom", "lalamove"])
    .nullable()
    .optional(),
  person_in_charge_user_id: z.string().uuid().nullable().optional(),
  person_in_charge_label: z.string().nullable().optional(),
  route_type: z.enum(["normal", "tnvs"]).nullable().optional(),
  cs_hold_reason: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  net_value_amount: z.number().min(0).nullable().optional(),
  is_abandoned_cart: z.boolean().nullable().optional(),
  ad_creative_id: z.string().nullable().optional(),
  ad_creative_name: z.string().nullable().optional(),
  alex_ai_assist_level: z.enum(["none", "partial", "full"]).nullable().optional(),
  delivery_status: z.string().nullable().optional(),
  manual_discount_reason: z.string().nullable().optional(),
  apply_automatic_discounts: z.boolean().optional(),
  automatic_discount_snapshot: z.unknown().nullable().optional(),
  payment_reference_number: z.string().nullable().optional(),
  payment_transaction_at: z.string().nullable().optional(),
  items: z
    .array(
      z.object({
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
      }),
    )
    .optional(),
});

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = await req.json();
  const { data: body, error: validationError } = validateBody(patchSchema, raw);
  if (validationError) return validationError;

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (admin as any)
    .from("orders")
    .select("id, status, created_by_user_id")
    .eq("id", id)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (
    existing.created_by_user_id !== currentUser.id &&
    !isManagerOrAbove(currentUser)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (existing.status !== "draft") {
    return NextResponse.json(
      {
        error:
          "Only draft orders can be edited. Use POST /revert-to-draft for post-confirm edits.",
      },
      { status: 409 },
    );
  }

  const { items, ...orderFields } = body;
  if (Object.keys(orderFields).length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateErr } = await (admin as any)
      .from("orders")
      .update(orderFields)
      .eq("id", id);
    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }
  }

  if (items) {
    // Replace strategy: delete existing items, insert new set. Audit trigger
    // on order_items captures the change. Cascade is via FK ON DELETE CASCADE
    // from orders, but we want to keep the order row.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: delErr } = await (admin as any)
      .from("order_items")
      .delete()
      .eq("order_id", id);
    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: insErr } = await (admin as any).from("order_items").insert(
      items.map((it) => ({
        order_id: id,
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
    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: updated } = await (admin as any)
    .from("orders")
    .select("*, items:order_items(*)")
    .eq("id", id)
    .maybeSingle();

  return NextResponse.json({ order: updated });
}

// ─── DELETE /api/sales/orders/[id] — drafts only (alias of cancel) ─────────
//
// Returns 409 with redirect-message if status != 'draft'. Cancel of confirmed
// or synced orders goes through POST /cancel, which handles Shopify cancel +
// inventory release via the releaseOrder helper.

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (admin as any)
    .from("orders")
    .select("id, status, created_by_user_id")
    .eq("id", id)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (
    existing.created_by_user_id !== currentUser.id &&
    !isManagerOrAbove(currentUser)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (existing.status !== "draft") {
    return NextResponse.json(
      {
        error: "Only draft orders can be deleted. Use POST /cancel for confirmed orders.",
      },
      { status: 409 },
    );
  }

  // Hard-delete drafts (no audit value in keeping a never-confirmed shell).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any).from("orders").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
