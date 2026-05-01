// @ts-nocheck
// src/app/api/customer-service/admin/quarantine/__tests__/v-resolve.test.ts
//
// Coverage:
//   - Non-admin → 403
//   - Unauthenticated → 401
//   - Invalid lane → 400
//   - Missing lane → 400
//   - Invalid id (non-numeric) → 400
//   - Unknown quarantine row → 404
//   - Happy path: updates orders.intake_lane + marks review resolved → 200

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mock state ───────────────────────────────────────────────────────

const { mockState } = vi.hoisted(() => {
  // Tracks per-table, per-call mock responses.
  // Shape: { [table]: { selectResult, updateResult } }
  const mockState: {
    quarantineSelectResult: { data: unknown; error: unknown };
    quarantineUpdateResult: { data: unknown; error: unknown };
    ordersUpdateResult: { data: unknown; error: unknown };
  } = {
    quarantineSelectResult: { data: null, error: null },
    quarantineUpdateResult: { data: null, error: null },
    ordersUpdateResult: { data: null, error: null },
  };
  return { mockState };
});

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/lib/supabase/admin", () => {
  // Each call to createAdminClient() returns a fresh factory that tracks
  // which table is being accessed.
  const createAdminClient = vi.fn().mockImplementation(() => {
    // Track how many times cs_intake_quarantine_review is accessed
    // (1st = SELECT, 2nd = UPDATE).
    let quarantineCallCount = 0;

    return {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "cs_intake_quarantine_review") {
          quarantineCallCount += 1;
          const isSelect = quarantineCallCount === 1;

          return {
            select: vi.fn().mockReturnThis(),
            update: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockImplementation(() =>
              Promise.resolve(
                isSelect
                  ? mockState.quarantineSelectResult
                  : mockState.quarantineUpdateResult,
              ),
            ),
          };
        }

        if (table === "orders") {
          // Update chain — awaiting returns ordersUpdateResult
          const ordersChain = {
            update: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            then: undefined as unknown,
          };
          Object.defineProperty(ordersChain, "then", {
            get() {
              return (resolve: (v: unknown) => void) =>
                resolve(mockState.ordersUpdateResult);
            },
            configurable: true,
          });
          return ordersChain;
        }

        // Fallback
        return { select: vi.fn(), update: vi.fn(), eq: vi.fn() };
      }),
    };
  });

  return { createAdminClient };
});

vi.mock("@/lib/permissions", () => ({
  getCurrentUser: vi.fn(),
  isManagerOrAbove: vi.fn(),
}));

import { getCurrentUser, isManagerOrAbove } from "@/lib/permissions";
import { POST } from "../[id]/resolve/route";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(body: unknown) {
  return {
    json: vi.fn().mockResolvedValue(body),
    nextUrl: { searchParams: new URLSearchParams() },
  };
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

const adminUser = { id: "admin-uuid", role: { tier: 2 } };

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/customer-service/admin/quarantine/[id]/resolve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock state
    mockState.quarantineSelectResult = { data: null, error: null };
    mockState.quarantineUpdateResult = { data: null, error: null };
    mockState.ordersUpdateResult = { data: null, error: null };
  });

  it("returns 401 when not authenticated", async () => {
    (getCurrentUser as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await POST(makeReq({ lane: "sales" }) as any, makeParams("1") as any);
    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not admin", async () => {
    (getCurrentUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "rep", role: { tier: 3 } });
    (isManagerOrAbove as ReturnType<typeof vi.fn>).mockReturnValue(false);

    const res = await POST(makeReq({ lane: "sales" }) as any, makeParams("1") as any);
    expect(res.status).toBe(403);
  });

  it("returns 400 when lane is 'quarantine' (invalid for resolve)", async () => {
    (getCurrentUser as ReturnType<typeof vi.fn>).mockResolvedValue(adminUser);
    (isManagerOrAbove as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const res = await POST(makeReq({ lane: "quarantine" }) as any, makeParams("1") as any);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/lane must be one of/);
  });

  it("returns 400 when lane is missing", async () => {
    (getCurrentUser as ReturnType<typeof vi.fn>).mockResolvedValue(adminUser);
    (isManagerOrAbove as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const res = await POST(makeReq({}) as any, makeParams("1") as any);
    expect(res.status).toBe(400);
  });

  it("returns 400 when id param is not a number", async () => {
    (getCurrentUser as ReturnType<typeof vi.fn>).mockResolvedValue(adminUser);
    (isManagerOrAbove as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const res = await POST(makeReq({ lane: "sales" }) as any, makeParams("abc") as any);
    expect(res.status).toBe(400);
  });

  it("returns 404 when quarantine row not found", async () => {
    (getCurrentUser as ReturnType<typeof vi.fn>).mockResolvedValue(adminUser);
    (isManagerOrAbove as ReturnType<typeof vi.fn>).mockReturnValue(true);

    mockState.quarantineSelectResult = { data: null, error: { message: "Not found" } };

    const res = await POST(makeReq({ lane: "sales" }) as any, makeParams("999") as any);
    expect(res.status).toBe(404);
  });

  it("happy path: updates orders.intake_lane and marks review row resolved", async () => {
    (getCurrentUser as ReturnType<typeof vi.fn>).mockResolvedValue(adminUser);
    (isManagerOrAbove as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const reviewRow = { id: 1, order_id: 42, resolved_at: null };
    const updatedRow = {
      id: 1,
      order_id: 42,
      resolved_at: "2026-05-01T10:00:00Z",
      resolved_lane: "sales",
      resolved_by: "admin-uuid",
    };

    mockState.quarantineSelectResult = { data: reviewRow, error: null };
    mockState.ordersUpdateResult = { data: null, error: null };
    mockState.quarantineUpdateResult = { data: updatedRow, error: null };

    const res = await POST(makeReq({ lane: "sales" }) as any, makeParams("1") as any);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.row.resolved_lane).toBe("sales");
    expect(json.row.resolved_by).toBe("admin-uuid");
    expect(json.row.resolved_at).toBeTruthy();
  });

  it("returns 200 with shopify_admin lane", async () => {
    (getCurrentUser as ReturnType<typeof vi.fn>).mockResolvedValue(adminUser);
    (isManagerOrAbove as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const reviewRow = { id: 2, order_id: 43, resolved_at: null };
    const updatedRow = {
      id: 2,
      order_id: 43,
      resolved_at: "2026-05-01T10:00:00Z",
      resolved_lane: "shopify_admin",
      resolved_by: "admin-uuid",
    };

    mockState.quarantineSelectResult = { data: reviewRow, error: null };
    mockState.ordersUpdateResult = { data: null, error: null };
    mockState.quarantineUpdateResult = { data: updatedRow, error: null };

    const res = await POST(makeReq({ lane: "shopify_admin" }) as any, makeParams("2") as any);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.row.resolved_lane).toBe("shopify_admin");
  });
});
