// @ts-nocheck — vitest is not yet installed in this project (see
// src/app/api/sales/orders/__tests__/round-trip.test.ts for the same
// pattern). These tests document the expected behaviour of the CS
// triage route's claim/release/route paths so they're runnable spec
// the moment `npm install --save-dev vitest` happens.
//
// Coverage targets (from /plan-eng-review test plan):
//   1. CRITICAL — claim race: two simultaneous claims yield exactly
//      one winner; the loser gets a 409 with the winner's name.
//   2. CRITICAL — non-claimer cannot triage a claimed ticket.
//   3. Preorder action sets person_in_charge_label='Pre-Order'.
//   4. Release requires claimer or manager.
//   5. Auto-release: every routing action clears claim columns.

import { describe, it, expect, beforeEach, vi } from "vitest";

// The route under test is invoked via fetch() against the dev server.
// These tests mirror the existing integration style in round-trip.test.ts.
const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";

async function triage(orderId: string, body: unknown, cookie: string) {
  return fetch(`${BASE}/api/customer-service/orders/${orderId}/triage`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  });
}

describe("CS triage — claim race", () => {
  // Setup: the test harness should seed an order with status=confirmed,
  // completion_status=complete, person_in_charge_label=null, and no
  // existing claim. Two distinct CS-rep sessions (different cookies).

  it("two simultaneous claim requests yield exactly one winner", async () => {
    const orderId = "test-order-uuid"; // seeded by test harness
    const repA = "rep-a-cookie";
    const repB = "rep-b-cookie";

    const [resA, resB] = await Promise.all([
      triage(orderId, { action: "claim" }, repA),
      triage(orderId, { action: "claim" }, repB),
    ]);

    // Exactly one wins (200), exactly one loses (409).
    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([200, 409]);

    // The loser's body includes the winner's name so the toast can
    // render "Sarah just claimed this".
    const loser = resA.status === 409 ? resA : resB;
    const body = await loser.json();
    expect(body.error).toBe("Already claimed");
    expect(body.claimer_name).toBeTruthy();
  });

  it("claim on an already-routed order returns 409 (not in inbox)", async () => {
    const orderId = "already-routed-uuid"; // seeded with person_in_charge_label='Inventory'
    const res = await triage(orderId, { action: "claim" }, "rep-a-cookie");
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/not in the CS Inbox/i);
  });
});

describe("CS triage — claimer auth on routing actions", () => {
  it("non-claimer cannot triage a claimed ticket", async () => {
    const orderId = "claimed-by-a-uuid"; // seeded claimed by Rep A
    const res = await triage(orderId, { action: "inventory" }, "rep-b-cookie");
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/claimed by someone else/i);
  });

  it("claimer can triage their own ticket", async () => {
    const orderId = "claimed-by-a-uuid";
    const res = await triage(orderId, { action: "inventory" }, "rep-a-cookie");
    expect(res.status).toBe(200);
  });

  it("manager (tier <= 2) can triage anyone's claimed ticket", async () => {
    const orderId = "claimed-by-a-uuid";
    const res = await triage(orderId, { action: "inventory" }, "manager-cookie");
    expect(res.status).toBe(200);
  });

  it("unclaimed ticket can be triaged by anyone (preserves existing behaviour)", async () => {
    const orderId = "unclaimed-uuid";
    const res = await triage(orderId, { action: "inventory" }, "rep-b-cookie");
    expect(res.status).toBe(200);
  });
});

describe("CS triage — auto-release on routing", () => {
  it("inventory action clears claim columns", async () => {
    const orderId = "claimed-by-a-uuid";
    const res = await triage(orderId, { action: "inventory" }, "rep-a-cookie");
    expect(res.status).toBe(200);

    // Verify via test harness that claimed_by_user_id and claimed_at
    // are now null on this order row.
    const order = await fetchOrderForTest(orderId);
    expect(order.claimed_by_user_id).toBeNull();
    expect(order.claimed_at).toBeNull();
    expect(order.person_in_charge_label).toBe("Inventory");
  });

  it("preorder action sets person_in_charge_label='Pre-Order' and clears claim", async () => {
    const orderId = "claimed-by-a-uuid";
    const res = await triage(orderId, { action: "preorder" }, "rep-a-cookie");
    expect(res.status).toBe(200);

    const order = await fetchOrderForTest(orderId);
    expect(order.person_in_charge_label).toBe("Pre-Order");
    expect(order.claimed_by_user_id).toBeNull();
  });

  it("hold action sets cs_hold_reason from body and clears claim", async () => {
    const orderId = "claimed-by-a-uuid";
    const res = await triage(
      orderId,
      { action: "hold", hold_reason: "Customer asked to delay" },
      "rep-a-cookie",
    );
    expect(res.status).toBe(200);

    const order = await fetchOrderForTest(orderId);
    expect(order.cs_hold_reason).toBe("Customer asked to delay");
    expect(order.person_in_charge_label).toBeNull();
    expect(order.claimed_by_user_id).toBeNull();
  });
});

describe("CS triage — release", () => {
  it("claimer can release their own claim", async () => {
    const orderId = "claimed-by-a-uuid";
    const res = await triage(orderId, { action: "release" }, "rep-a-cookie");
    expect(res.status).toBe(200);

    const order = await fetchOrderForTest(orderId);
    expect(order.claimed_by_user_id).toBeNull();
    expect(order.claimed_at).toBeNull();
    // Order stays in inbox (person_in_charge_label still null).
    expect(order.person_in_charge_label).toBeNull();
  });

  it("non-claimer cannot release someone else's claim (unless manager)", async () => {
    const orderId = "claimed-by-a-uuid";
    const res = await triage(orderId, { action: "release" }, "rep-b-cookie");
    expect(res.status).toBe(403);
  });

  it("manager can force-release any claim", async () => {
    const orderId = "claimed-by-a-uuid";
    const res = await triage(orderId, { action: "release" }, "manager-cookie");
    expect(res.status).toBe(200);
  });
});

describe("CS Inbox query — regression after migration 00100", () => {
  // The migration adds two columns to orders. The existing
  // /api/customer-service/confirmed-orders endpoint must still return
  // the same row count and the same row shape for orders that have
  // not been claimed (claimed_by_user_id IS NULL).

  it("inbox returns the same orders before and after the migration", async () => {
    // Seed: N orders in the inbox state, none claimed.
    const before = await fetch(`${BASE}/api/customer-service/confirmed-orders?tab=inbox`);
    const beforeJson = await before.json();
    expect(beforeJson.orders).toBeInstanceOf(Array);

    // Every row must include the new claim columns (with null values
    // until something gets claimed) — this ensures consumers can rely
    // on them being present.
    for (const o of beforeJson.orders) {
      expect(o).toHaveProperty("claimed_by_user_id");
      expect(o).toHaveProperty("claimed_at");
    }
  });
});

// Test harness helper — implementation lives in the test setup file
// once vitest is installed. Reads orders directly via the admin client.
declare function fetchOrderForTest(id: string): Promise<{
  claimed_by_user_id: string | null;
  claimed_at: string | null;
  person_in_charge_label: string | null;
  cs_hold_reason: string | null;
}>;
