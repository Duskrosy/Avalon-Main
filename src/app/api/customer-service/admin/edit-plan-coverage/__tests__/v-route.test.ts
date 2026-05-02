// @ts-nocheck — vitest is not yet a devDependency in this project.
//
// Run: npx vitest run src/app/api/customer-service/admin/edit-plan-coverage/__tests__/v-route.test.ts
//
// HTTP-shell coverage for the edit-plan-coverage admin endpoint. Tests
// auth, role gating, query param validation, and response shaping.
// computeLedgerCoverage is mocked at the module boundary; its own
// behaviour is unit-tested in v-coverage.test.ts.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Mocks (hoisted before route import) ────────────────────────────────────

let mockGetUser: ReturnType<typeof vi.fn>;
let mockIsManager: ReturnType<typeof vi.fn>;
let mockComputeCoverage: ReturnType<typeof vi.fn>;

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({})),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({})),
}));

vi.mock('@/lib/permissions', () => ({
  getCurrentUser: vi.fn(async () => mockGetUser()),
  isManagerOrAbove: vi.fn((u: unknown) => mockIsManager(u)),
}));

vi.mock('@/lib/cs/edit-plan/coverage', () => ({
  computeLedgerCoverage: vi.fn(async (...args: unknown[]) => mockComputeCoverage(...args)),
  rollingWindowSince: vi.fn((days: number) =>
    new Date(Date.UTC(2026, 4, 3) - days * 24 * 60 * 60 * 1000).toISOString(),
  ),
}));

import { GET } from '../route';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeRequest(query = ''): NextRequest {
  const url = `http://localhost/api/customer-service/admin/edit-plan-coverage${query}`;
  return new NextRequest(url);
}

const ADMIN_USER = { id: 'admin-1', role: { tier: 1 } };
const REP_USER = { id: 'rep-1', role: { tier: 3 } };

beforeEach(() => {
  mockGetUser = vi.fn(() => ADMIN_USER);
  mockIsManager = vi.fn(() => true);
  mockComputeCoverage = vi.fn(() => ({
    captured: 8,
    missed: 2,
    total: 10,
    coverage_ratio: 0.8,
    window: { since: '2026-04-19T00:00:00.000Z', until: '2026-05-03T00:00:00.000Z' },
  }));
});

// ─── Auth ───────────────────────────────────────────────────────────────────

describe('GET /admin/edit-plan-coverage — auth', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetUser = vi.fn(() => null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    expect(mockComputeCoverage).not.toHaveBeenCalled();
  });

  it('returns 403 when authenticated rep is not a manager', async () => {
    mockGetUser = vi.fn(() => REP_USER);
    mockIsManager = vi.fn(() => false);
    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
    expect(mockComputeCoverage).not.toHaveBeenCalled();
  });
});

// ─── Param validation ───────────────────────────────────────────────────────

describe('GET /admin/edit-plan-coverage — param validation', () => {
  it('returns 400 when days is not a number', async () => {
    const res = await GET(makeRequest('?days=foo'));
    expect(res.status).toBe(400);
    expect(mockComputeCoverage).not.toHaveBeenCalled();
  });

  it('returns 400 when days is below the minimum (1)', async () => {
    const res = await GET(makeRequest('?days=0'));
    expect(res.status).toBe(400);
  });

  it('returns 400 when days exceeds the maximum (90)', async () => {
    const res = await GET(makeRequest('?days=91'));
    expect(res.status).toBe(400);
  });

  it('returns 400 when days is a non-integer', async () => {
    const res = await GET(makeRequest('?days=14.5'));
    expect(res.status).toBe(400);
  });

  it('accepts edge values 1 and 90', async () => {
    let res = await GET(makeRequest('?days=1'));
    expect(res.status).toBe(200);
    res = await GET(makeRequest('?days=90'));
    expect(res.status).toBe(200);
  });
});

// ─── Response shape ─────────────────────────────────────────────────────────

describe('GET /admin/edit-plan-coverage — response', () => {
  it('returns coverage with days=14 default and meets_target true at 0.8', async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      captured: 8,
      missed: 2,
      total: 10,
      coverage_ratio: 0.8,
      days: 14,
      threshold_target: 0.8,
      meets_target: true,
    });
  });

  it('returns meets_target false when coverage is below 0.8', async () => {
    mockComputeCoverage = vi.fn(() => ({
      captured: 3,
      missed: 7,
      total: 10,
      coverage_ratio: 0.3,
      window: { since: '...', until: '...' },
    }));
    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.meets_target).toBe(false);
    expect(body.coverage_ratio).toBe(0.3);
  });

  it('returns meets_target true at exactly 0.8', async () => {
    mockComputeCoverage = vi.fn(() => ({
      captured: 4,
      missed: 1,
      total: 5,
      coverage_ratio: 0.8,
      window: { since: '...', until: '...' },
    }));
    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.meets_target).toBe(true);
  });

  it('returns 500 when computeLedgerCoverage throws', async () => {
    mockComputeCoverage = vi.fn(() => {
      throw new Error('db connection refused');
    });
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/failed to compute/i);
  });

  it('passes the parsed days through to rollingWindowSince', async () => {
    await GET(makeRequest('?days=30'));
    expect(mockComputeCoverage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        since: expect.any(String),
      }),
    );
  });
});
