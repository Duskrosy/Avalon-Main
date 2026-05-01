// @ts-nocheck
// e2e/cs-edit-plan-cockpit.spec.ts
//
// Live-server integration spec for the CS edit-plan cockpit composer (Phase A).
// Phase A is pure DB writes — no Shopify mutations are attempted.
//
// Requires:
//   - TEST_BASE_URL set to a running Next.js dev server (npm run dev)
//   - A seeded order UUID available as EDIT_PLAN_ORDER_ID (or use the default
//     placeholder — tests that hit the DB will 404/401 without a real seed)
//   - Migrations 00101 + 00102 applied (cs_edit_plans, cs_edit_plan_items tables)
//   - A valid CS-rep session cookie in CS_REP_COOKIE env var
//
// Run: TEST_BASE_URL=http://localhost:3000 CS_REP_COOKIE=<cookie> EDIT_PLAN_ORDER_ID=<uuid> npx vitest run e2e/cs-edit-plan-cockpit.spec.ts

/** @vitest-environment node */

import { describe, it, expect, beforeAll } from "vitest";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const hasServer = Boolean(process.env.TEST_BASE_URL);

// A confirmed order that exists in the test DB with no existing draft plan.
// Provide via env or the test suite will use a placeholder UUID that will 404.
const ORDER_ID =
  process.env.EDIT_PLAN_ORDER_ID ?? "00000000-0000-0000-0000-000000000001";

// A valid CS-rep session cookie (Supabase auth cookie).
// Without a real cookie the routes return 401 — tests that need auth are guarded.
const CS_REP_COOKIE = process.env.CS_REP_COOKIE ?? "";
const hasAuth = Boolean(process.env.CS_REP_COOKIE);
const canRun = hasServer && hasAuth;

// ── Request helpers ──────────────────────────────────────────────────────────

async function composePlan(orderId: string, items: unknown[], cookie: string) {
  return fetch(`${BASE}/api/customer-service/orders/${orderId}/edit-plan`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie,
    },
    body: JSON.stringify({ items }),
  });
}

async function getFullDrawer(orderId: string, cookie: string) {
  return fetch(`${BASE}/api/customer-service/orders/${orderId}/full`, {
    headers: { cookie },
  });
}

// ─────────────────────────────────────────────────────────────────────────────

describe("CS edit-plan cockpit — stage and persist plan items", () => {
  it.skipIf(!canRun)(
    "POST with a 'note' op → 200, response includes plan.id, plan.status='draft', items.length === 1",
    async () => {
      const res = await composePlan(
        ORDER_ID,
        [{ op: "note", payload: { text: "Customer wants color change" } }],
        CS_REP_COOKIE,
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty("plan");
      expect(typeof body.plan.id).toBe("number"); // cs_edit_plans.id is bigint → number
      expect(body.plan.status).toBe("draft");
      expect(Array.isArray(body.plan.items)).toBe(true);
      expect(body.plan.items.length).toBe(1);
      expect(body.plan.items[0].op).toBe("note");
    },
    10_000,
  );
});

describe("CS edit-plan cockpit — replace items on second compose", () => {
  it.skipIf(!canRun)(
    "POST twice → same plan.id, items replaced in-place, items.length === 1 with new op",
    async () => {
      // First compose: note
      const first = await composePlan(
        ORDER_ID,
        [{ op: "note", payload: { text: "Initial note" } }],
        CS_REP_COOKIE,
      );
      expect(first.status).toBe(200);
      const firstBody = await first.json();
      const planId: number = firstBody.plan.id;
      expect(typeof planId).toBe("number");

      // Second compose: replace with add_item
      const variantId = "00000000-0000-0000-0000-000000000099"; // placeholder variant uuid
      const second = await composePlan(
        ORDER_ID,
        [{ op: "add_item", payload: { variant_id: variantId, qty: 1, unit_price: 500 } }],
        CS_REP_COOKIE,
      );
      expect(second.status).toBe(200);
      const secondBody = await second.json();

      // Same plan id — in-place replace, not a new plan
      expect(secondBody.plan.id).toBe(planId);
      expect(secondBody.plan.items.length).toBe(1);
      expect(secondBody.plan.items[0].op).toBe("add_item");
    },
    15_000,
  );
});

describe("CS edit-plan cockpit — computed price_delta", () => {
  it.skipIf(!canRun)(
    "add_item with qty 2, unit_price 500 → price_delta === 1000, payment_implication === 'additional_charge'",
    async () => {
      const variantId = "00000000-0000-0000-0000-000000000099";
      const res = await composePlan(
        ORDER_ID,
        [{ op: "add_item", payload: { variant_id: variantId, qty: 2, unit_price: 500 } }],
        CS_REP_COOKIE,
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.plan.price_delta).toBe(1000);
      expect(body.plan.payment_implication).toBe("additional_charge");
    },
    10_000,
  );
});

describe("CS edit-plan cockpit — concurrent draft creation returns 409", () => {
  // The partial unique index on cs_edit_plans (order_id WHERE status='draft')
  // (migration 00102) prevents two reps from creating concurrent draft plans.
  // Reliably triggering the race requires two requests in-flight simultaneously
  // against the live server, which depends on timing. The test below attempts
  // the race; if it cannot be reproduced deterministically, mark it todo.
  it.todo(
    "two simultaneous POST requests for the same order → one returns 200, the other returns 409 " +
      "with { error: 'Another rep is already composing a draft for this order' }. " +
      "Requires database-level contention: seed a fresh order with no existing plan, " +
      "then fire two parallel POSTs before either transaction commits. " +
      "The partial unique index on cs_edit_plans(order_id) WHERE status='draft' is the enforcement mechanism.",
  );
});

describe("CS edit-plan cockpit — plan persists across drawer close+reopen", () => {
  it.skipIf(!canRun)(
    "POST to compose then GET /full → plan.items matches composed items, plan.status='draft', no Shopify mutations attempted",
    async () => {
      // Compose a plan
      const noteText = `E2E persistence check ${Date.now()}`;
      const composeRes = await composePlan(
        ORDER_ID,
        [{ op: "note", payload: { text: noteText } }],
        CS_REP_COOKIE,
      );
      expect(composeRes.status).toBe(200);
      const composeBody = await composeRes.json();
      const composedPlanId: number = composeBody.plan.id;

      // Re-open drawer (GET /full)
      const drawerRes = await getFullDrawer(ORDER_ID, CS_REP_COOKIE);
      expect(drawerRes.status).toBe(200);
      const drawerBody = await drawerRes.json();

      // Plan must be present in the drawer response
      expect(drawerBody.plan).not.toBeNull();
      expect(drawerBody.plan.id).toBe(composedPlanId);
      expect(drawerBody.plan.status).toBe("draft");
      expect(Array.isArray(drawerBody.plan.items)).toBe(true);
      expect(drawerBody.plan.items.length).toBe(1);

      const item = drawerBody.plan.items[0];
      expect(item.op).toBe("note");
      // payload.text should match what was composed
      expect(item.payload?.text).toBe(noteText);

      // Phase A: no apply endpoint was called — applied_at must remain null
      // (only visible on the full plan returned by the compose endpoint).
      expect(composeBody.plan.applied_at).toBeNull();
    },
    15_000,
  );
});
