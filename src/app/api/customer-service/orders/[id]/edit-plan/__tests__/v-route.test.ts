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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ZodError } from 'zod';
import { NextRequest } from 'next/server';

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

// ─── Mock setup for Layer B (must be hoisted before route import) ────────────
// Pattern source: src/app/api/customer-service/orders/[id]/full/__tests__/v-route.test.ts
// Tests run without a live dev server — supabase clients and permissions are mocked.

let mockGetUser: ReturnType<typeof vi.fn>;
let mockFrom: ReturnType<typeof vi.fn>;

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn() },
  })),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
}));

vi.mock('@/lib/permissions', () => ({
  getCurrentUser: vi.fn(async () => mockGetUser()),
}));

// Import POST after mocks are declared (vi.mock is hoisted automatically).
import { POST } from '../route';

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

// ─── Layer B: Route handler tests with mocked supabase + permissions ────────
//
// Pattern source: src/app/api/customer-service/orders/[id]/full/__tests__/v-route.test.ts
// Direct POST(request, ctx) invocation; supabase clients and getCurrentUser
// are mocked at module boundary. No dev server required.
//
// mockFrom dispatches by table name. Each test wires a per-table chain.

const VALID_ORDER_UUID = '00000000-0000-0000-0000-000000000001';
const VALID_USER = { id: 'user-uuid-1', role: { tier: 3 } };

function makeRequest(orderId: string, body: unknown): NextRequest {
  return new NextRequest(
    `http://localhost/api/customer-service/orders/${orderId}/edit-plan`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
  );
}

function makeCtx(orderId: string) {
  return { params: Promise.resolve({ id: orderId }) };
}

beforeEach(() => {
  mockGetUser = vi.fn(() => VALID_USER);
  mockFrom = vi.fn();
});

