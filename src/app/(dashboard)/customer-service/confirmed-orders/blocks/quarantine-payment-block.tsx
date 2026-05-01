"use client";

import { AlertTriangle } from "lucide-react";

type Props = {
  adminUrl: string;
};

export function QuarantinePaymentBlock({ adminUrl }: Props) {
  return (
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
  );
}
