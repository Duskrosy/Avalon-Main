/**
 * Shared types for the Create Order drawer (Phase 1).
 */

export type CustomerLite = {
  id: string;
  shopify_customer_id: string | null;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  full_address?: string | null;
  total_orders_cached?: number | null;
  // Address fields (Phase 1.5+) — present so the Customer step can
  // pre-fill its form when the agent picks an existing customer.
  address_line_1?: string | null;
  address_line_2?: string | null;
  city_text?: string | null;
  region_text?: string | null;
  postal_code?: string | null;
  region_code?: string | null;
  city_code?: string | null;
  barangay_code?: string | null;
};

export type DrawerLineItem = {
  product_variant_id: string | null;
  shopify_product_id: string | null;
  shopify_variant_id: string | null;
  product_name: string;
  variant_name: string | null;
  size: string | null;
  color: string | null;
  quantity: number;
  unit_price_amount: number;
  adjusted_unit_price_amount: number | null;
  line_total_amount: number;
  /** UI-only: original variant search response so we can show stock badges */
  available_stock?: number;
};

export type DrawerVoucher = {
  code: string;
  amount: number;
  type: "percentage" | "fixed_amount";
};

export type DrawerHandoff = {
  mode_of_payment: string | null;
  person_in_charge_type: "user" | "custom" | "lalamove" | null;
  person_in_charge_user_id: string | null;
  person_in_charge_label: string | null;
  notes: string | null;
};

export type DrawerCompletion = {
  net_value_amount: number | null;
  is_abandoned_cart: boolean | null;
  ad_campaign_source: string | null;
  alex_ai_assist: boolean | null;
  delivery_status: string | null;
};

export type DrawerState = {
  orderId: string | null;
  step: 1 | 2 | 3 | 4;
  customer: CustomerLite | null;
  items: DrawerLineItem[];
  voucher: DrawerVoucher | null;
  manualDiscount: number;
  shippingFee: number;
  handoff: DrawerHandoff;
  completion: DrawerCompletion;
};

export const EMPTY_HANDOFF: DrawerHandoff = {
  mode_of_payment: null,
  person_in_charge_type: null,
  person_in_charge_user_id: null,
  person_in_charge_label: null,
  notes: null,
};

export const EMPTY_COMPLETION: DrawerCompletion = {
  net_value_amount: null,
  is_abandoned_cart: null,
  ad_campaign_source: null,
  alex_ai_assist: null,
  delivery_status: null,
};

export function computeSubtotal(items: DrawerLineItem[]): number {
  return items.reduce((sum, it) => sum + it.line_total_amount, 0);
}

export function computeTotal(state: {
  items: DrawerLineItem[];
  voucher: DrawerVoucher | null;
  manualDiscount: number;
  shippingFee: number;
}): { subtotal: number; voucherDiscount: number; total: number } {
  const subtotal = computeSubtotal(state.items);
  const voucherDiscount = state.voucher
    ? state.voucher.type === "percentage"
      ? subtotal * (state.voucher.amount / 100)
      : state.voucher.amount
    : 0;
  const total = Math.max(
    0,
    subtotal - voucherDiscount - state.manualDiscount + state.shippingFee,
  );
  return { subtotal, voucherDiscount, total };
}
