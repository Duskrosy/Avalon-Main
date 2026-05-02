// @ts-nocheck — vitest is not yet a devDependency in this project.
//
// Run: npx vitest run src/lib/cs/edit-plan/__tests__/v-apply.test.ts
//
// Unit tests for applyPlan() — the Phase B-Lite address auto-write
// orchestration. Mocks the supabase admin client (fluent chain) and the
// shopify orderEdit functions at the deps boundary. No HTTP, no DB.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { applyPlan } from '../apply';
import type { ApplyDeps } from '../apply';

// ─── Fluent supabase mock builders ──────────────────────────────────────────

type ResolvedResult = { data: unknown; error: { code?: string; message: string } | null };

interface ChainStep {
  match: 'select' | 'update' | 'insert' | 'delete' | 'eq' | 'maybeSingle' | 'single';
  arg?: unknown;
  result?: ResolvedResult;
}

/**
 * Build a Supabase-style fluent chain mock that matches a sequence of
 * .from(table) calls. Each call returns an object with the chain methods
 * that resolve to the configured result on the terminal awaited method
 * (maybeSingle/single/eq for delete which awaits directly).
 *
 * Call counts are validated implicitly: tests fail with "Unexpected call" if
 * the route hits a chain not in the expected sequence.
 */
function makeAdmin(planByCallSequence: ResolvedResult[]) {
  let callIndex = 0;
  const from = vi.fn(() => {
    const result = planByCallSequence[callIndex] ?? {
      data: null,
      error: { message: `Unexpected admin.from() call #${callIndex + 1}` },
    };
    callIndex += 1;
    return makeChainable(result);
  });
  return { from } as { from: ReturnType<typeof vi.fn> };
}

function makeChainable(result: ResolvedResult) {
  // The chain methods return `this` until a terminal method awaits the
  // configured result. select/eq/update/insert all return chain; the
  // terminal awaitables are maybeSingle, single, and the bare select used
  // after .delete().eq().
  const chain: any = {
    select: vi.fn(() => chain),
    update: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    delete: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    // Terminals: tests await these.
    maybeSingle: vi.fn(async () => result),
    single: vi.fn(async () => result),
    // For bare-await chains (e.g., await admin.from('x').delete().eq('y', z)),
    // the chain itself is await-able: thenable that resolves to result.
    then: (resolve: (v: ResolvedResult) => unknown) => Promise.resolve(result).then(resolve),
  };
  return chain;
}

// ─── Shopify mocks ──────────────────────────────────────────────────────────

function makeShopify(overrides: Partial<ApplyDeps['shopify']> = {}): ApplyDeps['shopify'] {
  return {
    orderEditBegin: vi.fn(async () => ({ calculatedOrderId: 'gid://shopify/CalculatedOrder/100' })),
    orderEditUpdateShippingAddress: vi.fn(async () => undefined),
    orderEditCommit: vi.fn(async () => ({ committedOrderId: 'gid://shopify/Order/12345' })),
    ...overrides,
  };
}

// ─── Fixtures ───────────────────────────────────────────────────────────────

const PLAN_ROW = {
  id: 7,
  order_id: '00000000-0000-0000-0000-000000000001',
  status: 'draft',
  shopify_calculated_order_id: null,
  shopify_commit_id: null,
};

const ADDRESS_PAYLOAD = {
  street: '1 New St',
  city: 'BGC',
  country: 'PH',
  province: 'Metro Manila',
  zip: '1634',
  phone: '+639171234567',
  recipient_name: 'Ana Reyes',
};

const ADDRESS_ITEM = {
  id: 1,
  op: 'address_shipping',
  payload: ADDRESS_PAYLOAD,
};

const ORDER_ROW = { shopify_order_id: '5566778899' };

const FROZEN_TIME = new Date('2026-05-03T00:00:00Z');

// ─── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN_TIME);
});

// ─── Happy path ─────────────────────────────────────────────────────────────

