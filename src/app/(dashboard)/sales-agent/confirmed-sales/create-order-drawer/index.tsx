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
};

export function CreateOrderDrawer({ open, onClose, onConfirmed }: Props) {
  const drawer = useCreateOrder();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      drawer.reset();
      setError(null);
    }
    // intentional: only reset when open flips, not when drawer changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const canAdvance = (() => {
    switch (drawer.state.step) {
      case 1:
        return !!drawer.state.customer;
      case 2:
        return drawer.state.items.length > 0;
      case 3:
        return drawer.totals.total >= 0;
      case 4:
        return !!drawer.state.handoff.mode_of_payment && !!drawer.state.handoff.person_in_charge_label;
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
      <div className="w-full max-w-xl h-full bg-white shadow-2xl flex flex-col">
        <header className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <div>
            <div className="text-base font-semibold">Create Order</div>
            <div className="text-xs text-gray-500">
              Step {drawer.state.step} of 4 · {STEP_LABELS[drawer.state.step - 1]}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </header>

        <nav className="flex border-b border-gray-100 px-5 py-2 gap-1 text-[11px] uppercase tracking-wider">
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
                    ? "bg-blue-50 text-blue-700"
                    : isPast
                      ? "text-emerald-700 hover:bg-emerald-50"
                      : "text-gray-400"
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
              items={drawer.state.items}
              voucher={drawer.state.voucher}
              manualDiscount={drawer.state.manualDiscount}
              shippingFee={drawer.state.shippingFee}
              onSetVoucher={drawer.setVoucher}
              onSetManualDiscount={drawer.setManualDiscount}
              onSetShippingFee={drawer.setShippingFee}
            />
          )}
          {drawer.state.step === 4 && (
            <StepHandoff
              handoff={drawer.state.handoff}
              completion={drawer.state.completion}
              onSetHandoff={drawer.setHandoff}
              onSetCompletion={drawer.setCompletion}
            />
          )}
        </main>

        {error && (
          <div className="px-5 pb-2 text-xs text-rose-700 bg-rose-50 border-t border-rose-200 py-2">
            {error}
          </div>
        )}

        <footer className="border-t border-gray-200 px-5 py-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() =>
              drawer.state.step > 1 &&
              drawer.setStep((drawer.state.step - 1) as 1 | 2 | 3 | 4)
            }
            disabled={drawer.state.step === 1 || drawer.submitting}
            className="text-xs px-3 py-1.5 text-gray-600 hover:text-gray-900 disabled:text-gray-300 disabled:cursor-not-allowed"
          >
            Back
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onSaveDraft}
              disabled={!drawer.state.customer || drawer.state.items.length === 0 || drawer.submitting}
              className="text-xs px-3 py-1.5 border border-gray-200 rounded text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Save as Draft
            </button>
            {drawer.state.step < 4 ? (
              <button
                type="button"
                onClick={onContinue}
                disabled={!canAdvance || drawer.submitting}
                className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300"
              >
                Continue
              </button>
            ) : (
              <button
                type="button"
                onClick={onConfirm}
                disabled={!canAdvance || drawer.submitting}
                className="text-xs px-4 py-1.5 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:bg-gray-300"
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
