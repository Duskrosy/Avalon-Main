"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Filter,
  RefreshCw,
  X,
} from "lucide-react";

type Adjustment = {
  id: string;
  order_id: string;
  adjustment_type: string;
  status: "open" | "in_progress" | "resolved" | "cancelled";
  assigned_to_user_id: string | null;
  assigned_to_label: string | null;
  request_text: string;
  structured_payload: Record<string, unknown> | null;
  created_by_user_id: string | null;
  created_by_name: string | null;
  resolved_by_user_id: string | null;
  resolution_notes: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  order: {
    id: string;
    avalon_order_number: string | null;
    shopify_order_name: string | null;
    shopify_order_number: number | null;
    status: string;
    sync_status: string;
    final_total_amount: number;
    person_in_charge_label: string | null;
    customer: {
      id: string;
      first_name: string;
      last_name: string;
      full_name: string;
      phone: string | null;
    } | null;
  } | null;
};

type Props = { currentUserId: string };

const TYPE_LABEL: Record<string, string> = {
  bundle_split_pricing: "Bundle Split Pricing",
  item_replacement: "Item Replacement",
  quantity_correction: "Quantity Correction",
  fulfillment_request: "Fulfillment Request",
  inventory_issue: "Inventory Issue",
  // customer_service_request retained for legacy rows; not in the filter dropdown.
  customer_service_request: "CS Request",
  other: "Other",
};

const TYPE_FILTER_OPTIONS = [
  { value: "", label: "All types" },
  { value: "bundle_split_pricing", label: "Bundle Split Pricing" },
  { value: "item_replacement", label: "Item Replacement" },
  { value: "quantity_correction", label: "Quantity Correction" },
  { value: "fulfillment_request", label: "Fulfillment Request" },
  { value: "inventory_issue", label: "Inventory Issue" },
  { value: "other", label: "Other" },
];

const STATUS_BADGE: Record<Adjustment["status"], string> = {
  open: "bg-[var(--color-warning-light)] text-[var(--color-warning)]",
  in_progress: "bg-[var(--color-accent-light)] text-[var(--color-accent)]",
  resolved: "bg-[var(--color-success-light)] text-[var(--color-success)]",
  cancelled: "bg-[var(--color-bg-tertiary)] text-[var(--color-text-tertiary)]",
};

