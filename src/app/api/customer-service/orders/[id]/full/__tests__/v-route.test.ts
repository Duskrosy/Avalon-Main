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
//   6. Returns `cs_notes: []` (empty array) when no CS notes exist for the order.
//
// Note on mockFrom dispatch: the route uses Promise.all([orders, cs_order_notes])
// so call-count-based dispatch is brittle. We dispatch on the table name instead,
// using a per-describe callCount only for the stuck-plan branch (which calls
// cs_edit_plans twice with the same table name).

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
    unit_price_amount: 500,
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

// ── Chain builders ──────────────────────────────────────────────────────────

/** Supabase chain for the stuck-plan maybeSingle check (cs_edit_plans first call). */
function buildStuckCheckChain(stuckPlan: unknown | null) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: stuckPlan, error: null }),
  };
}

/** Supabase chain for the stuck-plan UPDATE (cs_edit_plans second call). */
function buildRevertChain() {
  return {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
}

/** Supabase chain for the orders main SELECT. */
function buildOrdersChain(orderData: unknown, orderError: unknown = null) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: orderData, error: orderError }),
  };
}

/** Supabase chain for cs_order_notes SELECT. Returns empty array by default. */
function buildNotesChain(notes: unknown[] = []) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: notes, error: null }),
  };
}

// ── Describe blocks ─────────────────────────────────────────────────────────

describe("GET /api/customer-service/orders/[id]/full — sales lane", () => {
  beforeEach(() => {
    mockGetUser = vi.fn().mockResolvedValue(VALID_USER);

    // Dispatch on table name. cs_edit_plans: no stuck plan. orders: full order.
    let editPlanCallCount = 0;
    mockFrom = vi.fn((table: string) => {
      if (table === "cs_edit_plans") {
        editPlanCallCount++;
        return buildStuckCheckChain(null); // no stuck plan
      }
      if (table === "cs_order_notes") {
        return buildNotesChain([]); // no CS notes yet
      }
      // orders
      return buildOrdersChain({
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
      });
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

    // cs_notes should be an empty array when no notes exist
    expect(body.cs_notes).toEqual([]);
  });
});

describe("GET /api/customer-service/orders/[id]/full — conversion lane", () => {
  beforeEach(() => {
    mockGetUser = vi.fn().mockResolvedValue(VALID_USER);

    mockFrom = vi.fn((table: string) => {
      if (table === "cs_edit_plans") {
        return buildStuckCheckChain(null);
      }
      if (table === "cs_order_notes") {
        return buildNotesChain([]);
      }
      return buildOrdersChain({
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
      });
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

    // cs_notes default to empty array
    expect(body.cs_notes).toEqual([]);
  });
});

describe("GET /api/customer-service/orders/[id]/full — null plan", () => {
  beforeEach(() => {
    mockGetUser = vi.fn().mockResolvedValue(VALID_USER);

    mockFrom = vi.fn((table: string) => {
      if (table === "cs_edit_plans") {
        return buildStuckCheckChain(null);
      }
      if (table === "cs_order_notes") {
        return buildNotesChain([]);
      }
      return buildOrdersChain({
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
      });
    });
  });

  it("returns null plan when no draft plan exists", async () => {
    const res = await GET(makeRequest(VALID_UUID), makeCtx(VALID_UUID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.plan).toBeNull();
    expect(body.cs_notes).toEqual([]);
  });
});

describe("GET /api/customer-service/orders/[id]/full — cs_notes populated", () => {
  const CS_NOTES = [
    {
      id: 1,
      author_name_snapshot: "Sarah Chen",
      body: "Customer wants gift wrapping.",
      created_at: "2024-01-03T09:00:00Z",
    },
    {
      id: 2,
      author_name_snapshot: "Mark Santos",
      body: "Confirmed delivery address with customer.",
      created_at: "2024-01-03T10:30:00Z",
    },
  ];

  beforeEach(() => {
    mockGetUser = vi.fn().mockResolvedValue(VALID_USER);

    mockFrom = vi.fn((table: string) => {
      if (table === "cs_edit_plans") {
        return buildStuckCheckChain(null);
      }
      if (table === "cs_order_notes") {
        return buildNotesChain(CS_NOTES);
      }
      return buildOrdersChain({
        id: VALID_UUID,
        intake_lane: "sales",
        status: "confirmed",
        final_total_amount: 1500,
        mode_of_payment: "GCash",
        payment_receipt_path: null,
        payment_reference_number: "REF-002",
        payment_transaction_at: null,
        notes: null,
        shopify_financial_status: null,
        shopify_gateway: null,
        shopify_card_last4: null,
        shopify_transaction_id: null,
        shopify_transaction_at: null,
        customer: CUSTOMER,
        items: ORDER_ITEMS,
        plan: [],
      });
    });
  });

  it("returns cs_notes array with notes from the feed table", async () => {
    const res = await GET(makeRequest(VALID_UUID), makeCtx(VALID_UUID));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.cs_notes).toHaveLength(2);
    expect(body.cs_notes[0].author_name_snapshot).toBe("Sarah Chen");
    expect(body.cs_notes[0].body).toBe("Customer wants gift wrapping.");
    expect(body.cs_notes[1].author_name_snapshot).toBe("Mark Santos");
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

    // cs_edit_plans is called TWICE for the stuck-plan path (check + revert).
    // Dispatch on table name; use a counter inside the cs_edit_plans branch.
    let editPlanCallCount = 0;
    mockFrom = vi.fn((table: string) => {
      if (table === "cs_edit_plans") {
        editPlanCallCount++;
        if (editPlanCallCount === 1) {
          return buildStuckCheckChain(stuckPlan);
        }
        // Second call: the UPDATE revert
        return buildRevertChain();
      }
      if (table === "cs_order_notes") {
        return buildNotesChain([]);
      }
      // Main order fetch — plan comes back as draft after revert
      return buildOrdersChain({
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
        plan: [{ ...stuckPlan, status: "draft" }],
      });
    });
  });

  it("auto-reverts stuck applying plan (>60s) to draft before returning payload", async () => {
    const res = await GET(makeRequest(VALID_UUID), makeCtx(VALID_UUID));
    expect(res.status).toBe(200);
    const body = await res.json();

    // The route should have called mockFrom for: cs_edit_plans (check),
    // cs_edit_plans (revert), orders, cs_order_notes — 4 total
    expect(mockFrom).toHaveBeenCalledTimes(4);
    // Plan is now surfaced as draft
    expect(body.plan).not.toBeNull();
    expect(body.plan.status).toBe("draft");
    expect(body.cs_notes).toEqual([]);
  });
});

describe("GET /api/customer-service/orders/[id]/full — 404", () => {
  beforeEach(() => {
    mockGetUser = vi.fn().mockResolvedValue(VALID_USER);

    mockFrom = vi.fn((table: string) => {
      if (table === "cs_edit_plans") {
        return buildStuckCheckChain(null);
      }
      if (table === "cs_order_notes") {
        return buildNotesChain([]);
      }
      return buildOrdersChain(
        null,
        { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" },
      );
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
