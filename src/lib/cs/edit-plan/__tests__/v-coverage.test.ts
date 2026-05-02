// @ts-nocheck — vitest is not yet a devDependency in this project.
//
// Run: npx vitest run src/lib/cs/edit-plan/__tests__/v-coverage.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { computeLedgerCoverage, rollingWindowSince } from '../coverage';

// ─── Mock builder ───────────────────────────────────────────────────────────
//
// computeLedgerCoverage runs two PostgREST queries. Each returns
// { count, error }. We build a minimal fluent mock that returns the
// configured count terminal-side.

interface QueryResult {
  count?: number;
  data?: unknown[];
  error?: { message: string } | null;
}

function makeAdmin(captured: QueryResult, missed: QueryResult) {
  let callIndex = 0;
  const from = vi.fn(() => {
    const result = callIndex === 0 ? captured : missed;
    callIndex += 1;
    return makeChain(result);
  });
  return { from };
}

function makeChain(result: QueryResult) {
  // Chain methods return self; the chain is the awaited terminal.
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    lt: vi.fn(() => chain),
    not: vi.fn(() => chain),
    filter: vi.fn(() => chain),
    then: (resolve: (v: QueryResult) => unknown) =>
      Promise.resolve(result).then(resolve),
  };
  return chain;
}

beforeEach(() => {
  // Pure-function tests; nothing to reset.
});

// ─── computeLedgerCoverage ──────────────────────────────────────────────────

describe('computeLedgerCoverage', () => {
  it('returns ratio for a mix of captured and missed', async () => {
    const admin = makeAdmin(
      { count: 8, error: null },
      { count: 2, error: null },
    );
    const result = await computeLedgerCoverage(admin, {
      since: '2026-04-19T00:00:00Z',
      until: '2026-05-03T00:00:00Z',
    });
    expect(result.captured).toBe(8);
    expect(result.missed).toBe(2);
    expect(result.total).toBe(10);
    expect(result.coverage_ratio).toBe(0.8);
    expect(result.window).toEqual({
      since: '2026-04-19T00:00:00Z',
      until: '2026-05-03T00:00:00Z',
    });
  });

  it('returns zero coverage_ratio when no edits in window (avoids div by 0)', async () => {
    const admin = makeAdmin(
      { count: 0, error: null },
      { count: 0, error: null },
    );
    const result = await computeLedgerCoverage(admin, {
      since: '2026-04-19T00:00:00Z',
    });
    expect(result.captured).toBe(0);
    expect(result.missed).toBe(0);
    expect(result.total).toBe(0);
    expect(result.coverage_ratio).toBe(0);
  });

  it('returns 1.0 when all edits captured (no manual logs)', async () => {
    const admin = makeAdmin(
      { count: 5, error: null },
      { count: 0, error: null },
    );
    const result = await computeLedgerCoverage(admin, {
      since: '2026-04-19T00:00:00Z',
    });
    expect(result.coverage_ratio).toBe(1);
  });

  it('returns 0.0 when only manual logs (no captures)', async () => {
    const admin = makeAdmin(
      { count: 0, error: null },
      { count: 7, error: null },
    );
    const result = await computeLedgerCoverage(admin, {
      since: '2026-04-19T00:00:00Z',
    });
    expect(result.coverage_ratio).toBe(0);
    expect(result.missed).toBe(7);
  });

  it('throws when the captured query errors', async () => {
    const admin = makeAdmin(
      { count: 0, error: { message: 'connection lost' } },
      { count: 0, error: null },
    );
    await expect(
      computeLedgerCoverage(admin, { since: '2026-04-19T00:00:00Z' }),
    ).rejects.toThrow(/connection lost/);
  });

  it('throws when the missed query errors', async () => {
    const admin = makeAdmin(
      { count: 5, error: null },
      { count: 0, error: { message: 'syntax err in filter' } },
    );
    await expect(
      computeLedgerCoverage(admin, { since: '2026-04-19T00:00:00Z' }),
    ).rejects.toThrow(/syntax err in filter/);
  });

  it('falls back to data.length when count is undefined (PostgREST head:false path)', async () => {
    const admin = makeAdmin(
      { count: undefined, data: [{ id: 1 }, { id: 2 }, { id: 3 }], error: null },
      { count: 1, error: null },
    );
    const result = await computeLedgerCoverage(admin, {
      since: '2026-04-19T00:00:00Z',
    });
    expect(result.captured).toBe(3);
  });

  it('defaults until to now when not provided', async () => {
    const admin = makeAdmin(
      { count: 1, error: null },
      { count: 0, error: null },
    );
    const before = Date.now();
    const result = await computeLedgerCoverage(admin, {
      since: '2026-04-19T00:00:00Z',
    });
    const after = Date.now();
    const untilMs = new Date(result.window.until).getTime();
    expect(untilMs).toBeGreaterThanOrEqual(before);
    expect(untilMs).toBeLessThanOrEqual(after);
  });
});

// ─── rollingWindowSince ─────────────────────────────────────────────────────

describe('rollingWindowSince', () => {
  it('returns ISO 14 days back from now by default', () => {
    const now = new Date('2026-05-03T00:00:00Z');
    expect(rollingWindowSince(14, now)).toBe('2026-04-19T00:00:00.000Z');
  });

  it('respects custom days back', () => {
    const now = new Date('2026-05-03T00:00:00Z');
    expect(rollingWindowSince(7, now)).toBe('2026-04-26T00:00:00.000Z');
    expect(rollingWindowSince(30, now)).toBe('2026-04-03T00:00:00.000Z');
  });
});