export function OrderAdjustmentsView({ currentUserId }: Props) {
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusTab, setStatusTab] = useState<
    "open" | "in_progress" | "resolved" | "all"
  >("open");
  const [typeFilter, setTypeFilter] = useState("");
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState("");

  const fetchAdjustments = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ bucket: "cs" });
      if (statusTab === "all") {
        params.set("status", "open");
      } else if (statusTab !== "open") {
        params.set("status", statusTab);
      }
      if (typeFilter) params.set("type", typeFilter);
      const res = await fetch(`/api/sales/adjustments?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setAdjustments(json.adjustments ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [statusTab, typeFilter]);

  useEffect(() => {
    void fetchAdjustments();
  }, [fetchAdjustments]);

  const claim = async (id: string) => {
    await fetch(`/api/sales/adjustments/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        status: "in_progress",
        assigned_to_user_id: currentUserId,
      }),
    });
    void fetchAdjustments();
  };

  const cancel = async (id: string) => {
    if (!confirm("Cancel this adjustment ticket?")) return;
    await fetch(`/api/sales/adjustments/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "cancelled" }),
    });
    void fetchAdjustments();
  };

  const startResolve = (id: string) => {
    setResolvingId(id);
    setResolutionNotes("");
  };

  const submitResolve = async () => {
    if (!resolvingId) return;
    await fetch(`/api/sales/adjustments/${resolvingId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        status: "resolved",
        resolution_notes: resolutionNotes.trim() || null,
      }),
    });
    setResolvingId(null);
    setResolutionNotes("");
    void fetchAdjustments();
  };

  const counts = useMemo(() => {
    const c = { open: 0, in_progress: 0, mine: 0 };
    adjustments.forEach((a) => {
      if (a.status === "open") c.open++;
      if (a.status === "in_progress") c.in_progress++;
      if (a.assigned_to_user_id === currentUserId && a.status !== "resolved")
        c.mine++;
    });
    return c;
  }, [adjustments, currentUserId]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
            <AlertTriangle size={20} className="text-[var(--color-warning)]" />
            Order Adjustments
          </h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            Tickets opened by Sales for Customer Service. Claim, resolve, close.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void fetchAdjustments()}
          className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 border border-[var(--color-border-primary)] rounded-lg hover:bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] transition-colors"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(
          [
            ["open", "Open", counts.open],
            ["in_progress", "In progress", counts.in_progress],
            ["resolved", "Resolved", null],
            ["all", "All", null],
          ] as const
        ).map(([key, label, count]) => (
          <button
            key={key}
            type="button"
            onClick={() => setStatusTab(key)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              statusTab === key
                ? "bg-[var(--color-text-primary)] border-[var(--color-text-primary)] text-[var(--color-text-inverted)]"
                : "bg-[var(--color-bg-primary)] border-[var(--color-border-primary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]"
            }`}
          >
            {label}
            {count != null && count > 0 ? ` (${count})` : ""}
          </button>
        ))}

        <div className="flex items-center gap-1 ml-2">
          <Filter size={12} className="text-[var(--color-text-tertiary)]" />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="text-xs px-2 py-1 border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] rounded focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          >
            {TYPE_FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {counts.mine > 0 && (
          <span className="ml-auto text-xs text-[var(--color-accent)]">
            {counts.mine} assigned to you
          </span>
        )}
      </div>

      <div className="border border-[var(--color-border-primary)] rounded-lg bg-[var(--color-bg-primary)] overflow-hidden">
        {loading && adjustments.length === 0 ? (
          <div className="p-8 text-center text-sm text-[var(--color-text-tertiary)]">
            Loading…
          </div>
        ) : adjustments.length === 0 ? (
          <div className="p-8 text-center text-sm text-[var(--color-text-tertiary)]">
            No adjustments in this view.
          </div>
        ) : (
          <ul className="divide-y divide-[var(--color-border-secondary)]">
            {adjustments.map((a) => {
              const orderLabel =
                a.order?.shopify_order_name ?? a.order_id.slice(0, 8);
              const isMine = a.assigned_to_user_id === currentUserId;
              return (
                <li
                  key={a.id}
                  className="p-3 hover:bg-[var(--color-bg-secondary)] transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap text-xs">
                        <span className="font-medium text-[var(--color-text-primary)]">
                          {orderLabel}
                        </span>
                        <span className="px-1.5 py-0.5 bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] rounded text-[10px]">
                          {TYPE_LABEL[a.adjustment_type] ?? a.adjustment_type}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] ${STATUS_BADGE[a.status]}`}
                        >
                          {a.status.replace("_", " ")}
                        </span>
                        {isMine && (
                          <span className="px-1.5 py-0.5 bg-[var(--color-accent-light)] text-[var(--color-accent)] rounded text-[10px]">
                            You
                          </span>
                        )}
                        {a.assigned_to_label && (
                          <span className="px-1.5 py-0.5 bg-[var(--color-warning-light)] text-[var(--color-warning)] rounded text-[10px]">
                            → {a.assigned_to_label}
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-[var(--color-text-primary)] leading-snug">
                        {a.request_text}
                      </div>
                      {a.resolution_notes && (
                        <div className="text-xs text-[var(--color-success)] bg-[var(--color-success-light)] rounded px-2 py-1 inline-block">
                          Resolution: {a.resolution_notes}
                        </div>
                      )}
                      <div className="flex items-center gap-3 text-[11px] text-[var(--color-text-tertiary)] flex-wrap">
                        <span>
                          {format(parseISO(a.created_at), "MMM d HH:mm")} ·{" "}
                          {a.created_by_name ?? "—"}
                        </span>
                        {a.order?.customer && (
                          <span>
                            {a.order.customer.full_name}
                            {a.order.customer.phone
                              ? ` · ${a.order.customer.phone}`
                              : ""}
                          </span>
                        )}
                        {a.order && (
                          <span className="tabular-nums">
                            ₱{a.order.final_total_amount.toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>
                    {a.status !== "resolved" && a.status !== "cancelled" && (
                      <div className="flex items-center gap-1 shrink-0">
                        {a.status === "open" && (
                          <button
                            type="button"
                            onClick={() => claim(a.id)}
                            className="text-[11px] px-2 py-1 bg-[var(--color-accent)] text-[var(--color-text-inverted)] rounded hover:opacity-90 inline-flex items-center gap-1"
                          >
                            <Clock size={10} /> Claim
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => startResolve(a.id)}
                          className="text-[11px] px-2 py-1 bg-[var(--color-success)] text-[var(--color-text-inverted)] rounded hover:opacity-90 inline-flex items-center gap-1"
                        >
                          <CheckCircle2 size={10} /> Resolve
                        </button>
                        <button
                          type="button"
                          onClick={() => cancel(a.id)}
                          className="text-[11px] p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-error)] rounded"
                          title="Cancel ticket"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {resolvingId && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-[var(--color-bg-primary)] rounded-lg shadow-xl w-full max-w-md flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border-primary)]">
              <div className="text-sm font-medium text-[var(--color-text-primary)]">
                Resolve adjustment
              </div>
              <button
                type="button"
                onClick={() => setResolvingId(null)}
                className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-4 space-y-2">
              <label className="block text-[10px] uppercase tracking-wide text-[var(--color-text-tertiary)] mb-1">
                Resolution notes (optional)
              </label>
              <textarea
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                rows={3}
                placeholder="What did you do to resolve this?"
                className="w-full px-2 py-1.5 text-sm border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] rounded focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              />
            </div>
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] rounded-b-lg">
              <button
                type="button"
                onClick={() => setResolvingId(null)}
                className="px-3 py-1.5 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] rounded"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitResolve}
                className="px-3 py-1.5 text-xs bg-[var(--color-success)] text-[var(--color-text-inverted)] rounded hover:opacity-90"
              >
                Mark resolved
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
