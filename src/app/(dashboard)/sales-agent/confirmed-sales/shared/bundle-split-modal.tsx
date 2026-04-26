"use client";

import { useState } from "react";
import { Calculator, X } from "lucide-react";

type Props = {
  open: boolean;
  orderId: string;
  orderLabel: string; // e.g. "AV-1234" or "#FC1234"
  syncStatus: string; // 'not_synced' | 'syncing' | 'synced' | 'failed'
  onClose: () => void;
  onApplied: () => void;
};

// Used for any non-cancelled order. The server endpoint computes the split
// from the original unit prices, so the dialog doesn't need to know totals
// up-front. We confirm the action, then surface the result.

export function BundleSplitModal({
  open,
  orderId,
  orderLabel,
  syncStatus,
  onClose,
  onApplied,
}: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    split_price: number;
    line_count: number;
    unit_count: number;
    shopify_split_pending: boolean;
  } | null>(null);

  if (!open) return null;

  const isSynced = syncStatus === "synced" || syncStatus === "syncing";

  const handleApply = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/sales/orders/${orderId}/bundle-split`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to apply bundle split");
        return;
      }
      setResult({
        split_price: json.split_price,
        line_count: json.line_count,
        unit_count: json.unit_count,
        shopify_split_pending: !!json.shopify_split_pending,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (result) onApplied();
    setResult(null);
    setError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
            <Calculator size={14} className="text-blue-600" />
            Split bundle — {orderLabel}
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-700"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm">
          {!result && !error && (
            <>
              <p className="text-xs text-gray-600 leading-relaxed">
                Distributes the order&apos;s total evenly across every unit.
                Used when a B1T1 or other bundle needs separate per-item
                prices on the COD waybill.
              </p>
              {isSynced && (
                <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-amber-700 font-medium mb-1">
                    Heads up
                  </div>
                  <p className="text-xs text-amber-800 leading-relaxed">
                    This order is already in Shopify. The split is recorded in
                    Avalon and shown on the receipt, but Shopify&apos;s
                    line-item prices won&apos;t update on the existing order.
                    Revert to draft and re-confirm if the waybill needs the
                    split.
                  </p>
                </div>
              )}
              <p className="text-[11px] text-gray-400">
                Original unit prices are preserved. Stored as
                <code className="px-1 bg-gray-100 mx-1 rounded">
                  adjusted_unit_price_amount
                </code>
                per line.
              </p>
            </>
          )}

          {error && (
            <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {error}
            </div>
          )}

          {result && (
            <div className="space-y-2">
              <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                Split applied: ₱{result.split_price.toFixed(2)} per unit across{" "}
                {result.unit_count} units ({result.line_count} lines).
              </div>
              {result.shopify_split_pending && (
                <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Shopify line-item prices were not updated. Revert to draft
                  and re-confirm if the waybill needs to reflect the split.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-200 bg-gray-50 rounded-b-lg">
          {!result ? (
            <>
              <button
                type="button"
                onClick={handleClose}
                disabled={submitting}
                className="px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100 rounded"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApply}
                disabled={submitting}
                className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {submitting && (
                  <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                )}
                {submitting ? "Applying…" : "Apply split"}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleClose}
              className="px-3 py-1.5 text-xs bg-gray-900 text-white rounded hover:bg-gray-700"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
