"use client";

import { useEffect, useState } from "react";
import { X, Check } from "lucide-react";
import { useCreateOrder } from "./use-create-order";
import { StepCustomer } from "./step-customer";
import { StepItems } from "./step-items";
import { StepPayment } from "./step-payment";
import { StepHandoff } from "./step-handoff";

const STEP_LABELS = ["Customer", "Items", "Payment", "Handoff"] as const;

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirmed: (orderId: string) => void;
  /** When set, the drawer hydrates from this draft order instead of starting
   * blank. Picking up an existing draft from the order list. */
  editingOrderId?: string | null;
};

export function CreateOrderDrawer({
  open,
  onClose,
  onConfirmed,
  editingOrderId,
}: Props) {
  const drawer = useCreateOrder();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [addLater, setAddLater] = useState(false);

  useEffect(() => {
    if (!open) {
      drawer.reset();
      setError(null);
      return;
    }
    if (editingOrderId) {
      setLoading(true);
      drawer
        .loadDraft(editingOrderId)
        .then((r) => {
          if (!r.ok) setError(r.error ?? "Failed to load draft");
        })
        .finally(() => setLoading(false));
    }
    // intentional: only re-run when open flips or editingOrderId changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingOrderId]);

  if (!open) return null;

  const canAdvance = (() => {
    switch (drawer.state.step) {
      case 1:
        return !!drawer.state.customer;
      case 2:
        return drawer.state.items.length > 0;
      case 3:
        return drawer.totals.total >= 0;
      case 4: {
        const handoff = drawer.state.handoff;
        const isDigitalMop = handoff.mode_of_payment != null
          && ["GCash", "Credit Card", "Bank Transfer", "QR PH"].includes(handoff.mode_of_payment);
        const isOtherMop = handoff.mode_of_payment === "Other";

        // addLater relaxes ALL three: receipt, ref, transaction-at.
        const txnRequired = !addLater && (isDigitalMop || isOtherMop);
        const refRequired = !addLater && isDigitalMop;
        const receiptRequired = !addLater && isDigitalMop; // Other = optional

        return !!handoff.mode_of_payment
          && !!handoff.delivery_method
          && (!txnRequired || !!handoff.payment_transaction_at)
          && (!refRequired || !!handoff.payment_reference_number)
          && (!receiptRequired || !!handoff.payment_receipt_path);
      }
      default:
        return false;
    }
  })();

  const onContinue = () => {
    if (drawer.state.step < 4) {
      drawer.setStep((drawer.state.step + 1) as 1 | 2 | 3 | 4);
    }
  };

  const onSaveDraft = async () => {
    setError(null);
    const result = await drawer.saveDraft();
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onClose();
  };

  // For receipt upload: materialize an orderId on demand without closing the
  // drawer. ReceiptBlock calls this when the user attaches a file before
  // they've manually saved a draft.
  const onEnsureOrderId = async (): Promise<string | null> => {
    if (drawer.state.orderId) return drawer.state.orderId;
    setError(null);
    const result = await drawer.saveDraft();
    if (!result.ok) {
      setError(result.error);
      return null;
    }
    return result.orderId;
  };

  const onConfirm = async () => {
    setError(null);
    const result = await drawer.confirm();
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onConfirmed(result.orderId);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-40 flex"
      role="dialog"
      aria-modal="true"
      aria-label="Create order"
    >
      <div className="flex-1 bg-black/30 backdrop-blur-[1px]" onClick={onClose} />
      <div className="w-full max-w-xl h-full bg-[var(--color-surface-card)] shadow-2xl flex flex-col">
        <header className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-border-primary)]">
          <div>
            <div className="text-base font-semibold">
              {editingOrderId ? "Resume Draft" : "Create Order"}
            </div>
            <div className="text-xs text-[var(--color-text-secondary)]">
              Step {drawer.state.step} of 4 · {STEP_LABELS[drawer.state.step - 1]}
              {loading && " · Loading…"}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </header>

        <nav className="flex border-b border-[var(--color-border-secondary)] px-5 py-2 gap-1 text-[11px] uppercase tracking-wider">
          {STEP_LABELS.map((label, i) => {
            const stepNum = (i + 1) as 1 | 2 | 3 | 4;
            const isCurrent = drawer.state.step === stepNum;
            const isPast = drawer.state.step > stepNum;
            return (
              <button
                key={label}
                type="button"
                onClick={() => isPast && drawer.setStep(stepNum)}
                disabled={!isPast && !isCurrent}
                className={`flex items-center gap-1 px-2 py-1 rounded ${
                  isCurrent
                    ? "bg-[var(--color-accent-light)] text-[var(--color-accent-hover)]"
                    : isPast
                      ? "text-[var(--color-success-text)] hover:bg-[var(--color-success-light)]"
                      : "text-[var(--color-text-tertiary)]"
                }`}
              >
                {isPast && <Check size={11} />}
                <span>
                  {i + 1}. {label}
                </span>
              </button>
            );
          })}
        </nav>

        <main className="flex-1 overflow-y-auto p-5">
          {drawer.state.step === 1 && (
            <StepCustomer selected={drawer.state.customer} onSelect={drawer.setCustomer} />
          )}
          {drawer.state.step === 2 && (
            <StepItems
              items={drawer.state.items}
              onAdd={drawer.addItem}
              onRemove={drawer.removeItem}
              onUpdateQty={drawer.updateItemQty}
              onSplitBundle={drawer.splitBundleEvenly}
            />
          )}
          {drawer.state.step === 3 && (
            <StepPayment
              customer={drawer.state.customer}
              items={drawer.state.items}
              voucher={drawer.state.voucher}
              manualDiscount={drawer.state.manualDiscount}
              manualDiscountReason={drawer.state.manualDiscountReason}
              applyAutoDiscounts={drawer.state.applyAutoDiscounts}
              autoDiscountPreview={drawer.state.autoDiscountPreview}
              shippingFee={drawer.state.shippingFee}
              onSetVoucher={drawer.setVoucher}
              onSetManualDiscount={drawer.setManualDiscount}
              onSetManualDiscountReason={drawer.setManualDiscountReason}
              onSetApplyAutoDiscounts={drawer.setApplyAutoDiscounts}
              onSetAutoDiscountPreview={drawer.setAutoDiscountPreview}
              onSetShippingFee={drawer.setShippingFee}
            />
          )}
          {drawer.state.step === 4 && (
            <StepHandoff
              orderId={drawer.state.orderId}
              onEnsureOrderId={onEnsureOrderId}
              handoff={drawer.state.handoff}
              onSetHandoff={drawer.setHandoff}
              customer={drawer.state.customer}
              items={drawer.state.items}
              voucher={drawer.state.voucher}
              manualDiscount={drawer.state.manualDiscount}
              manualDiscountReason={drawer.state.manualDiscountReason}
              applyAutoDiscounts={drawer.state.applyAutoDiscounts}
              autoDiscountPreview={drawer.state.autoDiscountPreview}
              shippingFee={drawer.state.shippingFee}
              onJumpToStep={(s) => drawer.setStep(s)}
              addLater={addLater}
              onSetAddLater={setAddLater}
            />
          )}
        </main>

        {error && (
          <div className="px-5 pb-2 text-xs text-[var(--color-error-text)] bg-[var(--color-error-light)] border-t border-[var(--color-error)]/30 py-2">
            {error}
          </div>
        )}

        <footer className="border-t border-[var(--color-border-primary)] px-5 py-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() =>
              drawer.state.step > 1 &&
              drawer.setStep((drawer.state.step - 1) as 1 | 2 | 3 | 4)
            }
            disabled={drawer.state.step === 1 || drawer.submitting}
            className="text-xs px-3 py-1.5 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] disabled:text-gray-300 disabled:cursor-not-allowed"
          >
            Back
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onSaveDraft}
              disabled={!drawer.state.customer || drawer.state.items.length === 0 || drawer.submitting}
              className="text-xs px-3 py-1.5 border border-[var(--color-border-primary)] rounded text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] disabled:opacity-50"
            >
              Save as Draft
            </button>
            {drawer.state.step < 4 ? (
              <button
                type="button"
                onClick={onContinue}
                disabled={!canAdvance || drawer.submitting}
                className="text-xs px-3 py-1.5 bg-blue-600 text-[var(--color-text-inverted)] rounded hover:bg-blue-700 disabled:bg-gray-300"
              >
                Continue
              </button>
            ) : (
              <button
                type="button"
                onClick={onConfirm}
                disabled={!canAdvance || drawer.submitting}
                className="text-xs px-4 py-1.5 bg-emerald-600 text-[var(--color-text-inverted)] rounded hover:bg-emerald-700 disabled:bg-gray-300"
              >
                {drawer.submitting ? "Confirming…" : "Confirm Order"}
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
