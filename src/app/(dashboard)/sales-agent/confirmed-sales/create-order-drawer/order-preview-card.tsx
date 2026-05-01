"use client";

import { Edit3 } from "lucide-react";
import type {
  CustomerLite,
  DrawerLineItem,
  DrawerVoucher,
  AutoDiscountSnapshot,
} from "./types";
import { computeTotal } from "./types";

type Props = {
  customer: CustomerLite | null;
  items: DrawerLineItem[];
  voucher: DrawerVoucher | null;
  manualDiscount: number;
  manualDiscountReason: string | null;
  applyAutoDiscounts: boolean;
  autoDiscountPreview: AutoDiscountSnapshot | null;
  shippingFee: number;
  onJumpToStep: (step: 1 | 2 | 3) => void;
};

export function OrderPreviewCard({
  customer,
  items,
  voucher,
  manualDiscount,
  manualDiscountReason,
  applyAutoDiscounts,
  autoDiscountPreview,
  shippingFee,
  onJumpToStep,
}: Props) {
  const totals = computeTotal({
    items,
    voucher,
    manualDiscount,
    shippingFee,
    autoDiscountTotal: autoDiscountPreview?.applied_total ?? 0,
  });
  const hasDiscounts =
    (voucher && totals.voucherDiscount > 0) ||
    (applyAutoDiscounts && autoDiscountPreview && autoDiscountPreview.applied.length > 0) ||
    manualDiscount > 0;

  return (
    <div className="border border-[var(--color-border-primary)] rounded-md bg-[var(--color-surface-card)] text-xs">
      <div className="px-3 py-2 border-b border-[var(--color-border-secondary)] flex items-center justify-between">
        <span className="font-semibold text-[var(--color-text-primary)]">Order preview</span>
      </div>

      {customer && (
        <Section title="Customer" onEdit={() => onJumpToStep(1)}>
          <div>
            {customer.full_name} · {customer.phone ?? ""}
          </div>
          {customer.full_address && (
            <div className="text-[var(--color-text-secondary)] mt-0.5">{customer.full_address}</div>
          )}
        </Section>
      )}

      {items.length > 0 && (
        <Section title="Items" onEdit={() => onJumpToStep(2)}>
          {items.map((it, idx) => (
            <div key={idx} className="flex justify-between">
              <span>
                {it.quantity}× {it.product_name}
                {it.variant_name ? ` / ${it.variant_name}` : ""}
              </span>
              <span className="tabular-nums">₱{it.line_total_amount.toFixed(2)}</span>
            </div>
          ))}
        </Section>
      )}

      {hasDiscounts && (
        <Section title="Discounts" onEdit={() => onJumpToStep(3)}>
          {voucher && totals.voucherDiscount > 0 && (
            <div className="flex justify-between">
              <span>Voucher ({voucher.code})</span>
              <span className="text-[var(--color-error)] tabular-nums">
                -₱{totals.voucherDiscount.toFixed(2)}
              </span>
            </div>
          )}
          {applyAutoDiscounts &&
            autoDiscountPreview &&
            autoDiscountPreview.applied.map((a, i) => (
              <div key={i} className="flex justify-between">
                <span>Auto: {a.title}</span>
                <span className="text-[var(--color-error)] tabular-nums">-₱{a.amount.toFixed(2)}</span>
              </div>
            ))}
          {manualDiscount > 0 && (
            <>
              <div className="flex justify-between">
                <span>Manual</span>
                <span className="text-[var(--color-error)] tabular-nums">
                  -₱{manualDiscount.toFixed(2)}
                </span>
              </div>
              {manualDiscountReason && (
                <div className="text-[11px] text-[var(--color-text-secondary)] ml-2">
                  reason: {manualDiscountReason}
                </div>
              )}
            </>
          )}
        </Section>
      )}

      {shippingFee > 0 && (
        <Section title="Shipping" onEdit={() => onJumpToStep(3)}>
          <div className="flex justify-between">
            <span>Shipping</span>
            <span className="tabular-nums">+₱{shippingFee.toFixed(2)}</span>
          </div>
        </Section>
      )}

      <div className="px-3 py-2 border-t border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] flex justify-between">
        <span className="font-semibold">Total</span>
        <span className="font-semibold tabular-nums">₱{totals.total.toFixed(2)}</span>
      </div>
    </div>
  );
}

function Section({
  title,
  onEdit,
  children,
}: {
  title: string;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="px-3 py-2 border-b border-[var(--color-border-secondary)] last:border-b-0">
      <div className="flex items-center justify-between mb-1">
        <span className="font-medium text-[var(--color-text-primary)]">{title}</span>
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit ${title}`}
          className="text-[var(--color-accent)]"
        >
          <Edit3 size={11} />
        </button>
      </div>
      {children}
    </div>
  );
}
