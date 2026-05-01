// @ts-nocheck — vitest is not yet installed in this project (see
// src/app/api/customer-service/orders/[id]/triage/__tests__/claim-and-route.test.ts
// for the same pattern). Tests document expected behavior and are runnable
// the moment `npm install --save-dev vitest` happens.
//
// Coverage targets (from spec §File 1 — Tests):
//   1. Returns full payload for a sales-lane order with sales-style payment block.
//   2. Returns full payload for a conversion-lane order with conversion-style payment.
//   3. Returns null `plan` when no draft plan exists.
//   4. Stuck plan (applying_started_at < now() - 60s) is auto-reverted to 'draft'.
//   5. Returns 404 for a non-existent order ID.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "../route";
import { NextRequest } from "next/server";

// ── Shared mock state reset between tests ──────────────────────────────────
let mockGetUser: ReturnType<typeof vi.fn>;
let mockFrom: ReturnType<typeof vi.fn>;

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn() },
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: mockFrom,
  })),
}));

vi.mock("@/lib/permissions", () => ({
  getCurrentUser: vi.fn(async () => mockGetUser()),
}));

// Helper: build a minimal NextRequest for the route.
function makeRequest(id: string) {
  return new NextRequest(`http://localhost/api/customer-service/orders/${id}/full`);
}

// Route context shape (Next.js App Router).
function makeCtx(id: string) {
  return { params: Promise.resolve({ id }) };
}

// ── Fixture data ────────────────────────────────────────────────────────────
const VALID_UUID = "00000000-0000-0000-0000-000000000001";
const VALID_USER = { id: "user-uuid-1", role: { tier: 3 } };

const CUSTOMER = {
  id: "cust-uuid-1",
  first_name: "Ana",
  last_name: "Reyes",
  full_name: "Ana Reyes",
  phone: "+639171234567",
  email: "ana@example.com",
  address_line_1: "123 Main St",
  address_line_2: null,
  city_text: "Makati",
  region_text: "Metro Manila",
  postal_code: "1200",
  full_address: "123 Main St, Makati, Metro Manila 1200",
};

const ORDER_ITEMS = [
  {
    id: "item-uuid-1",
    product_variant_id: "var-uuid-1",
    product_name: "Dress",
    variant_name: "S",
    quantity: 2,
    unit_price: 500,
    line_total_amount: 1000,
  },
];

const DRAFT_PLAN = {
  id: 1,
  order_id: VALID_UUID,
  status: "draft",
  chosen_path: null,
  applying_started_at: null,
  error_message: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  items: [],
};

// ── Build mock Supabase chain for "no stuck plan" path ────────────────────
function buildChain(result: { data: unknown; error: null | { message: string } }) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
    maybeSingle: vi.fn().mockResolvedValue(result),
    // For stuck-plan UPDATE (returns no meaningful data)
    resolves: undefined as unknown,
  };
  return chain;
}

// ── Describe blocks ─────────────────────────────────────────────────────────

describe("GET /api/customer-service/orders/[id]/full — sales lane", () => {
  beforeEach(() => {
    mockGetUser = vi.fn().mockResolvedValue(VALID_USER);

    // Sequence of .from() calls:
    //  call 1: stuck-plan check → maybeSingle returns null (no stuck plan)
    //  call 2: main order fetch → single returns full order
    let callCount = 0;
    mockFrom = vi.fn(() => {
      callCount++;
      if (callCount === 1) {
        // Stuck plan check: no applying plan found
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          lt: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      // Main query
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: VALID_UUID,
            intake_lane: "sales",
            status: "confirmed",
            final_total_amount: 1000,
            mode_of_payment: "GCash",
            payment_receipt_path: "receipts/abc.jpg",
            payment_reference_number: "REF-001",
            payment_transaction_at: "2024-01-01T10:00:00Z",
            notes: "Please wrap nicely.",
            shopify_financial_status: null,
            shopify_gateway: null,
            shopify_card_last4: null,
            shopify_transaction_id: null,
            shopify_transaction_at: null,
            customer: CUSTOMER,
            items: ORDER_ITEMS,
            plan: [],
          },
          error: null,
        }),
      };
    });
  });

  it("returns full payload with sales-style payment block", async () => {
    const res = await GET(makeRequest(VALID_UUID), makeCtx(VALID_UUID));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.order.id).toBe(VALID_UUID);
    expect(body.order.intake_lane).toBe("sales");
    expect(body.customer.full_name).toBe("Ana Reyes");

    // Sales lane payment block
    expect(body.payment).toHaveProperty("payment_receipt_path");
    expect(body.payment).toHaveProperty("payment_reference_number");
    expect(body.payment).toHaveProperty("payment_transaction_at");
    expect(body.payment).toHaveProperty("notes");
    // Must NOT include conversion fields
    expect(body.payment).not.toHaveProperty("shopify_card_last4");
    expect(body.payment).not.toHaveProperty("shopify_gateway");

    expect(body.items).toHaveLength(1);
    expect(body.plan).toBeNull();
  });
});

