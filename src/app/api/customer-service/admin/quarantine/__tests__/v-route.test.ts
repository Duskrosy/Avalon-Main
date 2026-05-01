// @ts-nocheck
// src/app/api/customer-service/admin/quarantine/__tests__/v-route.test.ts
//
// Coverage:
//   - Non-admin user → 403
//   - Unauthenticated → 401
//   - Admin → 200 + rows
//   - Quarantine tab returns pending rows by default
//   - Quarantine tab returns resolved rows with ?status=resolved
//   - Disputes tab returns disagreements
//   - DB error → 500

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mock state ───────────────────────────────────────────────────────
// vi.hoisted() runs before vi.mock() factories, so variables are accessible
// in the factory closures without hoisting errors.

const { adminChain } = vi.hoisted(() => {
  const chain: Record<string, unknown> & { _resolve: unknown } = {
    from: null as unknown,
    select: null as unknown,
    order: null as unknown,
    is: null as unknown,
    not: null as unknown,
    _resolve: { data: [], error: null, count: 0 },
  };

  // Make chain methods chainable
  chain.from = vi.fn().mockReturnValue(chain);
  chain.select = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.is = vi.fn().mockReturnValue(chain);
  chain.not = vi.fn().mockReturnValue(chain);

  // Make awaiting the chain return _resolve
  Object.defineProperty(chain, "then", {
    get() {
      return (resolve: (v: unknown) => void) => resolve(chain._resolve);
    },
    configurable: true,
  });

  return { adminChain: chain };
});

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn().mockReturnValue(adminChain),
}));
vi.mock("@/lib/permissions", () => ({
  getCurrentUser: vi.fn(),
  isManagerOrAbove: vi.fn(),
}));

import { getCurrentUser, isManagerOrAbove } from "@/lib/permissions";
import { GET } from "../route";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(search = "") {
  const url = new URL(
    `http://localhost/api/customer-service/admin/quarantine${search ? "?" + search : ""}`,
  );
  return { nextUrl: { searchParams: url.searchParams } };
}

const adminUser = { id: "admin-uuid", role: { tier: 2 } };

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/customer-service/admin/quarantine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adminChain._resolve = { data: [], error: null, count: 0 };
    // Re-attach chainable methods after clearAllMocks
    adminChain.from = vi.fn().mockReturnValue(adminChain);
    adminChain.select = vi.fn().mockReturnValue(adminChain);
    adminChain.order = vi.fn().mockReturnValue(adminChain);
    adminChain.is = vi.fn().mockReturnValue(adminChain);
    adminChain.not = vi.fn().mockReturnValue(adminChain);
  });

  it("returns 401 when not authenticated", async () => {
    (getCurrentUser as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await GET(makeReq() as any);
    expect(res.status).toBe(401);
  });

  it("returns 403 when authenticated but not admin", async () => {
    (getCurrentUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "rep-uuid",
      role: { tier: 3 },
    });
    (isManagerOrAbove as ReturnType<typeof vi.fn>).mockReturnValue(false);

    const res = await GET(makeReq() as any);
    expect(res.status).toBe(403);
  });

  it("returns pending quarantine rows by default (no ?tab or ?status)", async () => {
    (getCurrentUser as ReturnType<typeof vi.fn>).mockResolvedValue(adminUser);
    (isManagerOrAbove as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const rows = [
      { id: 1, order_id: 10, classified_at: "2026-05-01T10:00:00Z", resolved_at: null },
      { id: 2, order_id: 11, classified_at: "2026-05-01T09:00:00Z", resolved_at: null },
    ];
    adminChain._resolve = { data: rows, error: null, count: 2 };

    const res = await GET(makeReq() as any);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.rows).toHaveLength(2);
    expect(json.count).toBe(2);
    for (const row of json.rows) {
      expect(row.resolved_at).toBeNull();
    }
  });

  it("returns resolved quarantine rows when ?status=resolved", async () => {
    (getCurrentUser as ReturnType<typeof vi.fn>).mockResolvedValue(adminUser);
    (isManagerOrAbove as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const rows = [
      {
        id: 3,
        order_id: 12,
        classified_at: "2026-04-30T08:00:00Z",
        resolved_at: "2026-05-01T09:00:00Z",
        resolved_lane: "sales",
      },
    ];
    adminChain._resolve = { data: rows, error: null, count: 1 };

    const res = await GET(makeReq("status=resolved") as any);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.rows).toHaveLength(1);
    expect(json.rows[0].resolved_lane).toBe("sales");
  });

  it("returns disagreements when ?tab=disputes", async () => {
    (getCurrentUser as ReturnType<typeof vi.fn>).mockResolvedValue(adminUser);
    (isManagerOrAbove as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const rows = [
      {
        id: 1,
        order_id: 10,
        winner_lane: "sales",
        loser_lane: "conversion",
        source_winner: "webhook",
        source_loser: "reconciler",
        recorded_at: "2026-05-01T10:00:00Z",
      },
    ];
    adminChain._resolve = { data: rows, error: null, count: 1 };

    const res = await GET(makeReq("tab=disputes") as any);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.rows).toHaveLength(1);
    expect(json.rows[0].winner_lane).toBe("sales");
    expect(json.rows[0].loser_lane).toBe("conversion");
    expect(json.rows[0].source_winner).toBe("webhook");
  });

  it("returns 500 when the database query errors", async () => {
    (getCurrentUser as ReturnType<typeof vi.fn>).mockResolvedValue(adminUser);
    (isManagerOrAbove as ReturnType<typeof vi.fn>).mockReturnValue(true);

    adminChain._resolve = { data: null, error: { message: "DB error" }, count: 0 };

    const res = await GET(makeReq() as any);
    expect(res.status).toBe(500);

    const json = await res.json();
    expect(json.error).toBe("DB error");
  });
});
