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
  bundle_split_pricing: "Bundle Split",
  item_replacement: "Item Replacement",
  quantity_correction: "Quantity Correction",
  fulfillment_request: "Fulfillment Request",
  inventory_issue: "Inventory Issue",
  customer_service_request: "CS Request",
  other: "Other",
};

const TYPE_FILTER_OPTIONS = [
  { value: "", label: "All types" },
  { value: "customer_service_request", label: "CS Request" },
  { value: "item_replacement", label: "Item Replacement" },
  { value: "quantity_correction", label: "Quantity Correction" },
  { value: "fulfillment_request", label: "Fulfillment Request" },
  { value: "inventory_issue", label: "Inventory Issue" },
  { value: "other", label: "Other" },
];

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
        // Show all four statuses; leave the param out and fold in resolved/cancelled
        params.set("status", "open");
      } else if (statusTab === "open") {
        // Default endpoint behavior is open+in_progress; pass nothing.
      } else {
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
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <AlertTriangle size={18} /> Order Adjustments
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Tickets opened by Sales for Customer Service. Claim → resolve →
            close.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void fetchAdjustments()}
          className="flex items-center gap-1 text-xs px-2 py-1 border border-gray-200 rounded hover:bg-gray-50"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["open", "Open"],
            ["in_progress", "In progress"],
            ["resolved", "Resolved"],
            ["all", "All"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setStatusTab(key)}
            className={`text-xs px-3 py-1.5 rounded-full border ${
              statusTab === key
                ? "bg-blue-600 border-blue-600 text-white"
                : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
            }`}
          >
            {label}
            {key === "open" && counts.open > 0 ? ` (${counts.open})` : ""}
            {key === "in_progress" && counts.in_progress > 0
              ? ` (${counts.in_progress})`
              : ""}
          </button>
        ))}

        <div className="flex items-center gap-1 ml-2">
          <Filter size={12} className="text-gray-400" />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="text-xs px-2 py-1 border border-gray-200 rounded"
          >
            {TYPE_FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {counts.mine > 0 && (
          <span className="ml-auto text-xs text-blue-600">
            {counts.mine} assigned to you
          </span>
        )}
      </div>

      <div className="border border-gray-200 rounded-md bg-white">
        {loading && adjustments.length === 0 ? (
          <div className="p-6 text-center text-xs text-gray-400">Loading…</div>
        ) : adjustments.length === 0 ? (
          <div className="p-6 text-center text-xs text-gray-400">
            No adjustments in this view.
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {adjustments.map((a) => {
              const orderLabel =
                a.order?.shopify_order_name ??
                a.order?.avalon_order_number ??
                a.order_id.slice(0, 8);
              const isMine = a.assigned_to_user_id === currentUserId;
              return (
                <li key={a.id} className="p-3 hover:bg-gray-50">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-medium text-gray-900">
                          {orderLabel}
                        </span>
                        <span className="px-1.5 py-0.5 bg-gray-100 text-gray-700 rounded text-[10px]">
                          {TYPE_LABEL[a.adjustment_type] ?? a.adjustment_type}
                        </span>
                        <StatusChip status={a.status} />
                        {isMine && (
                          <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px]">
                            You
                          </span>
                        )}
                        {a.assigned_to_label && (
                          <span className="px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded text-[10px]">
                            → {a.assigned_to_label}
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-800">
                        {a.request_text}
                      </div>
                      {a.resolution_notes && (
                        <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1 inline-block">
                          Resolution: {a.resolution_notes}
                        </div>
                      )}
                      <div className="flex items-center gap-3 text-[11px] text-gray-500">
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
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {a.status === "open" && (
                          <button
                            type="button"
                            onClick={() => claim(a.id)}
                            className="text-[11px] px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-1"
                          >
                            <Clock size={10} /> Claim
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => startResolve(a.id)}
                          className="text-[11px] px-2 py-1 bg-emerald-600 text-white rounded hover:bg-emerald-700 flex items-center gap-1"
                        >
                          <CheckCircle2 size={10} /> Resolve
                        </button>
                        <button
                          type="button"
                          onClick={() => cancel(a.id)}
                          className="text-[11px] px-2 py-1 text-rose-600 hover:bg-rose-50 rounded"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="p-4 border-b border-gray-200">
              <h2 className="text-sm font-semibold">Resolve adjustment</h2>
            </div>
            <div className="p-4 space-y-2">
              <label className="text-xs text-gray-600">
                Resolution notes (optional)
              </label>
              <textarea
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                rows={3}
                placeholder="What did you do to resolve this?"
                className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded"
              />
            </div>
            <div className="flex justify-end gap-2 p-3 border-t border-gray-200 bg-gray-50">
              <button
                type="button"
                onClick={() => setResolvingId(null)}
                className="px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100 rounded"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitResolve}
                className="px-3 py-1.5 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-700"
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

function StatusChip({ status }: { status: Adjustment["status"] }) {
  const map: Record<Adjustment["status"], string> = {
    open: "bg-amber-50 text-amber-700",
    in_progress: "bg-blue-50 text-blue-700",
    resolved: "bg-emerald-50 text-emerald-700",
    cancelled: "bg-gray-100 text-gray-500",
  };
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] ${map[status]}`}>
      {status.replace("_", " ")}
    </span>
  );
}
