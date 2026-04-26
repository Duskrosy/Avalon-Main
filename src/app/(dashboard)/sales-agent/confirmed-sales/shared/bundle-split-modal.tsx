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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Calculator size={16} className="text-blue-600" />
            <h2 className="text-sm font-semibold">
              Split bundle evenly — {orderLabel}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-700"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-3 text-sm">
          {!result && !error && (
            <>
              <p className="text-gray-700">
                Distributes the order&apos;s total evenly across every unit.
                Used when a B1T1 or other bundle needs separate per-item prices
                on the COD waybill.
              </p>
              {isSynced && (
                <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 text-xs">
                  This order is already in Shopify. The split will be recorded
                  in Avalon and on the receipt, but Shopify&apos;s line-item
                  prices won&apos;t update on the existing order. If the
                  waybill must reflect the split, revert to draft after
                  applying and re-confirm.
                </p>
              )}
              <p className="text-xs text-gray-500">
                Original unit prices are preserved. The split writes
                <code className="px-1 bg-gray-100 mx-1">
                  adjusted_unit_price_amount
                </code>
                on each line.
              </p>
            </>
          )}

          {error && (
            <div className="text-rose-700 bg-rose-50 border border-rose-200 rounded p-2 text-xs">
              {error}
            </div>
          )}

          {result && (
            <div className="space-y-2">
              <div className="bg-emerald-50 border border-emerald-200 rounded p-2 text-xs text-emerald-800">
                Split applied: ₱{result.split_price.toFixed(2)} per unit across{" "}
                {result.unit_count} units ({result.line_count} lines).
              </div>
              {result.shopify_split_pending && (
                <div className="bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-800">
                  Shopify line-item prices were NOT updated. Revert to draft
                  and re-confirm if the waybill needs to reflect the split.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 p-3 border-t border-gray-200 bg-gray-50">
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
                className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? "Applying…" : "Apply split"}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleClose}
              className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
