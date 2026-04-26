import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateBody } from "@/lib/api/validate";

type RouteContext = { params: Promise<{ id: string }> };

const ADJUSTMENT_TYPES = [
  "bundle_split_pricing",
  "item_replacement",
  "quantity_correction",
  "fulfillment_request",
  "inventory_issue",
  "customer_service_request",
  "other",
] as const;

const schema = z.object({
  adjustment_type: z.enum(ADJUSTMENT_TYPES),
  request_text: z.string().min(1).max(2000),
  assigned_to_user_id: z.string().uuid().nullable().optional(),
  assigned_to_label: z.string().max(120).nullable().optional(),
  structured_payload: z.record(z.string(), z.unknown()).nullable().optional(),
});

// ─── POST /api/sales/orders/[id]/adjustments ────────────────────────────────
//
// Sales (or any role) opens an adjustment ticket against an order. Lands in
// the CS queue (or the assigned user's queue) as status='open'.

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
    .select("id, status")
    .eq("id", id)
    .maybeSingle();
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  if (order.status === "cancelled") {
    return NextResponse.json(
      { error: "Cannot open an adjustment on a cancelled order." },
      { status: 409 },
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: adjustment, error } = await (admin as any)
    .from("order_adjustments")
    .insert({
      order_id: id,
      adjustment_type: body.adjustment_type,
      status: "open",
      request_text: body.request_text,
      assigned_to_user_id: body.assigned_to_user_id ?? null,
      assigned_to_label: body.assigned_to_label ?? null,
      structured_payload: body.structured_payload ?? null,
      created_by_user_id: currentUser.id,
      created_by_name: `${currentUser.first_name} ${currentUser.last_name}`,
    })
    .select("*")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ adjustment }, { status: 201 });
}

// ─── GET /api/sales/orders/[id]/adjustments ─────────────────────────────────
//
// Per-order adjustment list, used by the expanded row + ticket history view.

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("order_adjustments")
    .select("*")
    .eq("order_id", id)
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ adjustments: data ?? [] });
}
