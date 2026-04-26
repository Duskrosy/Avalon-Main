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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-600" />
            <h2 className="text-sm font-semibold">
              Open adjustment — {orderLabel}
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
          <div>
            <label className="block text-xs text-gray-600 mb-1">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded"
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1">Route to</label>
            <div className="flex flex-wrap gap-1">
              {BUCKET_OPTIONS.map((o) => (
                <button
                  key={o.value || "unassigned"}
                  type="button"
                  onClick={() => setBucket(o.value)}
                  className={`text-xs px-2 py-1 rounded border ${
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
            <label className="block text-xs text-gray-600 mb-1">
              What needs to happen?
            </label>
            <textarea
              value={requestText}
              onChange={(e) => setRequestText(e.target.value)}
              rows={4}
              placeholder="e.g. Customer wants to swap M for L on the black tee"
              className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded"
            />
          </div>

          {error && (
            <div className="text-rose-700 bg-rose-50 border border-rose-200 rounded p-2 text-xs">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 p-3 border-t border-gray-200 bg-gray-50">
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
            className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? "Opening…" : "Open adjustment"}
          </button>
        </div>
      </div>
    </div>
  );
}
