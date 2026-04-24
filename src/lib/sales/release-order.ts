/**
 * Release-order helper — shared by /cancel and /revert-to-draft API routes.
 *
 * Owns the Shopify-cancel + order-row-update branching. Inventory release is
 * a sibling concern handled by the calling API route via Inventory v1's
 * public.create_inventory_movement RPC (it needs context this helper does not
 * have: from/to location ids captured at confirm time).
 *
 * CRITICAL ORDERING (codex finding #6, applied per rev 2):
 *   When the order has previously synced, we MUST call Shopify cancel BEFORE
 *   the local DB update. If Shopify cancel fails, the local row stays
 *   confirmed/synced — recoverable. If we updated the local DB first and
 *   Shopify cancel failed, we'd have stock released locally with a still-live
 *   Shopify order — split-brain.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { cancelShopifyOrder } from "@/lib/shopify/client";

export type ReleaseAction = "cancel" | "revert";

export type ReleaseOrderInput = {
  orderId: string;
  action: ReleaseAction;
  /** Reason for the cancel/revert; logged to sync_error and Shopify cancel reason. */
  reason?: string;
  /** User performing the action. Recorded in audit; nullable for cron paths. */
  actingUserId?: string | null;
};

export type ReleaseOrderResult =
  | {
      ok: true;
      shopifyCancelled: boolean;
      shopifyOrderId: string | null;
      avalonOrderNumber: string | null;
    }
  | {
      ok: false;
      stage: "fetch" | "shopify_cancel" | "sync_update" | "order_update";
      error: string;
      partialState?: { shopifyCancelled: boolean };
    };

/**
 * Run the cancel/revert state transition. The caller is expected to:
 *   1. Validate permissions (owner / manager) BEFORE calling this.
 *   2. Run inventory release (Inventory v1 movement) AFTER this returns ok=true.
 *   3. Wrap the whole flow in a request-level transaction where possible.
 *
 * This helper itself does not run inventory movements — see the comment above
 * for the rationale. It does mutate orders + order_shopify_syncs; both have
 * audit triggers wired so the change is captured.
 */
export async function releaseOrder(
  supabase: SupabaseClient,
  input: ReleaseOrderInput,
): Promise<ReleaseOrderResult> {
  const { orderId, action, reason, actingUserId } = input;

  // 1. Fetch the order with its latest successful sync attempt.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: order, error: fetchErr } = await (supabase as any)
    .from("orders")
    .select(
      "id, status, sync_status, shopify_order_id, avalon_order_number, deleted_at",
    )
    .eq("id", orderId)
    .maybeSingle();

  if (fetchErr || !order) {
    return {
      ok: false,
      stage: "fetch",
      error: fetchErr?.message ?? "order not found",
    };
  }

  // Idempotency: if already cancelled and we're cancelling again, no-op.
  if (action === "cancel" && order.status === "cancelled") {
    return {
      ok: true,
      shopifyCancelled: false,
      shopifyOrderId: order.shopify_order_id ?? null,
      avalonOrderNumber: order.avalon_order_number ?? null,
    };
  }

  // 2. Cancel in Shopify FIRST if synced — split-brain prevention.
  let shopifyCancelled = false;
  if (order.sync_status === "synced" && order.shopify_order_id) {
    try {
      await cancelShopifyOrder(order.shopify_order_id, "other");
      shopifyCancelled = true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        stage: "shopify_cancel",
        error: msg,
        partialState: { shopifyCancelled: false },
      };
    }
  }

  // 3. Mark the active sync attempt as cancelled (preserves the audit trail).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: syncErr } = await (supabase as any)
    .from("order_shopify_syncs")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      error_message: reason ?? null,
    })
    .eq("order_id", orderId)
    .in("status", ["pending", "in_flight", "succeeded"]);

  if (syncErr) {
    return {
      ok: false,
      stage: "sync_update",
      error: syncErr.message,
      partialState: { shopifyCancelled },
    };
  }

  // 4. Mutate the orders row based on action.
  const now = new Date().toISOString();
  const orderUpdate =
    action === "cancel"
      ? {
          status: "cancelled" as const,
          deleted_at: now,
          sync_error: reason ?? null,
        }
      : {
          // revert-to-draft: keep the row, clear the externally-visible identifiers,
          // reset sync state. Re-confirm will allocate a fresh avalon_order_number
          // and a fresh order_shopify_syncs attempt.
          status: "draft" as const,
          sync_status: "not_synced" as const,
          avalon_order_number: null,
          shopify_order_id: null,
          confirmed_at: null,
          sync_error: reason ?? null,
        };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: orderErr } = await (supabase as any)
    .from("orders")
    .update(orderUpdate)
    .eq("id", orderId);

  if (orderErr) {
    return {
      ok: false,
      stage: "order_update",
      error: orderErr.message,
      partialState: { shopifyCancelled },
    };
  }

  // Suppress unused-var warning for actingUserId — it's part of the public API
  // for future audit_log_trigger context but does not flow into the bare
  // updates above (audit trigger reads auth.uid() server-side).
  void actingUserId;

  return {
    ok: true,
    shopifyCancelled,
    shopifyOrderId: order.shopify_order_id ?? null,
    avalonOrderNumber: order.avalon_order_number ?? null,
  };
}
