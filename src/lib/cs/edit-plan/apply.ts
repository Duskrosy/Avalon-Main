// src/lib/cs/edit-plan/apply.ts
//
// Phase B-Lite — Apply orchestration for the address-only Shopify auto-write.
//
// State machine (cs_edit_plans.status):
//
//      ┌──────┐         ┌──────────┐         ┌──────────┐
//      │draft │ ─CAS──► │ applying │ ─CAS──► │ applied  │
//      └──────┘         └──────────┘         └──────────┘
//          │                  │                   │
//          │                  │                   │
//          │                  ▼                   │
//          │            ┌──────────┐              │
//          │            │  failed  │ ◄────────────┘
//          │            └──────────┘   (caller-side error)
//          ▼
//      (race lost — another rep won the CAS to applying)
//
// Shopify edit flow (between draft→applying lock and applied commit):
//
//   orderEditBegin(shopify_order_id) ──► calc_order_id (persisted to row)
//          │
//          ▼
//   orderEditUpdateShippingAddress(calc_order_id, address)
//          │
//          ▼
//   orderEditCommit(calc_order_id) ──► committed_order_id (idempotency anchor)
//          │
//          ▼
//   conditional UPDATE applying→applied SET shopify_commit_id, applied_at
//
// Crash / network-loss between Commit fired and response received leaves
// the row in 'applying' indefinitely. Recovery does NOT live here — the
// /full route's stuck-plan logic auto-reverts after 60s and re-polls
// Shopify (Lane D, separate ship).

import type {
  EditPlanItem,
  EditPlanOp,
} from './types';
import type {
  AddressPayload,
  ManualShopifyEditNotePayload,
} from './op-shapes';
import type {
  ShopifyMailingAddressInput,
  OrderEditBeginResult,
  OrderEditCommitResult,
} from '../../shopify/client';

// ─── Dependency surface ──────────────────────────────────────────────────────
//
// Injected for testability. Tests pass plain function mocks for `shopify`
// and a fluent-API mock for `admin` matching how Supabase chains read.

export interface ApplyShopifyDeps {
  orderEditBegin(shopifyOrderId: string): Promise<OrderEditBeginResult>;
  orderEditUpdateShippingAddress(
    calculatedOrderId: string,
    address: ShopifyMailingAddressInput,
  ): Promise<void>;
  orderEditCommit(calculatedOrderId: string): Promise<OrderEditCommitResult>;
}

// Supabase admin client — typed loosely because the project consistently
// casts admin to `any` (the supabase-js types are heavy). Tests pass a
// minimal mock that implements the chains used below.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ApplyAdminClient = any;

export interface ApplyDeps {
  admin: ApplyAdminClient;
  shopify: ApplyShopifyDeps;
  /** Override clock for deterministic test timestamps. */
  now?: () => Date;
}

// ─── Result shape ────────────────────────────────────────────────────────────

export type ApplyResult =
  | { status: 'applied'; commit_id: string }
  | { status: 'failed'; error: string }
  | { status: 'race'; reason: 'plan_not_found' | 'no_longer_draft' };

// ─── Internal types ──────────────────────────────────────────────────────────

interface PlanRow {
  id: number;
  order_id: string;
  status: string;
  shopify_calculated_order_id: string | null;
  shopify_commit_id: string | null;
}

interface PlanItemRow {
  id: number;
  op: EditPlanOp;
  payload: unknown;
}

// ─── Main orchestration ──────────────────────────────────────────────────────

