"use client";

import { useCallback, useState } from "react";
import {
  type CustomerLite,
  type DrawerCompletion,
  type DrawerHandoff,
  type DrawerLineItem,
  type DrawerState,
  type DrawerVoucher,
  EMPTY_COMPLETION,
  EMPTY_HANDOFF,
  computeTotal,
} from "./types";

const INITIAL_STATE: DrawerState = {
  orderId: null,
  step: 1,
  customer: null,
  items: [],
  voucher: null,
  manualDiscount: 0,
  shippingFee: 0,
  handoff: EMPTY_HANDOFF,
  completion: EMPTY_COMPLETION,
};

export type SubmitResult =
  | { ok: true; orderId: string; pending: boolean; shopifyOrderId: string | null; avalonOrderNumber: string | null }
  | { ok: false; error: string };

export type SaveDraftResult =
  | { ok: true; orderId: string }
  | { ok: false; error: string };

export function useCreateOrder() {
  const [state, setState] = useState<DrawerState>(INITIAL_STATE);
  const [submitting, setSubmitting] = useState(false);

  const setCustomer = useCallback((customer: CustomerLite | null) => {
    setState((s) => ({ ...s, customer }));
  }, []);

  const setItems = useCallback((items: DrawerLineItem[]) => {
    setState((s) => ({ ...s, items }));
  }, []);

  const addItem = useCallback((item: DrawerLineItem) => {
    setState((s) => {
      // Auto-merge same variant
      const idx = s.items.findIndex(
        (it) =>
          it.product_variant_id === item.product_variant_id &&
          (item.product_variant_id !== null || it.product_name === item.product_name),
      );
      if (idx >= 0) {
        const merged = [...s.items];
        const existing = merged[idx];
        const newQty = existing.quantity + item.quantity;
        const unit =
          existing.adjusted_unit_price_amount ?? existing.unit_price_amount;
        merged[idx] = {
          ...existing,
          quantity: newQty,
          line_total_amount: unit * newQty,
        };
        return { ...s, items: merged };
      }
      return { ...s, items: [...s.items, item] };
    });
  }, []);

  const removeItem = useCallback((idx: number) => {
    setState((s) => ({ ...s, items: s.items.filter((_, i) => i !== idx) }));
  }, []);

  const updateItemQty = useCallback((idx: number, qty: number) => {
    setState((s) => {
      const items = [...s.items];
      const item = items[idx];
      if (!item) return s;
      const unit = item.adjusted_unit_price_amount ?? item.unit_price_amount;
      items[idx] = { ...item, quantity: qty, line_total_amount: unit * qty };
      return { ...s, items };
    });
  }, []);

  const splitBundleEvenly = useCallback(() => {
    setState((s) => {
      const subtotal = s.items.reduce(
        (sum, it) => sum + it.unit_price_amount * it.quantity,
        0,
      );
      const totalUnits = s.items.reduce((sum, it) => sum + it.quantity, 0);
      if (totalUnits === 0 || s.items.length < 2) return s;
      const splitPrice = Math.round((subtotal / totalUnits) * 100) / 100;
      const items = s.items.map((it) => ({
        ...it,
        adjusted_unit_price_amount: splitPrice,
        line_total_amount: splitPrice * it.quantity,
      }));
      return { ...s, items };
    });
  }, []);

  const setVoucher = useCallback((voucher: DrawerVoucher | null) => {
    setState((s) => ({ ...s, voucher }));
  }, []);

  const setHandoff = useCallback((patch: Partial<DrawerHandoff>) => {
    setState((s) => ({ ...s, handoff: { ...s.handoff, ...patch } }));
  }, []);

  const setCompletion = useCallback((patch: Partial<DrawerCompletion>) => {
    setState((s) => ({ ...s, completion: { ...s.completion, ...patch } }));
  }, []);

  const setStep = useCallback((step: 1 | 2 | 3 | 4) => {
    setState((s) => ({ ...s, step }));
  }, []);

  const setManualDiscount = useCallback((amt: number) => {
    setState((s) => ({ ...s, manualDiscount: amt }));
  }, []);

  const setShippingFee = useCallback((amt: number) => {
    setState((s) => ({ ...s, shippingFee: amt }));
  }, []);

  const buildPayload = useCallback(() => {
    const totals = computeTotal({
      items: state.items,
      voucher: state.voucher,
      manualDiscount: state.manualDiscount,
      shippingFee: state.shippingFee,
    });
    return {
      customer_id: state.customer!.id,
      subtotal_amount: totals.subtotal,
      voucher_code: state.voucher?.code ?? null,
      voucher_discount_amount: totals.voucherDiscount,
      manual_discount_amount: state.manualDiscount,
      shipping_fee_amount: state.shippingFee,
      final_total_amount: totals.total,
      mode_of_payment: state.handoff.mode_of_payment,
      person_in_charge_type: state.handoff.person_in_charge_type,
      person_in_charge_user_id: state.handoff.person_in_charge_user_id,
      person_in_charge_label: state.handoff.person_in_charge_label,
      route_type:
        state.handoff.person_in_charge_label?.toLowerCase() === "lalamove"
          ? "tnvs"
          : "normal",
      notes: state.handoff.notes,
      net_value_amount: state.completion.net_value_amount,
      is_abandoned_cart: state.completion.is_abandoned_cart,
      ad_campaign_source: state.completion.ad_campaign_source,
      alex_ai_assist: state.completion.alex_ai_assist,
      delivery_status: state.completion.delivery_status,
      items: state.items.map((it) => ({
        product_variant_id: it.product_variant_id,
        shopify_product_id: it.shopify_product_id,
        shopify_variant_id: it.shopify_variant_id,
        product_name: it.product_name,
        variant_name: it.variant_name,
        size: it.size,
        color: it.color,
        quantity: it.quantity,
        unit_price_amount: it.unit_price_amount,
        adjusted_unit_price_amount: it.adjusted_unit_price_amount,
        line_total_amount: it.line_total_amount,
      })),
    };
  }, [state]);

  const saveDraft = useCallback(async (): Promise<SaveDraftResult> => {
    if (!state.customer) return { ok: false, error: "Customer required" };
    if (state.items.length === 0) return { ok: false, error: "At least one item required" };
    setSubmitting(true);
    try {
      const payload = buildPayload();
      const url = state.orderId ? `/api/sales/orders/${state.orderId}` : "/api/sales/orders";
      const method = state.orderId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) return { ok: false, error: json.error ?? "Save failed" };
      const orderId = json.order?.id ?? state.orderId;
      setState((s) => ({ ...s, orderId }));
      return { ok: true, orderId };
    } finally {
      setSubmitting(false);
    }
  }, [buildPayload, state.customer, state.items.length, state.orderId]);

  const confirm = useCallback(async (): Promise<SubmitResult> => {
    const draft = await saveDraft();
    if (!draft.ok) return draft;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/sales/orders/${draft.orderId}/confirm`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok && res.status !== 202) {
        return { ok: false, error: json.error ?? "Confirm failed" };
      }
      return {
        ok: true,
        orderId: draft.orderId,
        pending: !!json.pending,
        shopifyOrderId: json.shopify_order_id ?? null,
        avalonOrderNumber: json.avalon_order_number ?? null,
      };
    } finally {
      setSubmitting(false);
    }
  }, [saveDraft]);

  const reset = useCallback(() => setState(INITIAL_STATE), []);

  return {
    state,
    submitting,
    totals: computeTotal({
      items: state.items,
      voucher: state.voucher,
      manualDiscount: state.manualDiscount,
      shippingFee: state.shippingFee,
    }),
    setStep,
    setCustomer,
    setItems,
    addItem,
    removeItem,
    updateItemQty,
    splitBundleEvenly,
    setVoucher,
    setManualDiscount,
    setShippingFee,
    setHandoff,
    setCompletion,
    saveDraft,
    confirm,
    reset,
  };
}
