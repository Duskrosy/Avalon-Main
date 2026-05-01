// src/lib/sales/intake-lane.ts
//
// Pure classifier — NO database access. Determines which intake lane an
// incoming Shopify order belongs to, given the Shopify payload and a
// pre-fetched Avalon linkage object (whether we already have a record for
// this order in our DB, or a note_attribute proving it was Avalon-originated).
//
// PRECEDENCE (strictly ordered — DO NOT reorder):
//
//   1. Avalon linkage  → 'sales'
//      The most reliable signal. An existing Avalon order record or a
//      note_attribute written by the Avalon sales flow means a CS rep
//      created this order — it belongs in the sales lane regardless of
//      what Shopify's metadata says.
//
//   2. Admin-originated → 'shopify_admin'
//      POS, draft orders, and non-web-checkout app_ids are admin tools.
//      Checked before the web/null rule because some admin tools set
//      source_name='web' while also sending a non-standard app_id (see
//      test 11 — rule 2 must fire first to catch this edge case).
//
//   3. Web / null → 'conversion'
//      Standard storefront checkout (source_name='web', app_id=580111)
//      or fully absent metadata (null+null) — both are treated as
//      storefront self-service purchases.
//
//   4. Anything else → 'quarantine'
//      A non-null, unrecognised source_name that doesn't match rules 1–3.
//      Routed to quarantine for manual review. Silence is NOT a default;
//      unknown source_names must be explicitly classified.
//
// This precedence is enforced by upstream design: Avalon linkage wins
// because it is the most authoritative signal that our own system produced
// the order. The other rules are heuristics layered beneath it.

export type IntakeLane = "sales" | "shopify_admin" | "conversion" | "quarantine";

export interface AvalonLinkage {
  /** True when `orders` already has a row whose shopify_order_id matches. */
  hasAvalonOrderRecord: boolean;
  /** True when the Shopify order has a note_attribute written by the Avalon sales flow. */
  hasAvalonNoteAttribute: boolean;
}

export interface ShopifyOrderForClassification {
  /** Shopify source_name field — 'web', 'pos', 'shopify_draft_order', etc. */
  source_name?: string | null;
  /**
   * Shopify app_id — 580111 is the web checkout app.
   * Any other non-null value indicates a non-storefront app (admin, POS, etc.).
   */
  app_id?: number | string | null;
  /** Shopify note_attributes array — inspected by caller to populate AvalonLinkage. */
  note_attributes?: Array<{ name: string; value: string }> | null;
}

/** Shopify's web checkout app id. Orders from the storefront carry this value. */
const SHOPIFY_WEB_APP_ID = 580111;

/**
 * Classify a Shopify order into one of the four Avalon intake lanes.
 *
 * @param order  - Fields from the Shopify order payload (source_name, app_id, note_attributes).
 * @param linkage - Pre-fetched booleans describing whether Avalon already knows about this order.
 * @returns      The intake lane: 'sales' | 'shopify_admin' | 'conversion' | 'quarantine'.
 */
export function classifyIntakeLane(
  order: ShopifyOrderForClassification,
  linkage: AvalonLinkage,
): IntakeLane {
  // Rule 1 — Avalon linkage (highest priority)
  if (linkage.hasAvalonOrderRecord || linkage.hasAvalonNoteAttribute) {
    return "sales";
  }

  const sourceName = order.source_name ?? null;
  // Normalise app_id to number — Shopify REST returns number but GraphQL /
  // some webhooks return the same value as a string (e.g. "580111").
  // Number("580111") === 580111, so this handles both forms safely.
  const appIdNum = order.app_id != null ? Number(order.app_id) : null;

  // Rule 2 — Admin-originated
  //   - POS terminal
  //   - Shopify draft order admin tool
  //   - Any app_id that is not the web checkout app (580111)
  //     NOTE: checked before source_name==='web' so that an admin app which
  //     sets source_name='web' is still correctly classified as shopify_admin.
  const isAdminApp = appIdNum !== null && appIdNum !== SHOPIFY_WEB_APP_ID;
  if (
    sourceName === "pos" ||
    sourceName === "shopify_draft_order" ||
    isAdminApp
  ) {
    return "shopify_admin";
  }

  // Rule 3 — Web / null → conversion
  //   - source_name === 'web'  (standard storefront checkout)
  //   - source_name === null AND app_id === null  (absent metadata = web fallback)
  if (sourceName === "web" || (sourceName === null && appIdNum === null)) {
    return "conversion";
  }

  // Rule 4 — Quarantine
  //   Everything else is unknown. Do NOT silently default to conversion.
  return "quarantine";
}
