"use client";

import { AlertTriangle } from "lucide-react";

type Props = {
  adminUrl: string;
  /** orders.mode_of_payment */
  mop?: string | null;
  /** orders.payment_other_label */
  paymentOtherLabel?: string | null;
};

export function QuarantinePaymentBlock({ adminUrl, mop, paymentOtherLabel }: Props) {
  const mopLabel = mop === "Other" && paymentOtherLabel ? paymentOtherLabel : (mop ?? null);

  return (
    <div className="space-y-1.5">
      {mopLabel && (
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[var(--color-text-tertiary)] w-20 shrink-0">Method</span>
          <span className="text-sm font-medium">{mopLabel}</span>
        </div>
      )}
      <div className="flex items-start gap-2 px-3 py-2 rounded bg-[var(--color-error-light)] text-[var(--color-error)] border border-[var(--color-error-light)]">
        <AlertTriangle size={14} className="shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="text-xs font-medium">This order is in quarantine.</div>
          <div className="text-[11px] text-[var(--color-text-secondary)]">
            Payment details are not available until the order is reviewed and released.
          </div>
          <a
            href={adminUrl}
            className="inline-block mt-1 text-xs text-[var(--color-accent)] hover:opacity-80 underline"
          >
            Open in quarantine admin →
          </a>
        </div>
      </div>
    </div>
  );
}
