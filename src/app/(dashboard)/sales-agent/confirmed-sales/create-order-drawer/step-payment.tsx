"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { AutoDiscountSnapshot, DrawerLineItem, DrawerVoucher } from "./types";
import { computeTotal } from "./types";

type Props = {
  customer: { shopify_customer_id: string | null } | null;
  items: DrawerLineItem[];
  voucher: DrawerVoucher | null;
  manualDiscount: number;
  manualDiscountReason: string | null;
  applyAutoDiscounts: boolean;
  autoDiscountPreview: AutoDiscountSnapshot | null;
  shippingFee: number;
  onSetVoucher: (v: DrawerVoucher | null) => void;
  onSetManualDiscount: (n: number) => void;
  onSetManualDiscountReason: (s: string | null) => void;
  onSetApplyAutoDiscounts: (b: boolean) => void;
  onSetAutoDiscountPreview: (s: AutoDiscountSnapshot | null) => void;
  onSetShippingFee: (n: number) => void;
};

type ShopifyVoucher = { id: number; code: string; price_rule_id: number };

export function StepPayment({
  customer,
  items,
  voucher,
  manualDiscount,
  manualDiscountReason,
  applyAutoDiscounts,
  autoDiscountPreview,
  shippingFee,
  onSetVoucher,
  onSetManualDiscount,
  onSetManualDiscountReason,
  onSetApplyAutoDiscounts,
  onSetAutoDiscountPreview,
  onSetShippingFee,
}: Props) {
  // ── Voucher search combobox ──────────────────────────────────────
  const [vouchers, setVouchers] = useState<ShopifyVoucher[]>([]);
  const [voucherError, setVoucherError] = useState<string | null>(null);
  const [voucherQuery, setVoucherQuery] = useState(voucher?.code ?? "");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/sales/vouchers")
      .then((r) => r.json())
      .then((j) => {
        setVouchers(j.vouchers ?? []);
        setVoucherError(j.error ?? null);
      });
  }, []);

  const filteredVouchers = useMemo(() => {
    const q = voucherQuery.toLowerCase();
    if (!q) return vouchers.slice(0, 8);
    return vouchers.filter((v) => v.code.toLowerCase().includes(q)).slice(0, 8);
  }, [vouchers, voucherQuery]);

  // ── Auto-discount preview (debounced) ────────────────────────────
  useEffect(() => {
    if (!applyAutoDiscounts || items.length === 0) {
      onSetAutoDiscountPreview(null);
      setPreviewLoading(false);
      setPreviewError(null);
      return;
    }
    setPreviewLoading(true);
    setPreviewError(null);
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/sales/orders/preview-discounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customer_shopify_id: customer?.shopify_customer_id ?? null,
            items: items.map((it) => ({
              shopify_variant_id: it.shopify_variant_id,
              quantity: it.quantity,
              product_name: it.product_name,
              unit_price_amount: it.unit_price_amount,
            })),
          }),
        });
        const j = await res.json();
        if (!res.ok) {
          setPreviewError(j.error ?? `Shopify failed (${res.status})`);
          onSetAutoDiscountPreview({ applied: [], applied_total: 0 });
        } else {
          onSetAutoDiscountPreview(j as AutoDiscountSnapshot);
        }
      } catch (err) {
        setPreviewError(err instanceof Error ? err.message : "Network error");
        onSetAutoDiscountPreview({ applied: [], applied_total: 0 });
      } finally {
        setPreviewLoading(false);
      }
    }, 500);
    return () => clearTimeout(t);
  }, [applyAutoDiscounts, items, customer?.shopify_customer_id, onSetAutoDiscountPreview]);

  // ── Manual discount reason expand ────────────────────────────────
  const [reasonExpanded, setReasonExpanded] = useState(!!manualDiscountReason);

  const totals = computeTotal({
    items,
    voucher,
    manualDiscount,
    shippingFee,
    autoDiscountTotal: autoDiscountPreview?.applied_total ?? 0,
  });

  return (
    <div className="space-y-4">
      {/* Voucher combobox */}
      <div>
        <label className="text-xs font-medium text-gray-700 block mb-1">Discount code</label>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={voucherQuery}
            onChange={(e) => setVoucherQuery(e.target.value)}
            placeholder="Search by code…"
            className="w-full pl-9 px-3 py-2 text-sm border border-gray-200 rounded-md"
          />
        </div>
        {voucherQuery && (
          <div className="mt-1 max-h-56 overflow-y-auto border border-gray-100 rounded-md">
            {filteredVouchers.length === 0 && (
              <div className="p-2 text-xs text-gray-400">No matching codes</div>
            )}
            {filteredVouchers.map((v) => (
              <button
                type="button"
                key={v.id}
                onClick={() => {
                  const amountStr = prompt(`Discount amount for "${v.code}" (₱):`);
                  const amt = parseFloat(amountStr ?? "0");
                  if (!isNaN(amt) && amt > 0) {
                    onSetVoucher({ code: v.code, amount: amt, type: "fixed_amount" });
                    setVoucherQuery(v.code);
                  }
                }}
                className="w-full text-left px-2 py-1.5 hover:bg-gray-50 text-xs"
              >
                {v.code}
              </button>
            ))}
          </div>
        )}
        {voucher && (
          <div className="mt-1 text-[11px] text-emerald-700">
            Applied: {voucher.code} — ₱{voucher.amount.toFixed(2)}
            <button
              type="button"
              onClick={() => {
                onSetVoucher(null);
                setVoucherQuery("");
              }}
              className="ml-2 text-rose-600"
            >
              remove
            </button>
          </div>
        )}
        {voucherError && (
          <div className="text-[11px] text-rose-600 mt-1">
            Couldn&apos;t load Shopify vouchers: {voucherError}
          </div>
        )}
      </div>

      {/* Auto-discount checkbox + preview */}
      <div>
        <label className="inline-flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={applyAutoDiscounts}
            onChange={(e) => onSetApplyAutoDiscounts(e.target.checked)}
          />
          Apply all eligible automatic discounts
        </label>
        {applyAutoDiscounts && (
          <>
            {previewLoading && (
              <div className="mt-2 text-[11px] text-gray-500">
                Checking for automatic discounts…
              </div>
            )}
            {!previewLoading && previewError && (
              <div className="mt-2 text-[11px] text-rose-600">
                Couldn&apos;t reach Shopify — {previewError}
              </div>
            )}
            {!previewLoading && !previewError && autoDiscountPreview && autoDiscountPreview.applied.length === 0 && items.length > 0 && (
              <div className="mt-2 text-[11px] text-gray-500">
                No eligible automatic discounts for this cart.
              </div>
            )}
            {!previewLoading && !previewError && autoDiscountPreview && autoDiscountPreview.applied.length > 0 && (
              <div className="mt-2 space-y-1">
                {autoDiscountPreview.applied.map((a, i) => (
                  <div key={i} className="border border-gray-200 rounded-md p-2 bg-gray-50">
                    <div className="text-xs">
                      <span className="font-semibold">{a.title}</span>
                      <span className="ml-2 text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                        {a.type}
                      </span>
                    </div>
                    <div className="text-[11px] text-gray-600 mt-0.5">{a.description}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Manual discount + reason */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-700 block mb-1">Manual discount (₱)</label>
          <input
            type="number"
            min={0}
            step="0.01"
            value={manualDiscount || ""}
            onChange={(e) => onSetManualDiscount(parseFloat(e.target.value) || 0)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md"
          />
          {manualDiscount > 0 && (
            <button
              type="button"
              onClick={() => setReasonExpanded((v) => !v)}
              className="mt-1 text-[11px] text-blue-600"
            >
              {reasonExpanded ? "▴ Hide reason" : "▾ See reason for discount"}
            </button>
          )}
          {manualDiscount > 0 && reasonExpanded && (
            <textarea
              value={manualDiscountReason ?? ""}
              onChange={(e) => onSetManualDiscountReason(e.target.value || null)}
              placeholder="Reason (visible to all downstream)…"
              className="w-full mt-1 px-3 py-2 text-xs border border-gray-200 rounded-md min-h-[60px]"
            />
          )}
        </div>
        <div>
          <label className="text-xs font-medium text-gray-700 block mb-1">Shipping fee (₱)</label>
          <input
            type="number"
            min={0}
            step="0.01"
            value={shippingFee || ""}
            onChange={(e) => onSetShippingFee(parseFloat(e.target.value) || 0)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md"
          />
        </div>
      </div>

      {/* Receipt preview */}
      <div className="border border-gray-200 rounded-md p-3 bg-gray-50">
        <div className="text-xs font-medium text-gray-700 mb-2">Receipt preview</div>
        <div className="space-y-1 text-sm">
          <Row label="Items" value={`₱${totals.subtotal.toFixed(2)}`} />
          {totals.voucherDiscount > 0 && (
            <Row
              label={`Voucher (${voucher?.code ?? ""})`}
              value={`-₱${totals.voucherDiscount.toFixed(2)}`}
              tone="discount"
            />
          )}
          {totals.autoDiscount > 0 && (
            <Row label="Auto-discount" value={`-₱${totals.autoDiscount.toFixed(2)}`} tone="discount" />
          )}
          {manualDiscount > 0 && (
            <Row label="Manual discount" value={`-₱${manualDiscount.toFixed(2)}`} tone="discount" />
          )}
          {shippingFee > 0 && <Row label="Shipping" value={`+₱${shippingFee.toFixed(2)}`} />}
          <div className="border-t border-gray-200 my-2" />
          <Row label="Final total" value={`₱${totals.total.toFixed(2)}`} tone="bold" />
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "discount" | "bold" }) {
  return (
    <div className="flex justify-between">
      <span className={tone === "bold" ? "font-semibold" : "text-gray-600"}>{label}</span>
      <span
        className={
          tone === "discount"
            ? "text-rose-600"
            : tone === "bold"
              ? "font-semibold"
              : "tabular-nums"
        }
      >
        {value}
      </span>
    </div>
  );
}
