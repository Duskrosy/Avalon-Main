"use client";

import { SalesPaymentBlock } from "./sales-payment-block";
import { ConversionPaymentBlock } from "./conversion-payment-block";

type ShopifyAdminPayment =
  | {
      payment_receipt_path: string | null;
      payment_reference_number: string | null;
      payment_transaction_at: string | null;
      notes: string | null;
    }
  | {
      shopify_card_last4: string | null;
      shopify_gateway: string | null;
      shopify_transaction_id: string | null;
      shopify_transaction_at: string | null;
    };

type Props = {
  payment: ShopifyAdminPayment;
  shopifyFinancialStatus: string | null;
  orderId: string;
};

function isSalesStyle(
  p: ShopifyAdminPayment,
): p is {
  payment_receipt_path: string | null;
  payment_reference_number: string | null;
  payment_transaction_at: string | null;
  notes: string | null;
} {
  return "payment_reference_number" in p;
}

export function ShopifyAdminPaymentBlock({ payment, shopifyFinancialStatus, orderId }: Props) {
  return (
    <div className="space-y-1.5">
      <div className="mb-1.5">
        <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)]">
          Shopify Admin order
        </span>
        {shopifyFinancialStatus && (
          <span className="ml-2 text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-[var(--color-warning-light)] text-[var(--color-warning)]">
            {shopifyFinancialStatus}
          </span>
        )}
      </div>
      {isSalesStyle(payment) ? (
        <SalesPaymentBlock payment={payment} orderId={orderId} />
      ) : (
        <ConversionPaymentBlock payment={payment} />
      )}
    </div>
  );
}
