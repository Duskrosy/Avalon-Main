// src/lib/cs/edit-plan/compute-analysis.ts
//
// Server-side computation of price_delta, payment_implication, and
// proposed_path for a cs_edit_plan.
//
// NOTE on proposed_path:
//   Phase A always defaults to 'order_edit' (the lowest-cost path).
//   The full heuristic table (based on financial status, price delta,
//   order age, and intake lane) will land in Phase B's separate file
//   alongside the Shopify orderEdit integration.

import type {
  EditPlanItem,
  EditPath,
  IntakeLane,
  PaymentImplication,
} from './types';
import type { AddItemPayload, QtyChangePayload, RemoveItemPayload } from './op-shapes';

// ─── Input shapes ─────────────────────────────────────────────────────────────

export interface CurrentOrder {
  /** Maps to orders.final_total_amount */
  total_amount: number;
  intake_lane: IntakeLane;
  shopify_financial_status?: string | null;
}

export interface CurrentOrderItem {
  /** order_items.id (as string — Supabase returns bigint as string or number) */
  id: string | number;
  /** order_items.unit_price_amount */
  unit_price_amount: number;
  /** order_items.quantity */
  quantity: number;
  /** order_items.line_total_amount */
  line_total_amount: number;
}

// ─── Output shape ─────────────────────────────────────────────────────────────

export interface PlanAnalysis {
  /** Signed delta. Positive = customer owes more. Negative = refund due. */
  price_delta: number;
  payment_implication: PaymentImplication;
  /** Phase A: always 'order_edit'. Full heuristic lands in Phase B. */
  proposed_path: EditPath;
}

// ─── Main function ────────────────────────────────────────────────────────────

/**
 * Derives the financial impact and suggested edit path for a set of plan items.
 *
 * price_delta contributions per op:
 *   add_item          → +qty * unit_price
 *   remove_item       → -(line_total_amount of the referenced order_items row)
 *   qty_change        → (new_qty - current_qty) * unit_price_amount
 *                       new_qty = 0 is treated identically to remove_item
 *   address_shipping  → 0
 *   address_billing   → 0
 *   note              → 0
 *
 * Unrecognised line_item_id references are treated as 0-delta (safe degradation).
 */
export function computePlanAnalysis(
  _currentOrder: CurrentOrder,
  items: EditPlanItem[],
  currentOrderItems: CurrentOrderItem[],
): PlanAnalysis {
  // Build a quick lookup by id (handle both string and number ids from Supabase).
  const itemById = new Map<string, CurrentOrderItem>();
  for (const oi of currentOrderItems) {
    itemById.set(String(oi.id), oi);
  }

  let price_delta = 0;

  for (const item of items) {
    switch (item.op) {
      case 'add_item': {
        const p = item.payload as AddItemPayload;
        price_delta += p.qty * p.unit_price;
        break;
      }

      case 'remove_item': {
        const p = item.payload as RemoveItemPayload;
        const existing = itemById.get(String(p.line_item_id));
        if (existing) {
          price_delta -= existing.line_total_amount;
        }
        break;
      }

      case 'qty_change': {
        const p = item.payload as QtyChangePayload;
        const existing = itemById.get(String(p.line_item_id));
        if (existing) {
          if (p.new_qty === 0) {
            // qty_change to 0 == remove_item
            price_delta -= existing.line_total_amount;
          } else {
            const qtyDelta = p.new_qty - existing.quantity;
            price_delta += qtyDelta * existing.unit_price_amount;
          }
        }
        break;
      }

      // address_shipping, address_billing, note — no price impact
      case 'address_shipping':
      case 'address_billing':
      case 'note':
        break;
    }
  }

  const payment_implication: PaymentImplication =
    price_delta > 0
      ? 'additional_charge'
      : price_delta < 0
        ? 'refund_due'
        : 'no_change';

  // Phase A: always suggest order_edit.
  // Phase B will implement the full heuristic table:
  //   large refund + shopify_financial_status=paid → 'cancel_relink'
  //   additional_charge on conversion lane → 'child_order'
  //   etc.
  const proposed_path: EditPath = 'order_edit';

  return { price_delta, payment_implication, proposed_path };
}
