// src/app/api/webhooks/shopify/__tests__/v-orders-create.test.ts
//
// Unit tests for POST /api/webhooks/shopify/orders-create.
// Mocks verifyShopifyWebhook and processIncomingShopifyOrder so this only
// tests the route handler's branching logic.
//
// Run: npx vitest run src/app/api/webhooks/shopify/__tests__/v-orders-create.test.ts

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "crypto";
import { NextRequest } from "next/server";

// Mock the modules before importing the route handler
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn((_table: string) => ({
      insert: vi.fn(async () => ({ data: null, error: null })),
    })),
  })),
}));

vi.mock("@/lib/cs/intake/process-shopify-order", () => ({
  processIncomingShopifyOrder: vi.fn(async () => ({
    status: "inserted",
    orderId: "42",
    lane: "conversion",
  })),
}));

// Import after mocks
import { POST } from "../orders-create/route";
import { processIncomingShopifyOrder } from "@/lib/cs/intake/process-shopify-order";

const WEBHOOK_SECRET = "test_webhook_secret_xyz";
const SAMPLE_ORDER = JSON.stringify({ id: 111222333, source_name: "web", app_id: 580111, total_price: "1500.00", customer: { id: 1, first_name: "Maria", last_name: "Santos" } });

function makeHmac(body: string, secret = WEBHOOK_SECRET): string {
  return createHmac("sha256", secret).update(body).digest("base64");
}

function makeRequest(body: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/webhooks/shopify/orders-create", {
    method: "POST",
    body,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });
}

describe("POST /api/webhooks/shopify/orders-create", () => {
  beforeEach(() => {
    process.env.SHOPIFY_WEBHOOK_SECRET = WEBHOOK_SECRET;
    vi.clearAllMocks();
  });

  it("returns 200 with result on valid HMAC signature", async () => {
    const hmac = makeHmac(SAMPLE_ORDER);
    const req = makeRequest(SAMPLE_ORDER, {
      "X-Shopify-Hmac-Sha256": hmac,
      "X-Shopify-Webhook-Id": "webhook-id-001",
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("inserted");
    expect(processIncomingShopifyOrder).toHaveBeenCalledOnce();
  });

  it("returns 401 when HMAC header is missing", async () => {
    const req = makeRequest(SAMPLE_ORDER, {
      "X-Shopify-Webhook-Id": "webhook-id-002",
      // No X-Shopify-Hmac-Sha256
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(processIncomingShopifyOrder).not.toHaveBeenCalled();
  });

  it("returns 401 when HMAC is wrong (tampered body)", async () => {
    const hmac = makeHmac("different body");
    const req = makeRequest(SAMPLE_ORDER, {
      "X-Shopify-Hmac-Sha256": hmac,
      "X-Shopify-Webhook-Id": "webhook-id-003",
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(processIncomingShopifyOrder).not.toHaveBeenCalled();
  });

  it("returns 401 when HMAC was signed with wrong secret", async () => {
    const hmac = makeHmac(SAMPLE_ORDER, "wrong_secret");
    const req = makeRequest(SAMPLE_ORDER, {
      "X-Shopify-Hmac-Sha256": hmac,
      "X-Shopify-Webhook-Id": "webhook-id-004",
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(processIncomingShopifyOrder).not.toHaveBeenCalled();
  });

  it("returns 200 with { duplicate: true } on replay (dedup hit)", async () => {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    // Override admin mock to return a duplicate constraint error on insert
    vi.mocked(createAdminClient).mockReturnValueOnce({
      from: vi.fn((_table: string) => ({
        insert: vi.fn(async () => ({
          data: null,
          error: { code: "23505", message: "duplicate key value violates unique constraint" },
        })),
      })),
    } as never);

    const hmac = makeHmac(SAMPLE_ORDER);
    const req = makeRequest(SAMPLE_ORDER, {
      "X-Shopify-Hmac-Sha256": hmac,
      "X-Shopify-Webhook-Id": "webhook-id-replay",
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.duplicate).toBe(true);
    // processIncomingShopifyOrder must NOT be called on replay
    expect(processIncomingShopifyOrder).not.toHaveBeenCalled();
  });

  it("returns 500 when processIncomingShopifyOrder returns an error", async () => {
    vi.mocked(processIncomingShopifyOrder).mockResolvedValueOnce({
      status: "error",
      error: "customer lookup failed",
    });

    const hmac = makeHmac(SAMPLE_ORDER);
    const req = makeRequest(SAMPLE_ORDER, {
      "X-Shopify-Hmac-Sha256": hmac,
      "X-Shopify-Webhook-Id": "webhook-id-005",
    });

    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/Internal error/);
  });
});