describe("GET /api/customer-service/orders/[id]/full — conversion lane", () => {
  beforeEach(() => {
    mockGetUser = vi.fn().mockResolvedValue(VALID_USER);

    let callCount = 0;
    mockFrom = vi.fn(() => {
      callCount++;
      if (callCount === 1) {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          lt: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: VALID_UUID,
            intake_lane: "conversion",
            status: "confirmed",
            final_total_amount: 2500,
            mode_of_payment: null,
            payment_receipt_path: null,
            payment_reference_number: null,
            payment_transaction_at: null,
            notes: null,
            shopify_financial_status: "paid",
            shopify_gateway: "shopify_payments",
            shopify_card_last4: "4242",
            shopify_transaction_id: "txn_abc123",
            shopify_transaction_at: "2024-01-02T12:00:00Z",
            customer: CUSTOMER,
            items: ORDER_ITEMS,
            plan: [DRAFT_PLAN],
          },
          error: null,
        }),
      };
    });
  });

  it("returns full payload with conversion-style payment block and draft plan", async () => {
    const res = await GET(makeRequest(VALID_UUID), makeCtx(VALID_UUID));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.order.intake_lane).toBe("conversion");

    // Conversion lane payment block
    expect(body.payment).toHaveProperty("shopify_card_last4", "4242");
    expect(body.payment).toHaveProperty("shopify_gateway", "shopify_payments");
    expect(body.payment).toHaveProperty("shopify_transaction_id", "txn_abc123");
    expect(body.payment).toHaveProperty("shopify_transaction_at");
    // Must NOT include sales fields
    expect(body.payment).not.toHaveProperty("payment_receipt_path");
    expect(body.payment).not.toHaveProperty("payment_reference_number");

    // Draft plan is returned
    expect(body.plan).not.toBeNull();
    expect(body.plan.status).toBe("draft");
  });
});

describe("GET /api/customer-service/orders/[id]/full — null plan", () => {
  beforeEach(() => {
    mockGetUser = vi.fn().mockResolvedValue(VALID_USER);

    let callCount = 0;
    mockFrom = vi.fn(() => {
      callCount++;
      if (callCount === 1) {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          lt: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: VALID_UUID,
            intake_lane: "sales",
            status: "confirmed",
            final_total_amount: 800,
            mode_of_payment: "Cash",
            payment_receipt_path: null,
            payment_reference_number: null,
            payment_transaction_at: null,
            notes: null,
            shopify_financial_status: null,
            shopify_gateway: null,
            shopify_card_last4: null,
            shopify_transaction_id: null,
            shopify_transaction_at: null,
            customer: CUSTOMER,
            items: [],
            plan: [], // empty — no plans at all
          },
          error: null,
        }),
      };
    });
  });

  it("returns null plan when no draft plan exists", async () => {
    const res = await GET(makeRequest(VALID_UUID), makeCtx(VALID_UUID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.plan).toBeNull();
  });
});

describe("GET /api/customer-service/orders/[id]/full — stuck plan auto-revert", () => {
  beforeEach(() => {
    mockGetUser = vi.fn().mockResolvedValue(VALID_USER);

    const stuckPlan = {
      id: 42,
      order_id: VALID_UUID,
      status: "applying",
      applying_started_at: new Date(Date.now() - 120_000).toISOString(), // 2 min ago
    };

    let callCount = 0;
    mockFrom = vi.fn(() => {
      callCount++;
      if (callCount === 1) {
        // Stuck plan check: returns a stuck plan
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          lt: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: stuckPlan, error: null }),
        };
      }
      if (callCount === 2) {
        // Stuck plan UPDATE to 'draft'
        return {
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      // Main order fetch
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: VALID_UUID,
            intake_lane: "sales",
            status: "confirmed",
            final_total_amount: 500,
            mode_of_payment: "GCash",
            payment_receipt_path: null,
            payment_reference_number: null,
            payment_transaction_at: null,
            notes: null,
            shopify_financial_status: null,
            shopify_gateway: null,
            shopify_card_last4: null,
            shopify_transaction_id: null,
            shopify_transaction_at: null,
            customer: CUSTOMER,
            items: [],
            // After revert the plan comes back as draft in the main query
            plan: [{ ...stuckPlan, status: "draft" }],
          },
          error: null,
        }),
      };
    });
  });

  it("auto-reverts stuck applying plan (>60s) to draft before returning payload", async () => {
    const res = await GET(makeRequest(VALID_UUID), makeCtx(VALID_UUID));
    expect(res.status).toBe(200);
    const body = await res.json();

    // The route should have attempted the revert (mockFrom called 3 times:
    // stuck-check, revert-update, main-fetch)
    expect(mockFrom).toHaveBeenCalledTimes(3);
    // Plan is now surfaced as draft
    expect(body.plan).not.toBeNull();
    expect(body.plan.status).toBe("draft");
  });
});

describe("GET /api/customer-service/orders/[id]/full — 404", () => {
  beforeEach(() => {
    mockGetUser = vi.fn().mockResolvedValue(VALID_USER);

    let callCount = 0;
    mockFrom = vi.fn(() => {
      callCount++;
      if (callCount === 1) {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          lt: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" },
        }),
      };
    });
  });

  it("returns 404 for a non-existent order ID", async () => {
    const nonExistentId = "ffffffff-ffff-ffff-ffff-ffffffffffff";
    const res = await GET(makeRequest(nonExistentId), makeCtx(nonExistentId));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not found/i);
  });
});

describe("GET /api/customer-service/orders/[id]/full — auth", () => {
  it("returns 401 when user is not authenticated", async () => {
    mockGetUser = vi.fn().mockResolvedValue(null);
    mockFrom = vi.fn(); // should never be called

    const res = await GET(makeRequest(VALID_UUID), makeCtx(VALID_UUID));
    expect(res.status).toBe(401);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("returns 400 for a non-UUID order id", async () => {
    mockGetUser = vi.fn().mockResolvedValue(VALID_USER);
    mockFrom = vi.fn();

    const res = await GET(makeRequest("not-a-uuid"), makeCtx("not-a-uuid"));
    expect(res.status).toBe(400);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
