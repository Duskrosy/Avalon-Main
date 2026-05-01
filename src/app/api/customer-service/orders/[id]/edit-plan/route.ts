// src/app/api/customer-service/orders/[id]/edit-plan/route.ts
//
// POST /api/customer-service/orders/[id]/edit-plan
//
// Creates or replaces the active 'draft' edit plan for an order.
// Phase A only — pure DB writes, no Shopify integration.
// The apply endpoint (Phase B) lives in a separate file.

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/permissions';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parsePlanItemPayload } from '@/lib/cs/edit-plan/op-shapes';
import { computePlanAnalysis } from '@/lib/cs/edit-plan/compute-analysis';
import type { EditPlan, EditPlanItem, EditPlanOp } from '@/lib/cs/edit-plan/types';
import type { CurrentOrderItem } from '@/lib/cs/edit-plan/compute-analysis';

type RouteContext = { params: Promise<{ id: string }> };

// ─── Request body schema ──────────────────────────────────────────────────────

const OpEnum = z.enum([
  'add_item',
  'remove_item',
  'qty_change',
  'address_shipping',
  'address_billing',
  'note',
]);

const ComposeBodySchema = z.object({
  items: z.array(
    z.object({
      op: OpEnum,
      payload: z.unknown(),
    }),
  ),
});

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;

  // 1. Auth — same pattern as triage/route.ts
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Validate path param
  const orderId = parseInt(id, 10);
  if (isNaN(orderId)) {
    return NextResponse.json({ error: 'Invalid order id' }, { status: 400 });
  }

  // 3. Parse and validate body
  const raw = await req.json().catch(() => null);
  const parsed = ComposeBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // 4. Validate each item's payload against its op-specific schema
  const validatedItems: Array<{ op: EditPlanOp; payload: unknown }> = [];
  for (const item of parsed.data.items) {
    try {
      const validPayload = parsePlanItemPayload(item.op, item.payload);
      validatedItems.push({ op: item.op as EditPlanOp, payload: validPayload });
    } catch (err) {
      if (err instanceof Error) {
        return NextResponse.json(
          { error: `Invalid payload for op "${item.op}"`, details: err.message },
          { status: 400 },
        );
      }
      return NextResponse.json(
        { error: `Invalid payload for op "${item.op}"` },
        { status: 400 },
      );
    }
  }

  const admin = createAdminClient();

  // 5. Find existing draft plan for this order
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existingPlan, error: planFetchErr } = await (admin as any)
    .from('cs_edit_plans')
    .select('id, status, chosen_path, applied_at, error_message, created_at, updated_at')
    .eq('order_id', orderId)
    .eq('status', 'draft')
    .maybeSingle();

  if (planFetchErr) {
    return NextResponse.json({ error: planFetchErr.message }, { status: 500 });
  }

  let planId: number;
  let planRow: {
    id: number;
    status: string;
    chosen_path: string | null;
    applied_at: string | null;
    error_message: string | null;
    created_at: string;
    updated_at: string;
  };

  if (existingPlan) {
    // 6a. Existing draft: replace its items
    planId = existingPlan.id;

    // DELETE existing items (cascade would handle on plan delete, but we're
    // keeping the plan and replacing items in-place)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: deleteErr } = await (admin as any)
      .from('cs_edit_plan_items')
      .delete()
      .eq('plan_id', planId);

    if (deleteErr) {
      return NextResponse.json({ error: deleteErr.message }, { status: 500 });
    }

    // UPDATE plan's updated_at
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: updatedPlan, error: updateErr } = await (admin as any)
      .from('cs_edit_plans')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', planId)
      .select('id, status, chosen_path, applied_at, error_message, created_at, updated_at')
      .single();

    if (updateErr || !updatedPlan) {
      return NextResponse.json({ error: updateErr?.message ?? 'Plan update failed' }, { status: 500 });
    }
    planRow = updatedPlan;
  } else {
    // 6b. No existing draft: create a new plan
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: newPlan, error: insertErr } = await (admin as any)
      .from('cs_edit_plans')
      .insert({
        order_id: orderId,
        status: 'draft',
        created_by_user_id: user.id,
      })
      .select('id, status, chosen_path, applied_at, error_message, created_at, updated_at')
      .single();

    if (insertErr || !newPlan) {
      return NextResponse.json(
        { error: insertErr?.message ?? 'Plan creation failed' },
        { status: 500 },
      );
    }
    planId = newPlan.id;
    planRow = newPlan;
  }

  // 7. Insert the new items
  let insertedItems: EditPlanItem[] = [];
  if (validatedItems.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: items, error: itemsErr } = await (admin as any)
      .from('cs_edit_plan_items')
      .insert(
        validatedItems.map((item) => ({
          plan_id: planId,
          op: item.op,
          payload: item.payload,
        })),
      )
      .select('id, op, payload, created_at');

    if (itemsErr) {
      return NextResponse.json({ error: itemsErr.message }, { status: 500 });
    }
    insertedItems = (items ?? []) as EditPlanItem[];
  }

  // 8. Load current order + order_items for analysis
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: orderRow, error: orderErr } = await (admin as any)
    .from('orders')
    .select('id, final_total_amount, intake_lane, shopify_financial_status')
    .eq('id', orderId)
    .maybeSingle();

  if (orderErr || !orderRow) {
    return NextResponse.json(
      { error: orderErr?.message ?? 'Order not found' },
      { status: 500 },
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: orderItemsRaw, error: orderItemsErr } = await (admin as any)
    .from('order_items')
    .select('id, unit_price_amount, quantity, line_total_amount')
    .eq('order_id', orderId);

  if (orderItemsErr) {
    return NextResponse.json({ error: orderItemsErr.message }, { status: 500 });
  }

  const currentOrderItems: CurrentOrderItem[] = (orderItemsRaw ?? []).map(
    (oi: { id: string | number; unit_price_amount: number; quantity: number; line_total_amount: number }) => ({
      id: String(oi.id),
      unit_price_amount: oi.unit_price_amount,
      quantity: oi.quantity,
      line_total_amount: oi.line_total_amount,
    }),
  );

  // 9. Run analysis
  const analysis = computePlanAnalysis(
    {
      total_amount: orderRow.final_total_amount ?? 0,
      intake_lane: orderRow.intake_lane,
      shopify_financial_status: orderRow.shopify_financial_status,
    },
    insertedItems,
    currentOrderItems,
  );

  // 10. Build and return the full EditPlan response
  const plan: EditPlan = {
    id: planRow.id,
    order_id: orderId,
    status: planRow.status as EditPlan['status'],
    chosen_path: planRow.chosen_path as EditPlan['chosen_path'],
    items: insertedItems,
    price_delta: analysis.price_delta,
    payment_implication: analysis.payment_implication,
    proposed_path: analysis.proposed_path,
    applied_at: planRow.applied_at,
    error_message: planRow.error_message,
  };

  return NextResponse.json({ plan });
}