describe('applyPlan — happy path', () => {
  it('flips draft → applying → applied with commit_id', async () => {
    const admin = makeAdmin([
      { data: PLAN_ROW, error: null },                  // 1. select plan
      { data: [ADDRESS_ITEM], error: null },            // 2. select items
      { data: ORDER_ROW, error: null },                 // 3. select orders
      { data: { id: 7 }, error: null },                 // 4. lock UPDATE → 1 row
      { data: null, error: null },                      // 5. UPDATE calc_order_id (no terminal — bare await)
      { data: { id: 7 }, error: null },                 // 6. final UPDATE applied → 1 row
    ]);
    const shopify = makeShopify();
    const deps: ApplyDeps = { admin, shopify, now: () => FROZEN_TIME };

    const result = await applyPlan(7, deps);

    expect(result).toEqual({
      status: 'applied',
      commit_id: 'gid://shopify/Order/12345',
    });
    expect(shopify.orderEditBegin).toHaveBeenCalledWith('5566778899');
    expect(shopify.orderEditUpdateShippingAddress).toHaveBeenCalledWith(
      'gid://shopify/CalculatedOrder/100',
      expect.objectContaining({
        address1: '1 New St',
        city: 'BGC',
        country: 'PH',
        firstName: 'Ana',
        lastName: 'Reyes',
      }),
    );
    expect(shopify.orderEditCommit).toHaveBeenCalledWith('gid://shopify/CalculatedOrder/100');
  });

  it('maps single-name recipient_name to firstName only (no lastName)', async () => {
    const admin = makeAdmin([
      { data: PLAN_ROW, error: null },
      { data: [{ ...ADDRESS_ITEM, payload: { ...ADDRESS_PAYLOAD, recipient_name: 'Ana' } }], error: null },
      { data: ORDER_ROW, error: null },
      { data: { id: 7 }, error: null },
      { data: null, error: null },
      { data: { id: 7 }, error: null },
    ]);
    const shopify = makeShopify();

    await applyPlan(7, { admin, shopify });

    const addressArg = (shopify.orderEditUpdateShippingAddress as any).mock.calls[0][1];
    expect(addressArg.firstName).toBe('Ana');
    expect(addressArg.lastName).toBeUndefined();
  });
});

// ─── Race / lookup paths ────────────────────────────────────────────────────

describe('applyPlan — race & lookup', () => {
  it('returns plan_not_found when the plan id is missing', async () => {
    const admin = makeAdmin([
      { data: null, error: null }, // 1. select plan → null
    ]);
    const result = await applyPlan(99, { admin, shopify: makeShopify() });
    expect(result).toEqual({ status: 'race', reason: 'plan_not_found' });
  });

  it('returns no_longer_draft when conditional UPDATE lock returns 0 rows', async () => {
    const admin = makeAdmin([
      { data: PLAN_ROW, error: null },          // 1. select plan
      { data: [ADDRESS_ITEM], error: null },    // 2. items
      { data: ORDER_ROW, error: null },         // 3. orders
      { data: null, error: null },              // 4. lock → 0 rows (race lost)
    ]);
    const result = await applyPlan(7, { admin, shopify: makeShopify() });
    expect(result).toEqual({ status: 'race', reason: 'no_longer_draft' });
  });
});

// ─── Scope guards ───────────────────────────────────────────────────────────

describe('applyPlan — scope guards', () => {
  it('fails when the plan has no address_shipping op', async () => {
    const admin = makeAdmin([
      { data: PLAN_ROW, error: null },
      { data: [], error: null }, // empty items
    ]);
    const result = await applyPlan(7, { admin, shopify: makeShopify() });
    expect(result.status).toBe('failed');
    expect((result as { error: string }).error).toMatch(/no auto-writable op/i);
  });

  it('fails when the plan has only an item op (unsupported)', async () => {
    const itemOp = { id: 1, op: 'add_item', payload: { variant_id: 'v1', qty: 1, unit_price: 100 } };
    const admin = makeAdmin([
      { data: PLAN_ROW, error: null },
      { data: [itemOp], error: null },
    ]);
    const result = await applyPlan(7, { admin, shopify: makeShopify() });
    expect(result.status).toBe('failed');
    expect((result as { error: string }).error).toMatch(/not auto-writable/i);
    expect((result as { error: string }).error).toMatch(/manual_shopify_edit/i);
  });

  it('fails when the order has no shopify_order_id', async () => {
    const admin = makeAdmin([
      { data: PLAN_ROW, error: null },
      { data: [ADDRESS_ITEM], error: null },
      { data: { shopify_order_id: null }, error: null },
    ]);
    const result = await applyPlan(7, { admin, shopify: makeShopify() });
    expect(result.status).toBe('failed');
    expect((result as { error: string }).error).toMatch(/no shopify_order_id/i);
  });
});

