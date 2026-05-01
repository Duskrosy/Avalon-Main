// @ts-nocheck
// src/app/api/cron/__tests__/v-cs-conversion-reconciler.test.ts
//
// Unit tests for GET /api/cron/cs-conversion-reconciler.
// Mocks fetchShopifyOrders and processIncomingShopifyOrder so this only
// tests the route handler's auth, concurrency, summary, and error-resilience logic.
//
// Run: npx vitest run src/app/api/cron/__tests__/v-cs-conversion-reconciler.test.ts

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Module mocks (must come before route import) ──────────────────────────────

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({})),
}));

vi.mock("@/lib/shopify/client", () => ({
  fetchShopifyOrders: vi.fn(async () => []),
}));

vi.mock("@/lib/cs/intake/process-shopify-order", () => ({
  processIncomingShopifyOrder: vi.fn(async () => ({
    status: "inserted",
    orderId: 1,
    lane: "conversion",
  })),
}));

// ─── Imports after mocks ───────────────────────────────────────────────────────

import { GET } from "../cs-conversion-reconciler/route";
import { fetchShopifyOrders } from "@/lib/shopify/client";
import { processIncomingShopifyOrder } from "@/lib/cs/intake/process-shopify-order";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CRON_SECRET = "test-secret";

function makeGetRequest(authHeader?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (authHeader !== undefined) {
    headers["authorization"] = authHeader;
  }
  return new NextRequest("http://localhost/api/cron/cs-conversion-reconciler", {
    method: "GET",
    headers,
  });
}

function makeOrderFixtures(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: 1000 + i,
    source_name: "web",
    app_id: 580111,
    total_price: "100.00",
    created_at: "2026-05-01T00:00:00Z",
    note_attributes: [],
    customer: { id: i + 1, first_name: "Test", last_name: "User", email: `test${i}@example.com`, phone: null },
  }));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("GET /api/cron/cs-conversion-reconciler", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = CRON_SECRET;
    vi.clearAllMocks();
    // Reset fetchShopifyOrders to return empty list by default
    vi.mocked(fetchShopifyOrders).mockResolvedValue([]);
  });

  // ── 1. CRON_SECRET auth ─────────────────────────────────────────────────────

  describe("CRON_SECRET auth", () => {
    it("returns 401 when no Authorization header is provided", async () => {
      const req = makeGetRequest();
      const res = await GET(req);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBeDefined();
      expect(processIncomingShopifyOrder).not.toHaveBeenCalled();
    });

    it("returns 401 when Authorization header has the wrong token", async () => {
      const req = makeGetRequest("Bearer wrong-secret");
      const res = await GET(req);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBeDefined();
      expect(processIncomingShopifyOrder).not.toHaveBeenCalled();
    });

    it("returns 200 when Authorization header has the correct Bearer token", async () => {
      const req = makeGetRequest(`Bearer ${CRON_SECRET}`);
      const res = await GET(req);
      expect(res.status).toBe(200);
    });
  });

  // ── 2. Concurrency cap ──────────────────────────────────────────────────────

  describe("concurrency cap", () => {
    it("processes 50 orders in concurrent batches of ≤5 (not all at once, not sequential)", async () => {
      const orders = makeOrderFixtures(50);
      vi.mocked(fetchShopifyOrders).mockResolvedValue(orders as never);

      let inFlight = 0;
      let peakInFlight = 0;

      vi.mocked(processIncomingShopifyOrder).mockImplementation(async () => {
        inFlight++;
        peakInFlight = Math.max(peakInFlight, inFlight);
        // Give each task a small async delay so concurrent in-flight calls accumulate
        await new Promise((r) => setTimeout(r, 5));
        inFlight--;
        return { status: "inserted", orderId: 1, lane: "conversion" };
      });

      const req = makeGetRequest(`Bearer ${CRON_SECRET}`);
      await GET(req);

      // All 50 orders must have been processed
      expect(processIncomingShopifyOrder).toHaveBeenCalledTimes(50);

      // Upper bound: never more than 5 in-flight at once (concurrency cap)
      expect(peakInFlight).toBeLessThanOrEqual(5);

      // Lower bound: at least 2 were running simultaneously (not purely sequential)
      expect(peakInFlight).toBeGreaterThan(1);
    });
  });

  // ── 3. Summary shape ────────────────────────────────────────────────────────

  describe("summary shape", () => {
    it("returns { total, inserted, duplicates, quarantined, errors } with correct tallies", async () => {
      // 6 orders with varied statuses:
      //   order 0 → inserted, conversion
      //   order 1 → inserted, conversion
      //   order 2 → inserted, quarantine   (increments both inserted AND quarantined)
      //   order 3 → duplicate
      //   order 4 → disagreement           (counted as duplicate per route logic)
      //   order 5 → error
      const orders = makeOrderFixtures(6);
      vi.mocked(fetchShopifyOrders).mockResolvedValue(orders as never);

      const responses = [
        { status: "inserted", orderId: 1, lane: "conversion" },
        { status: "inserted", orderId: 2, lane: "conversion" },
        { status: "inserted", orderId: 3, lane: "quarantine" },
        { status: "duplicate" },
        { status: "disagreement" },
        { status: "error", error: "something went wrong" },
      ];

      let callIndex = 0;
      vi.mocked(processIncomingShopifyOrder).mockImplementation(async () => {
        return responses[callIndex++] as never;
      });

      const req = makeGetRequest(`Bearer ${CRON_SECRET}`);
      const res = await GET(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toMatchObject({
        total: 6,
        inserted: 3,       // 3 "inserted" status calls
        duplicates: 2,     // 1 "duplicate" + 1 "disagreement"
        quarantined: 1,    // 1 of the inserted calls was quarantine lane
        errors: 1,
      });
    });
  });

  // ── 4. Per-order error handling ─────────────────────────────────────────────

  describe("per-order error handling", () => {
    it("continues processing remaining orders when one returns { status: 'error' }", async () => {
      const orders = makeOrderFixtures(5);
      vi.mocked(fetchShopifyOrders).mockResolvedValue(orders as never);

      let callIndex = 0;
      vi.mocked(processIncomingShopifyOrder).mockImplementation(async () => {
        const i = callIndex++;
        // Order at index 2 errors out; others succeed
        if (i === 2) {
          return { status: "error", error: "transient db failure" } as never;
        }
        return { status: "inserted", orderId: i, lane: "conversion" } as never;
      });

      const req = makeGetRequest(`Bearer ${CRON_SECRET}`);
      const res = await GET(req);

      // Should not crash — still returns 200
      expect(res.status).toBe(200);

      // All 5 orders must have been attempted (no early bail-out)
      expect(processIncomingShopifyOrder).toHaveBeenCalledTimes(5);

      const body = await res.json();
      expect(body.errors).toBe(1);
      expect(body.inserted).toBe(4);
      expect(body.total).toBe(5);
    });
  });
});
