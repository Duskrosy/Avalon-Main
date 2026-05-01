"use client";

import { Paperclip } from "lucide-react";

type SalesPayment = {
  payment_receipt_path: string | null;
  payment_reference_number: string | null;
  payment_transaction_at: string | null;
  notes: string | null;
};

type Props = {
  payment: SalesPayment;
  orderId: string;
};

export function SalesPaymentBlock({ payment, orderId }: Props) {
  const previewReceipt = async () => {
    const res = await fetch(`/api/sales/orders/${orderId}/receipt-signed-url`);
    if (!res.ok) return;
    const j = await res.json();
    if (j.url) window.open(j.url, "_blank");
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-[var(--color-text-tertiary)] w-20 shrink-0">Ref #</span>
        <span className="text-sm">{payment.payment_reference_number ?? "—"}</span>
      </div>
      {payment.payment_transaction_at && (
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[var(--color-text-tertiary)] w-20 shrink-0">Paid at</span>
          <span className="text-sm">
            {new Date(payment.payment_transaction_at).toLocaleString()}
          </span>
        </div>
      )}
      {payment.payment_receipt_path && (
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[var(--color-text-tertiary)] w-20 shrink-0">Receipt</span>
          <button
            type="button"
            onClick={() => void previewReceipt()}
            className="inline-flex items-center gap-1 text-xs text-[var(--color-accent)] hover:opacity-80"
          >
            <Paperclip size={12} /> View receipt
          </button>
        </div>
      )}
      {payment.notes && (
        <div className="flex items-start gap-2">
          <span className="text-[11px] text-[var(--color-text-tertiary)] w-20 shrink-0 pt-0.5">
            Notes
          </span>
          <span className="text-sm text-[var(--color-text-secondary)] italic">{payment.notes}</span>
        </div>
      )}
    </div>
  );
}
