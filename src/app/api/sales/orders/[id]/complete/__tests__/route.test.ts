// @ts-nocheck
// Regression test: F2 dropped the Shopify "paid" transaction on Mark Complete.
// Asserts neither createShopifyOrderTransaction NOR cancelShopifyOrder fires
// when is_abandoned_cart=false.
//
// Run: npx vitest run "src/app/api/sales/orders/[id]/complete/__tests__/route.test.ts"
//
// vitest is not yet a project devDependency — `npx vitest` auto-installs.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/permissions", () => ({
  getCurrentUser: vi.fn().mockResolvedValue({ id: "u1" }),
  isManagerOrAbove: vi.fn().mockReturnValue(true),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/api/validate", () => ({
  validateBody: vi.fn(async (_schema: any, data: any) => ({ data, error: null })),
}));

const order = {
  id: "o1",
  status: "confirmed",
  sync_status: "synced",
  created_by_user_id: "u1",
  shopify_order_id: "shop_1",
  final_total_amount: 100,
};

const { adminMock } = vi.hoisted(() => {
  const orderRow = {
    id: "o1",
    status: "confirmed",
    sync_status: "synced",
    created_by_user_id: "u1",
    shopify_order_id: "shop_1",
    final_total_amount: 100,
  };
  const m: any = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: orderRow, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: orderRow, error: null }),
    update: vi.fn().mockReturnThis(),
  };
  return { adminMock: m };
});
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => adminMock),
}));

const { createTransactionMock, cancelOrderMock } = vi.hoisted(() => ({
  createTransactionMock: vi.fn(),
  cancelOrderMock: vi.fn(),
}));
vi.mock("@/lib/shopify/client", () => ({
  createShopifyOrderTransaction: createTransactionMock,
  listShopifyOrderTransactions: vi.fn().mockResolvedValue([]),
  cancelShopifyOrder: cancelOrderMock,
}));

import { POST } from "../route";

const makeReq = (body: any) =>
  ({
    json: async () => body,
  } as any);

describe("POST /api/sales/orders/[id]/complete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adminMock.single = vi.fn().mockResolvedValue({ data: order, error: null });
    adminMock.maybeSingle = vi.fn().mockResolvedValue({ data: order, error: null });
  });

  it("does NOT post a Shopify sale transaction on complete (regression)", async () => {
    const ctx = { params: Promise.resolve({ id: "o1" }) };
    const req = makeReq({
      net_value_amount: 100,
      ad_creative_id: "c1",
      ad_creative_name: "Creative",
      is_abandoned_cart: false,
      alex_ai_assist_level: "none",
    });
    await POST(req, ctx as any);
    expect(createTransactionMock).not.toHaveBeenCalled();
    expect(cancelOrderMock).not.toHaveBeenCalled();
  });
});
