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
      <div className="bg-[var(--color-bg-primary)] rounded-lg shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border-primary)]">
          <div className="flex items-center gap-2 text-sm font-medium text-[var(--color-text-primary)]">
            <AlertTriangle size={14} className="text-[var(--color-warning)]" />
            Open adjustment — {orderLabel}
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm">
          <div>
            <label className="block text-[10px] uppercase tracking-wide text-[var(--color-text-tertiary)] mb-1">
              Type
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full px-2 py-1.5 text-sm border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] rounded focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {/* Route picker removed — adjustments always route to Customer Service. */}

          <div>
            <label className="block text-[10px] uppercase tracking-wide text-[var(--color-text-tertiary)] mb-1">
              What needs to happen?
            </label>
            <textarea
              value={requestText}
              onChange={(e) => setRequestText(e.target.value)}
              rows={4}
              placeholder="e.g. Customer wants to swap M for L on the black tee"
              className="w-full px-2 py-1.5 text-sm border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] rounded focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] placeholder:text-[var(--color-text-tertiary)]"
            />
          </div>

          {error && (
            <div className="rounded border border-[var(--color-error-light)] bg-[var(--color-error-light)] px-3 py-2 text-xs text-[var(--color-error-text)]">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] rounded-b-lg">
          <button
            type="button"
            onClick={handleClose}
            disabled={submitting}
            className="px-3 py-1.5 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] rounded"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="px-3 py-1.5 text-xs bg-[var(--color-accent)] text-[var(--color-accent-text)] rounded hover:bg-[var(--color-accent-hover)] disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {submitting && (
              <span className="w-3 h-3 border-2 border-[var(--color-accent-text)]/30 border-t-[var(--color-accent-text)] rounded-full animate-spin" />
            )}
            {submitting ? "Opening…" : "Open adjustment"}
          </button>
        </div>
      </div>
    </div>
  );
}
