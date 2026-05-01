// @ts-nocheck — vitest is not yet a devDependency in this project.
//
// Run: npx vitest run src/lib/cs/edit-plan/__tests__/v-compute-analysis.test.ts
//
// Pure-function tests — no DB required, no env vars needed.

import { describe, it, expect } from 'vitest';
import { computePlanAnalysis } from '../compute-analysis';
import type { CurrentOrder, CurrentOrderItem } from '../compute-analysis';
import type { EditPlanItem } from '../types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ORDER: CurrentOrder = {
  total_amount: 10000,
  intake_lane: 'sales',
  shopify_financial_status: 'paid',
};

const ORDER_ITEMS: CurrentOrderItem[] = [
  { id: '101', unit_price_amount: 500, quantity: 2, line_total_amount: 1000 },
  { id: '102', unit_price_amount: 300, quantity: 1, line_total_amount: 300 },
  { id: '103', unit_price_amount: 1500, quantity: 3, line_total_amount: 4500 },
];

function makeItem(
  op: EditPlanItem['op'],
  payload: unknown,
  id = 1,
): EditPlanItem {
  return { id, op, payload, created_at: new Date().toISOString() };
}

// ─── add_item ─────────────────────────────────────────────────────────────────

describe('add_item', () => {
  it('contributes +qty * unit_price to delta', () => {
    const items = [makeItem('add_item', { variant_id: 'v1', qty: 3, unit_price: 200 })];
    const { price_delta } = computePlanAnalysis(ORDER, items, ORDER_ITEMS);
    expect(price_delta).toBe(600); // 3 * 200
  });

  it('multiple add_item ops are summed', () => {
    const items = [
      makeItem('add_item', { variant_id: 'v1', qty: 1, unit_price: 100 }, 1),
      makeItem('add_item', { variant_id: 'v2', qty: 2, unit_price: 250 }, 2),
    ];
    const { price_delta } = computePlanAnalysis(ORDER, items, ORDER_ITEMS);
    expect(price_delta).toBe(600); // 100 + 500
  });
});

// ─── remove_item ─────────────────────────────────────────────────────────────

describe('remove_item', () => {
  it('subtracts the full line_total_amount of the referenced row', () => {
    const items = [makeItem('remove_item', { line_item_id: '101' })];
    const { price_delta } = computePlanAnalysis(ORDER, items, ORDER_ITEMS);
    expect(price_delta).toBe(-1000); // -line_total_amount of item 101
  });

  it('unknown line_item_id contributes 0 (safe degradation)', () => {
    const items = [makeItem('remove_item', { line_item_id: '999' })];
    const { price_delta } = computePlanAnalysis(ORDER, items, ORDER_ITEMS);
    expect(price_delta).toBe(0);
  });
});

// ─── qty_change ───────────────────────────────────────────────────────────────

describe('qty_change', () => {
  it('contributes (new_qty - current_qty) * unit_price_amount', () => {
    // item 101: qty=2, unit_price=500. Change to qty=5 → delta +3*500 = +1500
    const items = [makeItem('qty_change', { line_item_id: '101', new_qty: 5 })];
    const { price_delta } = computePlanAnalysis(ORDER, items, ORDER_ITEMS);
    expect(price_delta).toBe(1500);
  });

  it('reducing qty produces a negative delta', () => {
    // item 103: qty=3, unit_price=1500. Change to qty=1 → delta -2*1500 = -3000
    const items = [makeItem('qty_change', { line_item_id: '103', new_qty: 1 })];
    const { price_delta } = computePlanAnalysis(ORDER, items, ORDER_ITEMS);
    expect(price_delta).toBe(-3000);
  });

  it('qty_change to 0 == remove_item (subtracts full line_total)', () => {
    // item 102: line_total=300. Setting qty to 0 should subtract 300.
    const items = [makeItem('qty_change', { line_item_id: '102', new_qty: 0 })];
    const { price_delta } = computePlanAnalysis(ORDER, items, ORDER_ITEMS);
    expect(price_delta).toBe(-300);
  });

  it('unknown line_item_id contributes 0', () => {
    const items = [makeItem('qty_change', { line_item_id: '999', new_qty: 5 })];
    const { price_delta } = computePlanAnalysis(ORDER, items, ORDER_ITEMS);
    expect(price_delta).toBe(0);
  });
});

