// @ts-nocheck — vitest is not yet a devDependency in this project.
//
// Run: npx vitest run src/app/api/customer-service/orders/
//
// These tests cover the edit-plan composer in two layers:
//
// Layer A — Pure unit tests for the business-logic helpers (no DB, no net).
//   parsePlanItemPayload  — op-shapes validation
//   computePlanAnalysis   — delta/implication/path computation
//   These pass today with npx vitest because they use relative imports only.
//
// Layer B — Integration specs for the route itself (require running dev server).
//   Same pattern as claim-and-route.test.ts — documented as runnable spec,
//   will pass once TEST_BASE_URL points at a live server.
//
// Coverage:
//   1. parsePlanItemPayload — validates each op correctly, throws on bad payload
//   2. computePlanAnalysis  — same as v-compute-analysis.test.ts (sanity here)
//   3. Route 401 on unauthenticated request
//   4. Route 400 on missing items / bad payload
//   5. Route creates new plan, returns full EditPlan with computed analysis
//   6. Route replaces items on existing draft (idempotent compose)
//   7. Response includes price_delta, payment_implication, proposed_path

import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';

// ─── Relative imports — work without @/ alias resolution ────────────────────
import {
  parsePlanItemPayload,
  AddItemPayloadSchema,
  RemoveItemPayloadSchema,
  QtyChangePayloadSchema,
  AddressShippingPayloadSchema,
  AddressBillingPayloadSchema,
  NotePayloadSchema,
} from '../../../../../../../lib/cs/edit-plan/op-shapes';

import { computePlanAnalysis } from '../../../../../../../lib/cs/edit-plan/compute-analysis';
import type { CurrentOrder, CurrentOrderItem } from '../../../../../../../lib/cs/edit-plan/compute-analysis';
import type { EditPlanItem } from '../../../../../../../lib/cs/edit-plan/types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ORDER: CurrentOrder = {
  total_amount: 10000,
  intake_lane: 'sales',
  shopify_financial_status: 'paid',
};

const ORDER_ITEMS: CurrentOrderItem[] = [
  { id: '101', unit_price_amount: 500, quantity: 2, line_total_amount: 1000 },
  { id: '102', unit_price_amount: 300, quantity: 1, line_total_amount: 300 },
];

function makeItem(op: EditPlanItem['op'], payload: unknown, id = 1): EditPlanItem {
  return { id, op, payload, created_at: new Date().toISOString() };
}

// ─── Layer A: parsePlanItemPayload ────────────────────────────────────────────

describe('parsePlanItemPayload — valid payloads', () => {
  it('parses add_item correctly', () => {
    const result = parsePlanItemPayload('add_item', {
      variant_id: 'v-123',
      qty: 2,
      unit_price: 500,
    });
    expect(result).toEqual({ variant_id: 'v-123', qty: 2, unit_price: 500 });
  });

  it('parses remove_item correctly', () => {
    const result = parsePlanItemPayload('remove_item', { line_item_id: '101' });
    expect(result).toEqual({ line_item_id: '101' });
  });

  it('parses qty_change correctly', () => {
    const result = parsePlanItemPayload('qty_change', {
      line_item_id: '101',
      new_qty: 5,
    });
    expect(result).toEqual({ line_item_id: '101', new_qty: 5 });
  });

  it('parses address_shipping correctly (optional fields absent)', () => {
    const result = parsePlanItemPayload('address_shipping', {
      street: '123 Main',
      city: 'Manila',
      country: 'PH',
    });
    expect(result).toMatchObject({ street: '123 Main', city: 'Manila', country: 'PH' });
  });

  it('parses address_billing with all optional fields', () => {
    const result = parsePlanItemPayload('address_billing', {
      street: '1 Billing',
      city: 'QC',
      country: 'PH',
      province: 'Metro Manila',
      zip: '1100',
      phone: '+63912',
      recipient_name: 'Jane',
    });
    expect(result).toMatchObject({ zip: '1100', recipient_name: 'Jane' });
  });

  it('parses note correctly', () => {
    const result = parsePlanItemPayload('note', { text: 'Gift wrap please' });
    expect(result).toEqual({ text: 'Gift wrap please' });
  });
});

