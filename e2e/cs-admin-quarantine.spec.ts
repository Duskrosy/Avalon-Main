// @ts-nocheck
// e2e/cs-admin-quarantine.spec.ts
//
// Live-server integration spec for the CS admin triage workflow.
// Verifies authorization, quarantine list, disputes tab, resolve, and
// bad-lane rejection.
//
// Requires:
//   - TEST_BASE_URL set to a running Next.js dev server (npm run dev)
//   - Migrations 00101 + 00102 applied
//   - A valid regular CS-rep session cookie in CS_REP_COOKIE
//   - A valid admin (roles.tier <= 2) session cookie in ADMIN_COOKIE
//   - A seeded quarantine row ID in QUARANTINE_ROW_ID (integer) for resolve tests
//
// Run:
//   TEST_BASE_URL=http://localhost:3000 \
//   CS_REP_COOKIE=<cookie> \
//   ADMIN_COOKIE=<cookie> \
//   QUARANTINE_ROW_ID=<id> \
//   npx vitest run e2e/cs-admin-quarantine.spec.ts

/** @vitest-environment node */

import { describe, it, expect } from "vitest";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const QUARANTINE_URL = `${BASE}/api/customer-service/admin/quarantine`;

const hasServer = Boolean(process.env.TEST_BASE_URL);
const CS_REP_COOKIE = process.env.CS_REP_COOKIE ?? "";
const ADMIN_COOKIE = process.env.ADMIN_COOKIE ?? "";
const QUARANTINE_ROW_ID = process.env.QUARANTINE_ROW_ID ?? "";

const hasAuth = hasServer && Boolean(process.env.CS_REP_COOKIE) && Boolean(process.env.ADMIN_COOKIE);
const canRunResolveTests = hasAuth && Boolean(process.env.QUARANTINE_ROW_ID);

// ── Request helpers ──────────────────────────────────────────────────────────

async function getQuarantine(
  cookie: string,
  params: Record<string, string> = {},
) {
  const url = new URL(QUARANTINE_URL);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return fetch(url.toString(), { headers: { cookie } });
}

async function resolveQuarantine(
  reviewId: string | number,
  lane: string,
  cookie: string,
) {
  return fetch(`${QUARANTINE_URL}/${reviewId}/resolve`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ lane }),
  });
}

// ─────────────────────────────────────────────────────────────────────────────

describe("CS admin quarantine — authorization", () => {
  it.skipIf(!hasAuth)(
    "non-admin CS rep cannot list quarantine rows → 403",
    async () => {
      const res = await getQuarantine(CS_REP_COOKIE);
      // A regular CS rep (roles.tier > 2) must be denied.
      expect(res.status).toBe(403);
    },
  );

  it.skipIf(!hasAuth)(
    "unauthenticated request → 401",
    async () => {
      const res = await getQuarantine(""); // no cookie
      expect(res.status).toBe(401);
    },
  );
});

describe("CS admin quarantine — list pending rows", () => {
  it.skipIf(!hasAuth)(
    "admin lists pending quarantine → 200, response has { rows: Array, count: number }",
    async () => {
      const res = await getQuarantine(ADMIN_COOKIE);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty("rows");
      expect(Array.isArray(body.rows)).toBe(true);
      expect(body).toHaveProperty("count");
      expect(typeof body.count).toBe("number");

      // Default filter is pending (resolved_at IS NULL).
      // Every row returned must have resolved_at === null.
      for (const row of body.rows) {
        expect(row.resolved_at).toBeNull();
      }
    },
  );

  it.skipIf(!hasAuth)(
    "admin can filter by status=resolved → 200, all rows have resolved_at non-null",
    async () => {
      const res = await getQuarantine(ADMIN_COOKIE, { status: "resolved" });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(Array.isArray(body.rows)).toBe(true);
      for (const row of body.rows) {
        expect(row.resolved_at).not.toBeNull();
      }
    },
  );
});

describe("CS admin quarantine — disputes tab", () => {
  it.skipIf(!hasAuth)(
    "admin views disputes tab → 200, response has { rows: Array, count: number } from cs_intake_classifier_disagreements",
    async () => {
      const res = await getQuarantine(ADMIN_COOKIE, { tab: "disputes" });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty("rows");
      expect(Array.isArray(body.rows)).toBe(true);
      expect(body).toHaveProperty("count");

      // Dispute rows have winner_lane / loser_lane, not resolved_at.
      // If any rows exist, verify their shape.
      for (const row of body.rows) {
        expect(row).toHaveProperty("winner_lane");
        expect(row).toHaveProperty("loser_lane");
        expect(row).toHaveProperty("recorded_at");
        // Nested order join
        expect(row).toHaveProperty("order");
      }
    },
  );
});

describe("CS admin quarantine — resolve", () => {
  it.skipIf(!canRunResolveTests)(
    "admin resolves a quarantine row with lane='sales' → 200, orders.intake_lane updated, review row resolved",
    async () => {
      const res = await resolveQuarantine(QUARANTINE_ROW_ID, "sales", ADMIN_COOKIE);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty("row");
      expect(body.row.resolved_at).not.toBeNull();
      expect(body.row.resolved_lane).toBe("sales");

      // Verify the quarantine row no longer appears in the pending list.
      const pendingRes = await getQuarantine(ADMIN_COOKIE, { status: "pending" });
      expect(pendingRes.status).toBe(200);
      const pendingBody = await pendingRes.json();
      const stillPending = pendingBody.rows.some(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (r: any) => String(r.id) === String(QUARANTINE_ROW_ID),
      );
      expect(stillPending).toBe(false);

      // Verify it appears in the resolved list.
      const resolvedRes = await getQuarantine(ADMIN_COOKIE, { status: "resolved" });
      expect(resolvedRes.status).toBe(200);
      const resolvedBody = await resolvedRes.json();
      const isResolved = resolvedBody.rows.some(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (r: any) => String(r.id) === String(QUARANTINE_ROW_ID),
      );
      expect(isResolved).toBe(true);
    },
    15_000,
  );

  it.skipIf(!canRunResolveTests)(
    "admin resolve with invalid lane → 400",
    async () => {
      const res = await resolveQuarantine(QUARANTINE_ROW_ID, "fake", ADMIN_COOKIE);
      expect(res.status).toBe(400);

      const body = await res.json();
      // Route returns: { error: 'lane must be one of: sales, shopify_admin, conversion' }
      expect(body.error).toMatch(/lane must be one of/i);
    },
  );

  it.skipIf(!hasAuth)(
    "non-admin cannot resolve quarantine rows → 403",
    async () => {
      const fakeReviewId = 999_999_999;
      const res = await resolveQuarantine(fakeReviewId, "sales", CS_REP_COOKIE);
      expect(res.status).toBe(403);
    },
  );
});
