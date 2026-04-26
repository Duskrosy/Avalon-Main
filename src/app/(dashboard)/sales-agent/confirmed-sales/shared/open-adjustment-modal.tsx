"use client";

import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";

type Props = {
  open: boolean;
  orderId: string;
  orderLabel: string;
  onClose: () => void;
  onCreated: () => void;
};

const TYPE_OPTIONS = [
  { value: "customer_service_request", label: "CS request" },
  { value: "item_replacement", label: "Item replacement" },
  { value: "quantity_correction", label: "Quantity correction" },
  { value: "fulfillment_request", label: "Fulfillment request" },
  { value: "inventory_issue", label: "Inventory issue" },
  { value: "other", label: "Other" },
];

const BUCKET_OPTIONS = [
  { value: "Customer Service", label: "Customer Service" },
  { value: "Inventory", label: "Inventory" },
  { value: "Fulfillment", label: "Fulfillment" },
  { value: "", label: "Unassigned" },
];

export function OpenAdjustmentModal({
  open,
  orderId,
  orderLabel,
  onClose,
  onCreated,
}: Props) {
  const [type, setType] = useState("customer_service_request");
  const [bucket, setBucket] = useState("Customer Service");
  const [requestText, setRequestText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const reset = () => {
    setType("customer_service_request");
    setBucket("Customer Service");
    setRequestText("");
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const submit = async () => {
    if (!requestText.trim()) {
      setError("Describe what needs to happen.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/sales/orders/${orderId}/adjustments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          adjustment_type: type,
          request_text: requestText.trim(),
          assigned_to_label: bucket || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to open adjustment");
        return;
      }
      reset();
      onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
            <AlertTriangle size={14} className="text-amber-600" />
            Open adjustment — {orderLabel}
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
          <div>
            <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1">
              Type
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1">
              Route to
            </label>
            <div className="flex flex-wrap gap-1">
              {BUCKET_OPTIONS.map((o) => (
                <button
                  key={o.value || "unassigned"}
                  type="button"
                  onClick={() => setBucket(o.value)}
                  className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                    bucket === o.value
                      ? "bg-blue-600 border-blue-600 text-white"
                      : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1">
              What needs to happen?
            </label>
            <textarea
              value={requestText}
              onChange={(e) => setRequestText(e.target.value)}
              rows={4}
              placeholder="e.g. Customer wants to swap M for L on the black tee"
              className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && (
            <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-gray-200 bg-gray-50 rounded-b-lg">
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
            onClick={submit}
            disabled={submitting}
            className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {submitting && (
              <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            )}
            {submitting ? "Opening…" : "Open adjustment"}
          </button>
        </div>
      </div>
    </div>
  );
}
