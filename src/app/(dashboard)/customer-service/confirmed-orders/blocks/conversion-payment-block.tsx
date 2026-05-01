"use client";

type ConversionPayment = {
  shopify_card_last4: string | null;
  shopify_gateway: string | null;
  shopify_transaction_id: string | null;
  shopify_transaction_at: string | null;
};

type Props = {
  payment: ConversionPayment;
};

export function ConversionPaymentBlock({ payment }: Props) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-[var(--color-text-tertiary)] w-20 shrink-0">Gateway</span>
        <span className="text-sm">{payment.shopify_gateway ?? "—"}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-[var(--color-text-tertiary)] w-20 shrink-0">Card</span>
        <span className="text-sm">
          {payment.shopify_card_last4 ? `••••${payment.shopify_card_last4}` : "—"}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-[var(--color-text-tertiary)] w-20 shrink-0">Txn ID</span>
        <span className="text-sm font-mono text-xs truncate">
          {payment.shopify_transaction_id ?? "—"}
        </span>
      </div>
      {payment.shopify_transaction_at && (
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[var(--color-text-tertiary)] w-20 shrink-0">Paid at</span>
          <span className="text-sm">
            {new Date(payment.shopify_transaction_at).toLocaleString()}
          </span>
        </div>
      )}
    </div>
  );
}
