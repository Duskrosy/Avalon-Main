"use client";

import { useEffect, useState } from "react";
import type { DrawerLineItem, DrawerVoucher } from "./types";
import { computeTotal } from "./types";

type Props = {
  items: DrawerLineItem[];
  voucher: DrawerVoucher | null;
  manualDiscount: number;
  shippingFee: number;
  onSetVoucher: (v: DrawerVoucher | null) => void;
  onSetManualDiscount: (n: number) => void;
  onSetShippingFee: (n: number) => void;
};

type ShopifyVoucher = {
  id: number;
  code: string;
  price_rule_id: number;
};

export function StepPayment({
  items,
  voucher,
  manualDiscount,
  shippingFee,
  onSetVoucher,
  onSetManualDiscount,
  onSetShippingFee,
}: Props) {
  const [vouchers, setVouchers] = useState<ShopifyVoucher[]>([]);
  const [loadingVouchers, setLoadingVouchers] = useState(false);
  const [voucherError, setVoucherError] = useState<string | null>(null);

  useEffect(() => {
    setLoadingVouchers(true);
    fetch("/api/sales/vouchers")
      .then((r) => r.json())
      .then((j) => {
        setVouchers(j.vouchers ?? []);
        setVoucherError(j.error ?? null);
      })
      .finally(() => setLoadingVouchers(false));
  }, []);

  const totals = computeTotal({ items, voucher, manualDiscount, shippingFee });

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-medium text-gray-700 block mb-1">
          Voucher
        </label>
        <select
          value={voucher?.code ?? ""}
          onChange={(e) => {
            if (!e.target.value) {
              onSetVoucher(null);
              return;
            }
            // Phase 1: voucher amount is captured manually since Shopify
            // doesn't return discount amounts in the codes list. Phase 2/3
            // can join price_rule.value to auto-fill.
            const amountStr = prompt(
              `Discount amount for "${e.target.value}" (₱):`,
            );
            const amt = parseFloat(amountStr ?? "0");
            if (!isNaN(amt) && amt > 0) {
              onSetVoucher({ code: e.target.value, amount: amt, type: "fixed_amount" });
            }
          }}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md"
        >
          <option value="">— No voucher —</option>
          {vouchers.map((v) => (
            <option key={v.id} value={v.code}>
              {v.code}
            </option>
          ))}
        </select>
        {loadingVouchers && (
          <div className="text-[11px] text-gray-400 mt-1">Loading vouchers…</div>
        )}
        {voucherError && (
          <div className="text-[11px] text-rose-600 mt-1">
            Couldn&apos;t load Shopify vouchers: {voucherError}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-700 block mb-1">
            Manual discount (₱)
          </label>
          <input
            type="number"
            min={0}
            step="0.01"
            value={manualDiscount || ""}
            onChange={(e) => onSetManualDiscount(parseFloat(e.target.value) || 0)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-700 block mb-1">
            Shipping fee (₱)
          </label>
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
          {manualDiscount > 0 && (
            <Row label="Manual discount" value={`-₱${manualDiscount.toFixed(2)}`} tone="discount" />
          )}
          {shippingFee > 0 && (
            <Row label="Shipping" value={`+₱${shippingFee.toFixed(2)}`} />
          )}
          <div className="border-t border-gray-200 my-2" />
          <Row
            label="Final total"
            value={`₱${totals.total.toFixed(2)}`}
            tone="bold"
          />
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "discount" | "bold";
}) {
  return (
    <div className="flex justify-between">
      <span className={tone === "bold" ? "font-semibold" : "text-gray-600"}>
        {label}
      </span>
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