export async function applyPlan(
  planId: number,
  deps: ApplyDeps,
): Promise<ApplyResult> {
  const nowIso = () => (deps.now?.() ?? new Date()).toISOString();

  // 1. Fetch plan + items
  const { data: plan, error: planErr } = await deps.admin
    .from('cs_edit_plans')
    .select(
      'id, order_id, status, shopify_calculated_order_id, shopify_commit_id',
    )
    .eq('id', planId)
    .maybeSingle();

  if (planErr) {
    return { status: 'failed', error: `plan fetch failed: ${planErr.message}` };
  }
  if (!plan) {
    return { status: 'race', reason: 'plan_not_found' };
  }
  const planRow = plan as PlanRow;

  const { data: itemsRaw, error: itemsErr } = await deps.admin
    .from('cs_edit_plan_items')
    .select('id, op, payload')
    .eq('plan_id', planId);

  if (itemsErr) {
    return { status: 'failed', error: `items fetch failed: ${itemsErr.message}` };
  }
  const items = (itemsRaw ?? []) as PlanItemRow[];

  // 2. Phase B-Lite scope check — must contain exactly one address_shipping op.
  // Manual-log notes (kind='manual_shopify_edit') are ledger-only and never
  // hit this path; they're captured via the compose endpoint and never get
  // an Apply click. Item ops aren't auto-written either.
  const auto = pickAutoWritableOp(items);
  if (auto.kind === 'none') {
    return {
      status: 'failed',
      error:
        'No auto-writable op in plan. Phase B-Lite supports address_shipping only.',
    };
  }
  if (auto.kind === 'unsupported') {
    return {
      status: 'failed',
      error: `Op "${auto.op}" is not auto-writable in Phase B-Lite. Apply manually in Shopify admin and log via manual_shopify_edit note.`,
    };
  }
  const addressPayload = auto.payload;

  // 3. Read order's shopify_order_id
  const { data: orderRow, error: orderErr } = await deps.admin
    .from('orders')
    .select('shopify_order_id')
    .eq('id', planRow.order_id)
    .maybeSingle();

  if (orderErr) {
    return { status: 'failed', error: `order fetch failed: ${orderErr.message}` };
  }
  if (!orderRow?.shopify_order_id) {
    return {
      status: 'failed',
      error: 'Order has no shopify_order_id; cannot auto-write to Shopify.',
    };
  }
  const shopifyOrderId = String(orderRow.shopify_order_id);

  // 4. Conditional UPDATE draft → applying. Loser of any race here exits
  // cleanly with reason='no_longer_draft'.
  const lockResult = await deps.admin
    .from('cs_edit_plans')
    .update({
      status: 'applying',
      applying_started_at: nowIso(),
    })
    .eq('id', planId)
    .eq('status', 'draft')
    .select('id')
    .maybeSingle();

  if (lockResult.error) {
    return {
      status: 'failed',
      error: `lock UPDATE failed: ${lockResult.error.message}`,
    };
  }
  if (!lockResult.data) {
    return { status: 'race', reason: 'no_longer_draft' };
  }

  // 5. orderEditBegin
  let calcOrderId: string;
  try {
    const begin = await deps.shopify.orderEditBegin(shopifyOrderId);
    calcOrderId = begin.calculatedOrderId;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'orderEditBegin failed';
    await markFailed(deps.admin, planId, msg);
    return { status: 'failed', error: msg };
  }

  // Persist calc_order_id immediately so /full's stuck-plan recovery has
  // it available for re-poll comparison if Commit ambiguously fails.
  await deps.admin
    .from('cs_edit_plans')
    .update({ shopify_calculated_order_id: calcOrderId })
    .eq('id', planId);

  // 6. orderEditUpdateShippingAddress
  try {
    await deps.shopify.orderEditUpdateShippingAddress(
      calcOrderId,
      mapAddressPayloadToShopify(addressPayload),
    );
  } catch (err) {
    const msg =
      err instanceof Error
        ? err.message
        : 'orderEditUpdateShippingAddress failed';
    await markFailed(deps.admin, planId, msg);
    return { status: 'failed', error: msg };
  }

  // 7. orderEditCommit. Failure here leaves the plan in 'applying' so
  // /full's re-poll can determine whether Shopify actually wrote it.
  let commitId: string;
  try {
    const commit = await deps.shopify.orderEditCommit(calcOrderId);
    commitId = commit.committedOrderId;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'orderEditCommit failed';
    // Intentionally do NOT mark failed here — leave in 'applying' for
    // /full route stuck-plan recovery (Lane D) which can disambiguate
    // by re-fetching the order from Shopify.
    return { status: 'failed', error: msg };
  }

  // 8. Conditional UPDATE applying → applied
  const appliedResult = await deps.admin
    .from('cs_edit_plans')
    .update({
      status: 'applied',
      shopify_commit_id: commitId,
      applied_at: nowIso(),
    })
    .eq('id', planId)
    .eq('status', 'applying')
    .select('id')
    .maybeSingle();

  if (appliedResult.error || !appliedResult.data) {
    // Edge case: the row left 'applying' (e.g., /full's stuck-plan logic
    // already reverted it). The Shopify side committed though, so this is
    // an audit-trail mismatch we surface as failed with the commit_id in
    // the error message for debugging.
    return {
      status: 'failed',
      error: `commit succeeded (${commitId}) but plan no longer in 'applying' state`,
    };
  }

  return { status: 'applied', commit_id: commitId };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

type AutoPick =
  | { kind: 'shipping_address'; payload: AddressPayload }
  | { kind: 'unsupported'; op: string }
  | { kind: 'none' };

/**
 * Phase B-Lite picks the single auto-writable op from a plan. Today that's
 * exactly `address_shipping`. Address_billing is intentionally excluded
 * (Shopify's orderEdit doesn't expose a clean billing-address mutation;
 * billing changes can stay manual). Anything else is unsupported.
 */
function pickAutoWritableOp(items: PlanItemRow[]): AutoPick {
  const shipping = items.find((i) => i.op === 'address_shipping');
  if (shipping) {
    return {
      kind: 'shipping_address',
      payload: shipping.payload as AddressPayload,
    };
  }
  // If the plan has only manual-log notes, that's "none" not "unsupported"
  // because manual-log doesn't ask for an Apply click in the first place.
  const nonNote = items.find((i) => i.op !== 'note');
  if (nonNote) return { kind: 'unsupported', op: nonNote.op };
  // Pure note-only plans (free-text or manual_shopify_edit) — none auto-writable.
  // Caller treats this the same as missing — apply was clicked on a plan
  // that has nothing for B-Lite to do.
  if (items.some((i) => i.op === 'note' && isManualLogNote(i.payload))) {
    return { kind: 'none' };
  }
  return { kind: 'none' };
}

function isManualLogNote(payload: unknown): payload is ManualShopifyEditNotePayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    (payload as { kind?: unknown }).kind === 'manual_shopify_edit'
  );
}

function mapAddressPayloadToShopify(
  payload: AddressPayload,
): ShopifyMailingAddressInput {
  const out: ShopifyMailingAddressInput = {
    address1: payload.street,
    city: payload.city,
    country: payload.country,
  };
  if (payload.province !== undefined) out.province = payload.province;
  if (payload.zip !== undefined) out.zip = payload.zip;
  if (payload.phone !== undefined) out.phone = payload.phone;
  if (payload.recipient_name !== undefined) {
    const parts = payload.recipient_name.trim().split(/\s+/);
    out.firstName = parts[0] ?? '';
    if (parts.length > 1) out.lastName = parts.slice(1).join(' ');
  }
  return out;
}

async function markFailed(
  admin: ApplyAdminClient,
  planId: number,
  message: string,
): Promise<void> {
  await admin
    .from('cs_edit_plans')
    .update({
      status: 'failed',
      error_message: message,
    })
    .eq('id', planId)
    .eq('status', 'applying');
}