describe('POST /api/customer-service/orders/[id]/edit-plan — route handler', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetUser = vi.fn(() => null);

    const res = await POST(makeRequest(VALID_ORDER_UUID, { items: [] }), makeCtx(VALID_ORDER_UUID));
    expect(res.status).toBe(401);
  });

  it('returns 400 when path id is not a uuid', async () => {
    const res = await POST(makeRequest('not-a-uuid', { items: [] }), makeCtx('not-a-uuid'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid order id/i);
  });

  it('returns 400 when items array is missing', async () => {
    const res = await POST(makeRequest(VALID_ORDER_UUID, {}), makeCtx(VALID_ORDER_UUID));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.issues).toBeInstanceOf(Array);
  });

  it('returns 400 when add_item payload is missing qty', async () => {
    const res = await POST(
      makeRequest(VALID_ORDER_UUID, {
        items: [{ op: 'add_item', payload: { variant_id: 'v1' } }],
      }),
      makeCtx(VALID_ORDER_UUID),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid payload for op "add_item"/i);
  });

  it('creates a new draft plan with computed analysis', async () => {
    // Wire the per-table chains:
    //   cs_edit_plans select → no existing draft (maybeSingle returns null)
    //   cs_edit_plans insert → returns the new plan row
    //   cs_edit_plan_items insert → returns the inserted items
    //   orders select → returns the current order row
    //   order_items select → returns current items
    const newPlanRow = {
      id: 42,
      status: 'draft',
      chosen_path: null,
      applied_at: null,
      error_message: null,
      created_at: '2026-05-03T00:00:00Z',
      updated_at: '2026-05-03T00:00:00Z',
    };
    const insertedItems = [
      { id: 1, op: 'add_item', payload: { variant_id: 'v-new', qty: 1, unit_price: 500 }, created_at: '2026-05-03T00:00:00Z' },
      { id: 2, op: 'note', payload: { text: 'Called in by customer' }, created_at: '2026-05-03T00:00:00Z' },
    ];
    const orderRow = {
      id: VALID_ORDER_UUID,
      final_total_amount: 10000,
      intake_lane: 'sales',
      shopify_financial_status: 'paid',
    };
    const orderItemsRows: never[] = []; // empty — add_item doesn't reference existing items

    mockFrom.mockImplementation((table: string) => {
      if (table === 'cs_edit_plans') {
        return {
          // select chain ending in maybeSingle → null (no existing draft)
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
          // insert chain ending in single → the new plan row
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: newPlanRow, error: null }),
            }),
          }),
        };
      }
      if (table === 'cs_edit_plan_items') {
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue({ data: insertedItems, error: null }),
          }),
        };
      }
      if (table === 'orders') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: orderRow, error: null }),
            }),
          }),
        };
      }
      if (table === 'order_items') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: orderItemsRows, error: null }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const res = await POST(
      makeRequest(VALID_ORDER_UUID, {
        items: [
          { op: 'add_item', payload: { variant_id: 'v-new', qty: 1, unit_price: 500 } },
          { op: 'note', payload: { text: 'Called in by customer' } },
        ],
      }),
      makeCtx(VALID_ORDER_UUID),
    );

    expect(res.status).toBe(200);
    const { plan } = await res.json();
    expect(plan.status).toBe('draft');
    expect(plan.items).toHaveLength(2);
    expect(plan.price_delta).toBe(500);
    expect(plan.payment_implication).toBe('additional_charge');
    expect(plan.proposed_path).toBe('order_edit');
    expect(plan.applied_at).toBeNull();
    expect(plan.error_message).toBeNull();
  });

  it('replaces items on an existing draft (idempotent compose)', async () => {
    // Existing draft path:
    //   cs_edit_plans select → existing draft row
    //   cs_edit_plan_items delete → ok
    //   cs_edit_plans update → same plan id, refreshed updated_at
    //   cs_edit_plan_items insert → new single address item
    //   orders + order_items selects as in previous test
    const existingPlan = {
      id: 7,
      status: 'draft',
      chosen_path: null,
      applied_at: null,
      error_message: null,
      created_at: '2026-05-02T00:00:00Z',
      updated_at: '2026-05-02T00:00:00Z',
    };
    const updatedPlan = { ...existingPlan, updated_at: '2026-05-03T00:00:00Z' };
    const insertedItems = [
      {
        id: 99,
        op: 'address_shipping',
        payload: { street: '1 New St', city: 'BGC', country: 'PH' },
        created_at: '2026-05-03T00:00:00Z',
      },
    ];
    const orderRow = {
      id: VALID_ORDER_UUID,
      final_total_amount: 10000,
      intake_lane: 'sales',
      shopify_financial_status: 'paid',
    };

    mockFrom.mockImplementation((table: string) => {
      if (table === 'cs_edit_plans') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: existingPlan, error: null }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: updatedPlan, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === 'cs_edit_plan_items') {
        return {
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue({ data: insertedItems, error: null }),
          }),
        };
      }
      if (table === 'orders') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: orderRow, error: null }),
            }),
          }),
        };
      }
      if (table === 'order_items') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const res = await POST(
      makeRequest(VALID_ORDER_UUID, {
        items: [
          { op: 'address_shipping', payload: { street: '1 New St', city: 'BGC', country: 'PH' } },
        ],
      }),
      makeCtx(VALID_ORDER_UUID),
    );

    expect(res.status).toBe(200);
    const { plan } = await res.json();
    expect(plan.id).toBe(7); // same plan id (existing draft, not new)
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0].op).toBe('address_shipping');
    expect(plan.price_delta).toBe(0);
    expect(plan.payment_implication).toBe('no_change');
  });

  it('returns 409 when concurrent draft insert hits unique violation (23505)', async () => {
    // Race path: select returns no existing draft, but INSERT trips the
    // partial unique index (cs_edit_plans (order_id) WHERE status='draft')
    // because another rep just composed one. PG returns 23505 → 409.
    mockFrom.mockImplementation((table: string) => {
      if (table === 'cs_edit_plans') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: null,
                error: { code: '23505', message: 'unique violation' },
              }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const res = await POST(
      makeRequest(VALID_ORDER_UUID, { items: [] }),
      makeCtx(VALID_ORDER_UUID),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/another rep/i);
  });

  it('returns 404 when order does not exist', async () => {
    const newPlanRow = {
      id: 1,
      status: 'draft',
      chosen_path: null,
      applied_at: null,
      error_message: null,
      created_at: '2026-05-03T00:00:00Z',
      updated_at: '2026-05-03T00:00:00Z',
    };
    mockFrom.mockImplementation((table: string) => {
      if (table === 'cs_edit_plans') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: newPlanRow, error: null }),
            }),
          }),
        };
      }
      if (table === 'cs_edit_plan_items') {
        // No items inserted (empty items array).
        return {};
      }
      if (table === 'orders') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const res = await POST(
      makeRequest(VALID_ORDER_UUID, { items: [] }),
      makeCtx(VALID_ORDER_UUID),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/order not found/i);
  });
});
