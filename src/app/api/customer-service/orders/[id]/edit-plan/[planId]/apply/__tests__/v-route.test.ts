// @ts-nocheck — vitest is not yet a devDependency in this project.
//
// Run: npx vitest run src/app/api/customer-service/orders/[id]/edit-plan/[planId]/apply/__tests__/v-route.test.ts
//
// HTTP-shell coverage for the Phase B-Lite apply route. Mocks the supabase
// admin client (for the plan/order ownership pre-flight) and the apply.ts
// library so this file tests routing + auth + response shaping ONLY.
// applyPlan() orchestration is unit-tested separately in v-apply.test.ts.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Mocks (hoisted before route import) ────────────────────────────────────

let mockGetUser: ReturnType<typeof vi.fn>;
let mockFrom: ReturnType<typeof vi.fn>;
let mockApplyPlan: ReturnType<typeof vi.fn>;

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: vi.fn() } })),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
}));

vi.mock('@/lib/permissions', () => ({
  getCurrentUser: vi.fn(async () => mockGetUser()),
}));

vi.mock('@/lib/cs/edit-plan/apply', () => ({
  applyPlan: vi.fn(async (...args: unknown[]) => mockApplyPlan(...args)),
}));

// orderEdit functions are passed into applyPlan as deps but the route mock
// replaces applyPlan entirely, so we don't need to mock the shopify module.

import { POST } from '../route';

// ─── Helpers ────────────────────────────────────────────────────────────────

const VALID_ORDER_UUID = '00000000-0000-0000-0000-000000000001';
const OTHER_ORDER_UUID = '00000000-0000-0000-0000-000000000099';
const VALID_USER = { id: 'user-uuid-1', role: { tier: 3 } };

function makeRequest(orderId: string, planId: string | number): NextRequest {
  return new NextRequest(
    `http://localhost/api/customer-service/orders/${orderId}/edit-plan/${planId}/apply`,
    { method: 'POST' },
  );
}

function makeCtx(orderId: string, planId: string | number) {
  return { params: Promise.resolve({ id: orderId, planId: String(planId) }) };
}

beforeEach(() => {
  mockGetUser = vi.fn(() => VALID_USER);
  mockFrom = vi.fn();
  mockApplyPlan = vi.fn();
});

// ─── Auth ───────────────────────────────────────────────────────────────────

describe('POST /apply — auth', () => {
  it('returns 401 when getCurrentUser returns null', async () => {
    mockGetUser = vi.fn(() => null);
    const res = await POST(makeRequest(VALID_ORDER_UUID, 7), makeCtx(VALID_ORDER_UUID, 7));
    expect(res.status).toBe(401);
    expect(mockApplyPlan).not.toHaveBeenCalled();
  });
});

// ─── Param validation ───────────────────────────────────────────────────────

describe('POST /apply — param validation', () => {
  it('returns 400 when order id is not a uuid', async () => {
    const res = await POST(makeRequest('not-a-uuid', 7), makeCtx('not-a-uuid', 7));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid order id/i);
  });

  it('returns 400 when plan id is non-numeric', async () => {
    const res = await POST(
      makeRequest(VALID_ORDER_UUID, 'abc'),
      makeCtx(VALID_ORDER_UUID, 'abc'),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid plan id/i);
  });

  it('returns 400 when plan id is zero or negative', async () => {
    const res = await POST(makeRequest(VALID_ORDER_UUID, 0), makeCtx(VALID_ORDER_UUID, 0));
    expect(res.status).toBe(400);
  });
});

// ─── Plan/order ownership ──────────────────────────────────────────────────

describe('POST /apply — plan/order ownership pre-flight', () => {
  it('returns 404 when plan does not belong to the requested order', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'cs_edit_plans') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: 7, order_id: OTHER_ORDER_UUID }, // belongs to a different order
                error: null,
              }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const res = await POST(makeRequest(VALID_ORDER_UUID, 7), makeCtx(VALID_ORDER_UUID, 7));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/does not belong/i);
    expect(mockApplyPlan).not.toHaveBeenCalled();
  });

  it('returns 404 when plan does not exist at all', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'cs_edit_plans') {
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

    const res = await POST(makeRequest(VALID_ORDER_UUID, 9999), makeCtx(VALID_ORDER_UUID, 9999));
    expect(res.status).toBe(404);
    expect(mockApplyPlan).not.toHaveBeenCalled();
  });
});

// ─── Result shaping (delegated to applyPlan) ────────────────────────────────

describe('POST /apply — response shaping', () => {
  function setupOwnershipPass() {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'cs_edit_plans') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: 7, order_id: VALID_ORDER_UUID },
                error: null,
              }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    });
  }

  it('returns 200 + commit_id on applied result', async () => {
    setupOwnershipPass();
    mockApplyPlan = vi.fn(async () => ({
      status: 'applied',
      commit_id: 'gid://shopify/Order/12345',
    }));

    const res = await POST(makeRequest(VALID_ORDER_UUID, 7), makeCtx(VALID_ORDER_UUID, 7));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      status: 'applied',
      commit_id: 'gid://shopify/Order/12345',
    });
  });

  it('returns 409 on race result with no_longer_draft', async () => {
    setupOwnershipPass();
    mockApplyPlan = vi.fn(async () => ({
      status: 'race',
      reason: 'no_longer_draft',
    }));

    const res = await POST(makeRequest(VALID_ORDER_UUID, 7), makeCtx(VALID_ORDER_UUID, 7));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/no longer in draft/i);
  });

  it('returns 404 on race result with plan_not_found', async () => {
    setupOwnershipPass();
    mockApplyPlan = vi.fn(async () => ({
      status: 'race',
      reason: 'plan_not_found',
    }));

    const res = await POST(makeRequest(VALID_ORDER_UUID, 7), makeCtx(VALID_ORDER_UUID, 7));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/plan not found/i);
  });

  it('returns 400 on failed result with the library error message', async () => {
    setupOwnershipPass();
    mockApplyPlan = vi.fn(async () => ({
      status: 'failed',
      error: 'orderEditUpdateShippingAddress: invalid country code',
    }));

    const res = await POST(makeRequest(VALID_ORDER_UUID, 7), makeCtx(VALID_ORDER_UUID, 7));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid country code/);
  });

  it('passes the parsed plan id (number) to applyPlan', async () => {
    setupOwnershipPass();
    mockApplyPlan = vi.fn(async () => ({
      status: 'applied',
      commit_id: 'x',
    }));

    await POST(makeRequest(VALID_ORDER_UUID, 7), makeCtx(VALID_ORDER_UUID, 7));
    expect(mockApplyPlan).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        admin: expect.anything(),
        shopify: expect.objectContaining({
          orderEditBegin: expect.any(Function),
          orderEditUpdateShippingAddress: expect.any(Function),
          orderEditCommit: expect.any(Function),
        }),
      }),
    );
  });
});
