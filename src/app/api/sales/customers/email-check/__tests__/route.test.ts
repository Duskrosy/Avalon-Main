// @ts-nocheck
// Run: npx vitest run "src/app/api/sales/customers/email-check/__tests__/route.test.ts"
// vitest is not yet a project devDependency — `npx vitest` auto-installs.

import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/permissions", () => ({
  getCurrentUser: vi.fn().mockResolvedValue({ id: "u1" }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn().mockResolvedValue({}) }));

vi.mock("node:dns/promises", () => ({
  default: { resolveMx: vi.fn() },
}));

import dns from "node:dns/promises";
import { GET } from "../route";

const makeReq = (email: string) =>
  ({
    nextUrl: { searchParams: new URLSearchParams({ email }) },
  } as any);

describe("GET /api/sales/customers/email-check", () => {
  it("ok when MX records exist", async () => {
    (dns.resolveMx as any).mockResolvedValue([{ exchange: "mx.gmail.com", priority: 5 }]);
    const res = await GET(makeReq("user@gmail.com"));
    expect(await res.json()).toEqual({ ok: true });
  });

  it("not-ok when domain has no MX", async () => {
    (dns.resolveMx as any).mockRejectedValue(new Error("ENODATA"));
    const res = await GET(makeReq("user@gmail.con"));
    const j = await res.json();
    expect(j.ok).toBe(false);
    expect(j.reason).toMatch(/gmail.con/);
  });

  it("rejects malformed email", async () => {
    const res = await GET(makeReq("not-an-email"));
    const j = await res.json();
    expect(j.ok).toBe(false);
  });
});