describe('parsePlanItemPayload — invalid payloads throw ZodError', () => {
  it('add_item missing qty throws', () => {
    expect(() =>
      parsePlanItemPayload('add_item', { variant_id: 'v1', unit_price: 100 }),
    ).toThrow(ZodError);
  });

  it('add_item negative unit_price throws', () => {
    expect(() =>
      parsePlanItemPayload('add_item', { variant_id: 'v1', qty: 1, unit_price: -5 }),
    ).toThrow(ZodError);
  });

  it('add_item zero qty throws (must be positive)', () => {
    expect(() =>
      parsePlanItemPayload('add_item', { variant_id: 'v1', qty: 0, unit_price: 100 }),
    ).toThrow(ZodError);
  });

  it('remove_item missing line_item_id throws', () => {
    expect(() => parsePlanItemPayload('remove_item', {})).toThrow(ZodError);
  });

  it('qty_change negative new_qty throws', () => {
    expect(() =>
      parsePlanItemPayload('qty_change', { line_item_id: '101', new_qty: -1 }),
    ).toThrow(ZodError);
  });

  it('note with empty text throws', () => {
    expect(() => parsePlanItemPayload('note', { text: '' })).toThrow(ZodError);
  });

  it('unknown op throws plain Error', () => {
    expect(() => parsePlanItemPayload('unknown_op', {})).toThrow(
      /Unknown op: "unknown_op"/,
    );
  });
});

// ─── Layer A: computePlanAnalysis (sanity — full suite in v-compute-analysis) ─

describe('computePlanAnalysis — route-level sanity checks', () => {
  it('add_item produces additional_charge and order_edit', () => {
    const items = [makeItem('add_item', { variant_id: 'v1', qty: 1, unit_price: 200 })];
    const result = computePlanAnalysis(ORDER, items, ORDER_ITEMS);
    expect(result.price_delta).toBe(200);
    expect(result.payment_implication).toBe('additional_charge');
    expect(result.proposed_path).toBe('order_edit');
  });

  it('remove_item produces refund_due', () => {
    const items = [makeItem('remove_item', { line_item_id: '101' })];
    const result = computePlanAnalysis(ORDER, items, ORDER_ITEMS);
    expect(result.price_delta).toBe(-1000);
    expect(result.payment_implication).toBe('refund_due');
  });

  it('note-only produces no_change', () => {
    const items = [makeItem('note', { text: 'Just a note' })];
    const result = computePlanAnalysis(ORDER, items, ORDER_ITEMS);
    expect(result.price_delta).toBe(0);
    expect(result.payment_implication).toBe('no_change');
  });
});

// ─── Layer B: Route integration specs ────────────────────────────────────────
// These hit the running dev server and are documented as runnable spec.
// They follow the same pattern as claim-and-route.test.ts — they pass once
// TEST_BASE_URL points at a live server with migrations 00101 applied.

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3000';

async function composeEditPlan(
  orderId: string | number,
  body: unknown,
  cookie: string,
) {
  return fetch(
    `${BASE}/api/customer-service/orders/${orderId}/edit-plan`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify(body),
    },
  );
}

describe('POST /api/customer-service/orders/[id]/edit-plan — integration', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await composeEditPlan('test-order-id', { items: [] }, '');
    expect(res.status).toBe(401);
  });

  it('returns 400 when items array is missing', async () => {
    const res = await composeEditPlan('test-order-id', {}, 'cs-rep-cookie');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.issues).toBeInstanceOf(Array);
  });

  it('returns 400 when add_item payload is missing qty', async () => {
    const res = await composeEditPlan(
      'test-order-id',
      {
        items: [{ op: 'add_item', payload: { variant_id: 'v1' } }],
      },
      'cs-rep-cookie',
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid payload for op "add_item"/i);
  });

  it('creates a new draft plan with computed analysis', async () => {
    // Requires: test-order-id seeded with status=confirmed, migration 00101 applied
    const res = await composeEditPlan(
      'test-order-id',
      {
        items: [
          { op: 'add_item', payload: { variant_id: 'v-new', qty: 1, unit_price: 500 } },
          { op: 'note', payload: { text: 'Called in by customer' } },
        ],
      },
      'cs-rep-cookie',
    );
    expect(res.status).toBe(200);
    const { plan } = await res.json();
    expect(plan.status).toBe('draft');
    expect(plan.items).toHaveLength(2);
    expect(plan.price_delta).toBe(500); // 1 * 500
    expect(plan.payment_implication).toBe('additional_charge');
    expect(plan.proposed_path).toBe('order_edit');
    expect(plan.applied_at).toBeNull();
    expect(plan.error_message).toBeNull();
  });

  it('replaces items on an existing draft (idempotent compose)', async () => {
    // First compose — creates the draft
    await composeEditPlan(
      'test-order-id',
      { items: [{ op: 'note', payload: { text: 'First version' } }] },
      'cs-rep-cookie',
    );

    // Second compose on the same order — replaces items
    const res = await composeEditPlan(
      'test-order-id',
      {
        items: [
          { op: 'address_shipping', payload: { street: '1 New St', city: 'BGC', country: 'PH' } },
        ],
      },
      'cs-rep-cookie',
    );
    expect(res.status).toBe(200);
    const { plan } = await res.json();
    // Should be the same plan (same id), but with 1 item (not 2)
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0].op).toBe('address_shipping');
    expect(plan.price_delta).toBe(0);
    expect(plan.payment_implication).toBe('no_change');
  });
});
