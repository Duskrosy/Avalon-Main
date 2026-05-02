// src/app/api/customer-service/orders/[id]/edit-plan/[planId]/apply/route.ts
//
// POST /api/customer-service/orders/[id]/edit-plan/[planId]/apply
//
// Thin HTTP shell. All orchestration (state transitions, Shopify calls,
// idempotency, race handling) lives in src/lib/cs/edit-plan/apply.ts so it
// is unit-testable without spinning up the route. This file is auth +
// param parsing + library call + response shaping.

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/permissions';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { applyPlan } from '@/lib/cs/edit-plan/apply';
import {
  orderEditBegin,
  orderEditUpdateShippingAddress,
  orderEditCommit,
} from '@/lib/shopify/client';

type RouteContext = { params: Promise<{ id: string; planId: string }> };

export async function POST(_req: NextRequest, ctx: RouteContext) {
  const { id, planId: planIdParam } = await ctx.params;

  // 1. Auth — same pattern as the compose endpoint.
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Validate path params
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Invalid order id' }, { status: 400 });
  }
  const planIdNum = Number(planIdParam);
  if (!Number.isInteger(planIdNum) || planIdNum <= 0) {
    return NextResponse.json({ error: 'Invalid plan id' }, { status: 400 });
  }

  // 3. Pre-flight: confirm the plan belongs to this order. Prevents the
  // attack/typo where a rep posts to /orders/A/edit-plan/{planB.id}/apply
  // and applies an unrelated order's plan.
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: planMatch } = await (admin as any)
    .from('cs_edit_plans')
    .select('id, order_id')
    .eq('id', planIdNum)
    .maybeSingle();

  if (!planMatch || planMatch.order_id !== id) {
    console.warn('[edit-plan/apply] plan/order mismatch', {
      requested_order_id: id,
      requested_plan_id: planIdNum,
      actual_order_id: planMatch?.order_id ?? null,
      user_id: user.id,
    });
    return NextResponse.json(
      { error: 'Plan does not belong to this order' },
      { status: 404 },
    );
  }

  // 4. Delegate to the library. Inject Shopify deps as plain function refs
  // so the orchestration is testable without HTTP.
  const result = await applyPlan(planIdNum, {
    admin,
    shopify: {
      orderEditBegin,
      orderEditUpdateShippingAddress,
      orderEditCommit,
    },
  });

  // 5. Shape response per result kind.
  switch (result.status) {
    case 'applied':
      console.info('[edit-plan/apply] applied', {
        plan_id: planIdNum,
        order_id: id,
        commit_id: result.commit_id,
        user_id: user.id,
      });
      return NextResponse.json({
        status: 'applied',
        commit_id: result.commit_id,
      });
    case 'race':
      console.warn('[edit-plan/apply] race', {
        plan_id: planIdNum,
        order_id: id,
        reason: result.reason,
        user_id: user.id,
      });
      if (result.reason === 'plan_not_found') {
        return NextResponse.json(
          { error: 'Plan not found' },
          { status: 404 },
        );
      }
      return NextResponse.json(
        {
          error:
            'Plan is no longer in draft state. Another rep may have applied or cancelled it. Refresh and try again.',
        },
        { status: 409 },
      );
    case 'failed':
      console.error('[edit-plan/apply] failed', {
        plan_id: planIdNum,
        order_id: id,
        error: result.error,
        user_id: user.id,
      });
      return NextResponse.json(
        { error: result.error },
        { status: 400 },
      );
  }
}
