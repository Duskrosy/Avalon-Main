// @ts-nocheck — vitest is not yet installed in this project.
//
// To run this test:
//   1. npm install --save-dev vitest @vitest/ui
//   2. Add scripts to package.json:
//        "test": "vitest run",
//        "test:watch": "vitest"
//   3. Create vitest.config.ts (see TESTING.md)
//   4. Remove the @ts-nocheck above and run `npm test`.
//
// Regression test for Task 23: GET /api/sales/vouchers must surface errors
// instead of returning a silent empty array. This file mocks the Shopify
// client so the handler runs in isolation with no network or DB calls.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/permissions", () => ({
  getCurrentUser: vi
    .fn()
    .mockResolvedValue({ id: "u1", first_name: "T", last_name: "T" }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/lib/shopify/client", () => ({
  listShopifyVouchers: vi.fn(),
}));

import { listShopifyVouchers } from "@/lib/shopify/client";
import { GET } from "../route";

function makeReq(url = "http://localhost/api/sales/vouchers") {
  // The handler reads `req.nextUrl.searchParams`. A plain Request doesn't
  // expose `nextUrl`, so we construct a minimal stand-in compatible with
  // the handler's usage.
  const u = new URL(url);
  return {
    nextUrl: {
      searchParams: u.searchParams,
    },
  };
}

describe("GET /api/sales/vouchers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("surfaces error when Shopify call throws", async () => {
    (listShopifyVouchers as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Shopify GraphQL 403: missing read_discounts scope"),
    );

    const res = await GET(makeReq() as any);
    const json = await res.json();

    expect(json.vouchers).toEqual([]);
    expect(typeof json.error).toBe("string");
    expect(json.error).toMatch(/Shopify|scope/);
  });

  it("returns vouchers when Shopify call succeeds", async () => {
    (listShopifyVouchers as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 1,
        code: "SAVE10",
        price_rule_id: 100,
        usage_count: 0,
        created_at: "",
        updated_at: "",
      },
    ]);

    const res = await GET(makeReq() as any);
    const json = await res.json();

    expect(json.vouchers).toHaveLength(1);
    expect(json.vouchers[0].code).toBe("SAVE10");
    expect(json.error).toBeNull();
  });
});
