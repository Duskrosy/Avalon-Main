"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";

type Props = {
  open: boolean;
  isSynced: boolean;
  shopifyOrderId: string | null;
  orderLabel: string | null;
  mode: "revert" | "cancel";
  onConfirm: (reason: string) => Promise<void>;
  onClose: () => void;
};

export function RevertOrCancelDialog({
  open,
  isSynced,
  shopifyOrderId,
  orderLabel,
  mode,
  onConfirm,
  onClose,
}: Props) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const verb = mode === "revert" ? "Revert to Draft" : "Cancel Order";
  const subtle =
    mode === "revert"
      ? "Stock will be released and the order returns to draft. Re-confirm assigns a fresh AV number."
      : "The order is soft-deleted. Stock is released. Avalon order history is preserved.";

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(reason);
      setReason("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 overflow-hidden">
        <div className="p-5 space-y-3">
          <div className="flex items-start gap-3">
            {isSynced && (
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
                <AlertTriangle size={16} className="text-amber-600" />
              </div>
            )}
            <div>
              <h3 className="font-semibold text-gray-900">{verb}</h3>
              <p className="text-xs text-gray-600 mt-1">
                {orderLabel ? `${orderLabel} · ` : ""}
                {subtle}
              </p>
            </div>
          </div>

          {isSynced && (
            <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-900">
              <strong>Warning:</strong> This order is synced to Shopify
              {shopifyOrderId ? ` (Shopify ID ${shopifyOrderId})` : ""}. Proceeding
              will <strong>cancel the live Shopify order</strong>.
            </div>
          )}

          <div>
            <label className="text-xs text-gray-700 block mb-1">
              Reason (optional)
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded min-h-[60px]"
              placeholder="e.g. customer changed mind, wrong size..."
            />
          </div>

          {error && <div className="text-xs text-rose-700">{error}</div>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 bg-gray-50 border-t border-gray-200">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="text-xs px-3 py-1.5 text-gray-700 hover:text-gray-900"
          >
            Never mind
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className={`text-xs px-3 py-1.5 rounded text-white ${
              mode === "cancel"
                ? "bg-rose-600 hover:bg-rose-700"
                : "bg-amber-600 hover:bg-amber-700"
            } disabled:opacity-50`}
          >
            {submitting ? "Working…" : verb}
          </button>
        </div>
      </div>
    </div>
  );
}