// ─── Zero-impact ops ──────────────────────────────────────────────────────────

describe('zero-impact ops', () => {
  it('note contributes 0 delta', () => {
    const items = [makeItem('note', { text: 'Customer requested gift wrap' })];
    const { price_delta } = computePlanAnalysis(ORDER, items, ORDER_ITEMS);
    expect(price_delta).toBe(0);
  });

  it('address_shipping contributes 0 delta', () => {
    const items = [
      makeItem('address_shipping', {
        street: '123 Main St',
        city: 'Manila',
        country: 'PH',
      }),
    ];
    const { price_delta } = computePlanAnalysis(ORDER, items, ORDER_ITEMS);
    expect(price_delta).toBe(0);
  });

  it('address_billing contributes 0 delta', () => {
    const items = [
      makeItem('address_billing', {
        street: '456 Billing Ave',
        city: 'Quezon City',
        country: 'PH',
      }),
    ];
    const { price_delta } = computePlanAnalysis(ORDER, items, ORDER_ITEMS);
    expect(price_delta).toBe(0);
  });

  it('mix of note + address_shipping = 0 delta', () => {
    const items = [
      makeItem('note', { text: 'Urgent delivery' }, 1),
      makeItem('address_shipping', { street: '1 Test St', city: 'BGC', country: 'PH' }, 2),
    ];
    const { price_delta } = computePlanAnalysis(ORDER, items, ORDER_ITEMS);
    expect(price_delta).toBe(0);
  });
});

// ─── payment_implication ──────────────────────────────────────────────────────

describe('payment_implication', () => {
  it('delta > 0 → additional_charge', () => {
    const items = [makeItem('add_item', { variant_id: 'v1', qty: 1, unit_price: 100 })];
    const { payment_implication } = computePlanAnalysis(ORDER, items, ORDER_ITEMS);
    expect(payment_implication).toBe('additional_charge');
  });

  it('delta < 0 → refund_due', () => {
    const items = [makeItem('remove_item', { line_item_id: '101' })];
    const { payment_implication } = computePlanAnalysis(ORDER, items, ORDER_ITEMS);
    expect(payment_implication).toBe('refund_due');
  });

  it('delta === 0 → no_change', () => {
    const items = [makeItem('note', { text: 'Just a note' })];
    const { payment_implication } = computePlanAnalysis(ORDER, items, ORDER_ITEMS);
    expect(payment_implication).toBe('no_change');
  });
});

// ─── proposed_path ────────────────────────────────────────────────────────────

describe('proposed_path (Phase A)', () => {
  it('always returns order_edit regardless of delta or lane', () => {
    const conversionOrder: CurrentOrder = {
      total_amount: 5000,
      intake_lane: 'conversion',
      shopify_financial_status: 'paid',
    };
    // Large refund scenario
    const items = [makeItem('remove_item', { line_item_id: '103' })];
    const { proposed_path } = computePlanAnalysis(conversionOrder, items, ORDER_ITEMS);
    expect(proposed_path).toBe('order_edit');
  });

  it('returns order_edit for no_change plans too', () => {
    const items = [makeItem('note', { text: 'No financial impact' })];
    const { proposed_path } = computePlanAnalysis(ORDER, items, ORDER_ITEMS);
    expect(proposed_path).toBe('order_edit');
  });
});

// ─── Empty items list ─────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('empty items → delta=0, no_change, order_edit', () => {
    const result = computePlanAnalysis(ORDER, [], ORDER_ITEMS);
    expect(result).toEqual({
      price_delta: 0,
      payment_implication: 'no_change',
      proposed_path: 'order_edit',
    });
  });

  it('mixed ops combine correctly', () => {
    // add 2x200=400, remove item 101 (-1000), note (0) → net -600
    const items = [
      makeItem('add_item', { variant_id: 'v1', qty: 2, unit_price: 200 }, 1),
      makeItem('remove_item', { line_item_id: '101' }, 2),
      makeItem('note', { text: 'Combined ops test' }, 3),
    ];
    const { price_delta, payment_implication } = computePlanAnalysis(ORDER, items, ORDER_ITEMS);
    expect(price_delta).toBe(-600);
    expect(payment_implication).toBe('refund_due');
  });
});