// ─── Shopify failure paths ──────────────────────────────────────────────────

describe('applyPlan — Shopify failures', () => {
  it('marks failed when orderEditBegin throws', async () => {
    const admin = makeAdmin([
      { data: PLAN_ROW, error: null },
      { data: [ADDRESS_ITEM], error: null },
      { data: ORDER_ROW, error: null },
      { data: { id: 7 }, error: null },         // lock OK
      { data: null, error: null },              // markFailed UPDATE
    ]);
    const shopify = makeShopify({
      orderEditBegin: vi.fn(async () => {
        throw new Error('Shopify 400: order is fulfilled');
      }),
    });
    const result = await applyPlan(7, { admin, shopify });
    expect(result.status).toBe('failed');
    expect((result as { error: string }).error).toMatch(/order is fulfilled/);
    // Verify markFailed UPDATE was called
    expect(admin.from).toHaveBeenCalledWith('cs_edit_plans');
  });

  it('marks failed when orderEditUpdateShippingAddress throws', async () => {
    const admin = makeAdmin([
      { data: PLAN_ROW, error: null },
      { data: [ADDRESS_ITEM], error: null },
      { data: ORDER_ROW, error: null },
      { data: { id: 7 }, error: null },         // lock
      { data: null, error: null },              // calc_order_id UPDATE
      { data: null, error: null },              // markFailed UPDATE
    ]);
    const shopify = makeShopify({
      orderEditUpdateShippingAddress: vi.fn(async () => {
        throw new Error('orderEditUpdateShippingAddress [shippingAddress.country]: invalid country code');
      }),
    });
    const result = await applyPlan(7, { admin, shopify });
    expect(result.status).toBe('failed');
    expect((result as { error: string }).error).toMatch(/invalid country code/);
  });

  it('does NOT mark failed when orderEditCommit throws — leaves in applying for /full re-poll', async () => {
    const admin = makeAdmin([
      { data: PLAN_ROW, error: null },
      { data: [ADDRESS_ITEM], error: null },
      { data: ORDER_ROW, error: null },
      { data: { id: 7 }, error: null },         // lock
      { data: null, error: null },              // calc_order_id UPDATE
      // NO markFailed UPDATE — the test asserts we did NOT make this call
    ]);
    const shopify = makeShopify({
      orderEditCommit: vi.fn(async () => {
        throw new Error('Network timeout');
      }),
    });
    const result = await applyPlan(7, { admin, shopify });
    expect(result.status).toBe('failed');
    expect((result as { error: string }).error).toMatch(/Network timeout/);
    // Total .from() calls: select plan, select items, select orders,
    // lock UPDATE, calc_order_id UPDATE = 5 calls. NO markFailed.
    expect(admin.from).toHaveBeenCalledTimes(5);
  });
});

// ─── Audit-trail mismatch edge case ─────────────────────────────────────────

describe('applyPlan — audit-trail mismatch', () => {
  it('returns failed when commit succeeded but plan left applying state', async () => {
    const admin = makeAdmin([
      { data: PLAN_ROW, error: null },
      { data: [ADDRESS_ITEM], error: null },
      { data: ORDER_ROW, error: null },
      { data: { id: 7 }, error: null },         // lock
      { data: null, error: null },              // calc_order_id UPDATE
      { data: null, error: null },              // final UPDATE → 0 rows (someone else moved it)
    ]);
    const shopify = makeShopify();
    const result = await applyPlan(7, { admin, shopify });
    expect(result.status).toBe('failed');
    // commit_id must appear in error so a debugging operator can find it
    expect((result as { error: string }).error).toMatch(/gid:\/\/shopify\/Order\/12345/);
    expect((result as { error: string }).error).toMatch(/no longer in 'applying'/);
  });
});
