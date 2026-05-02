// src/lib/cs/edit-plan/coverage.ts
//
// Phase B-Lite ledger coverage metric.
//
// Success criterion from the design doc: "ledger captures >= 80% of order
// edits performed in CS within 4 weeks of ship." This module computes the
// numerator and denominator from the ledger itself — no Shopify diff loop
// required.
//
// Definitions:
//   captured = cs_edit_plan_items rows where the parent plan has
//              status = 'applied' AND shopify_commit_id IS NOT NULL,
//              limited to ops Phase B-Lite auto-writes (address_shipping;
//              address_billing if added later). Each such row represents
//              an edit where Avalon was the system of record from the start.
//
//   missed   = cs_edit_plan_items rows where op = 'note' AND
//              payload->>'kind' = 'manual_shopify_edit'. Each represents
//              an edit done outside Avalon and logged after the fact.
//
//   coverage = captured / (captured + missed)
//
// NOTE on what this metric does NOT count:
//   - Shopify-admin edits NOT logged via the manual_log form (truly invisible
//     to Avalon). The reconciler's diff-detection extension would catch those
//     but is deferred — the design doc tracks this as Open Question.
//   - Item changes / cancels — Phase B-Lite doesn't auto-write those, so
//     missed counts ONLY the address-related manual edits. (When a rep does
//     a manual address edit they should log it; that's the metric we track.)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CoverageAdmin = any;

export interface CoverageWindow {
  /** ISO timestamp — only ledger rows created at-or-after this are counted. */
  since: string;
  /** ISO timestamp — exclusive upper bound; defaults to now if not provided. */
  until?: string;
}

export interface CoverageMetric {
  captured: number;
  missed: number;
  total: number;
  coverage_ratio: number; // 0.0 to 1.0; 0 when total=0 (no edits at all)
  window: { since: string; until: string };
}

/**
 * Compute the Phase B-Lite ledger coverage metric over a time window.
 *
 * Two queries against indexed columns; runs in O(captured + missed) over
 * the window. Designed to be cheap enough to call on every admin dashboard
 * load — no caching required at this scale.
 */
export async function computeLedgerCoverage(
  admin: CoverageAdmin,
  window: CoverageWindow,
): Promise<CoverageMetric> {
  const since = window.since;
  const until = window.until ?? new Date().toISOString();

  // captured: address ops on plans that committed via auto-write.
  //   We can't filter by shopify_commit_id on items (it lives on plan rows),
  //   so the strategy is: count items joined to plans where commit_id is
  //   not null. PostgREST inner-join via the FK relationship makes this a
  //   single network round-trip.
  const capturedRes = await admin
    .from('cs_edit_plan_items')
    .select(
      'id, plan:cs_edit_plans!inner(shopify_commit_id, status)',
      { count: 'exact', head: false },
    )
    .in('op', ['address_shipping', 'address_billing'])
    .gte('created_at', since)
    .lt('created_at', until)
    .not('plan.shopify_commit_id', 'is', null)
    .eq('plan.status', 'applied');

  // missed: manual_log notes — captured via free-text payload kind discriminator.
  //   PostgREST supports `?payload->>kind=eq.manual_shopify_edit` directly.
  const missedRes = await admin
    .from('cs_edit_plan_items')
    .select('id', { count: 'exact', head: true })
    .eq('op', 'note')
    .gte('created_at', since)
    .lt('created_at', until)
    .filter('payload->>kind', 'eq', 'manual_shopify_edit');

  if (capturedRes.error) {
    throw new Error(
      `[ledger-coverage] captured query failed: ${capturedRes.error.message}`,
    );
  }
  if (missedRes.error) {
    throw new Error(
      `[ledger-coverage] missed query failed: ${missedRes.error.message}`,
    );
  }

  const captured = capturedRes.count ?? capturedRes.data?.length ?? 0;
  const missed = missedRes.count ?? 0;
  const total = captured + missed;
  const coverage_ratio = total === 0 ? 0 : captured / total;

  return {
    captured,
    missed,
    total,
    coverage_ratio,
    window: { since, until },
  };
}

/**
 * Build a `since` ISO string for the standard rolling 14-day window used by
 * the Phase B-Lite success criterion.
 */
export function rollingWindowSince(daysBack = 14, now = new Date()): string {
  const since = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
  return since.toISOString();
}
