// src/lib/cs/edit-plan/types.ts
//
// Response shapes for the edit-plan composer API.
// Column names follow migration 00101_cs_pass_2_intake_and_plans.sql.

// ─── IntakeLane ───────────────────────────────────────────────────────────────
// Defined locally because src/lib/sales/intake-lane.ts lives in Lane 4's
// territory (parallel work). Replace this import once Lane 4 lands.
// Source of truth: orders_intake_lane_check CHECK constraint in migration 00101.
export type IntakeLane = 'sales' | 'shopify_admin' | 'conversion' | 'quarantine';

// ─── Edit plan enums ──────────────────────────────────────────────────────────

export type EditPlanStatus =
  | 'draft'
  | 'applying'
  | 'applied'
  | 'failed'
  | 'cancelled';

export type EditPlanOp =
  | 'add_item'
  | 'remove_item'
  | 'qty_change'
  | 'address_shipping'
  | 'address_billing'
  | 'note';

export type EditPath = 'order_edit' | 'child_order' | 'cancel_relink';

export type PaymentImplication = 'no_change' | 'additional_charge' | 'refund_due';

// ─── Core types ───────────────────────────────────────────────────────────────

export interface EditPlanItem {
  id: number;
  op: EditPlanOp;
  /** Typed via op-shapes.ts at runtime via parsePlanItemPayload(). */
  payload: unknown;
  created_at: string;
}

export interface EditPlan {
  id: number;
  order_id: number;
  status: EditPlanStatus;
  chosen_path: EditPath | null;
  items: EditPlanItem[];

  // ── Computed analysis (server-side, derived in computePlanAnalysis) ──────
  /** Signed amount. Positive = customer owes more. Negative = refund due. */
  price_delta: number;
  payment_implication: PaymentImplication;
  /** Heuristic suggestion. Phase A always returns 'order_edit'. */
  proposed_path: EditPath;

  // ── Applied / failed metadata ────────────────────────────────────────────
  applied_at: string | null;
  error_message: string | null;
}

// ─── Request / response shapes ────────────────────────────────────────────────

export interface ComposeRequest {
  order_id: number;
  items: Array<{ op: EditPlanOp; payload: unknown }>;
}

export interface ComposeResponse {
  plan: EditPlan;
}
