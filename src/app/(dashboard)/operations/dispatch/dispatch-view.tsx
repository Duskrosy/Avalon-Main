"use client";

import { useState, useEffect, useCallback } from "react";
import { format, parseISO } from "date-fns";
import { useToast, Toast } from "@/components/ui/toast";

/* ─── Types ────────────────────────────────────────────────── */

type Profile = { id: string; first_name: string; last_name: string };

type OrderRef = {
  id: string;
  order_number: string;
  customer_name: string | null;
  total_price: number;
};

type DispatchEntry = {
  id: string;
  order_id: string;
  status: string;
  is_preorder: boolean;
  assigned_to: string | null;
  courier_name: string | null;
  tracking_number: string | null;
  dispatch_date: string | null;
  handoff_at: string | null;
  remarks: string | null;
  created_at: string;
  updated_at: string;
  order: OrderRef | null;
  assigned: Profile | null;
};

type Props = {
  initialDispatches: DispatchEntry[];
  profiles: Profile[];
  orders: OrderRef[];
  currentUserId: string;
};

/* ─── Constants ────────────────────────────────────────────── */

const DISPATCH_STATUSES = ["pending", "picking", "packing", "ready", "handed_off", "cancelled"] as const;

const STATUS_BADGE: Record<string, string> = {
  pending:    "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]",
  picking:    "bg-[var(--color-accent-light)] text-[var(--color-accent)]",
  packing:    "bg-[var(--color-warning-light)] text-[var(--color-warning)]",
  ready:      "bg-[var(--color-success-light)] text-[var(--color-success)]",
  handed_off: "bg-emerald-50 text-emerald-700",
  cancelled:  "bg-[var(--color-error-light)] text-[var(--color-error)]",
};

const STATUS_PIPELINE_COLOR: Record<string, string> = {
  pending:    "bg-[var(--color-border-primary)]",
  picking:    "bg-blue-400",
  packing:    "bg-amber-400",
  ready:      "bg-green-400",
  handed_off: "bg-emerald-500",
  cancelled:  "bg-red-400",
};

const STATUS_LABEL: Record<string, string> = {
  pending:    "Pending",
  picking:    "Picking",
  packing:    "Packing",
  ready:      "Ready",
  handed_off: "Handed Off",
  cancelled:  "Cancelled",
};

function profileName(p: Profile | null) {
  if (!p) return "\u2014";
  return `${p.first_name} ${p.last_name}`;
}

function formatDate(d: string | null) {
  if (!d) return "\u2014";
  try {
    return format(parseISO(d), "d MMM yyyy");
  } catch {
    return "\u2014";
  }
}

function formatDateTime(d: string | null) {
  if (!d) return "\u2014";
  try {
    return format(parseISO(d), "d MMM yyyy HH:mm");
  } catch {
    return "\u2014";
  }
}

/* ─── Component ────────────────────────────────────────────── */

export function DispatchView({ initialDispatches, profiles, orders, currentUserId }: Props) {
  const { toast, setToast } = useToast();
  const [dispatches, setDispatches] = useState<DispatchEntry[]>(initialDispatches);
  const [loading, setLoading] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState("");
  const [assignedFilter, setAssignedFilter] = useState("");

  // Create modal
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    order_id: "",
    assigned_to: "",
    is_preorder: false,
    remarks: "",
  });

  /* ─── Fetch ──────────────────────────────────────────────── */

  const fetchDispatches = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (assignedFilter) params.set("assigned_to", assignedFilter);

    const res = await fetch(`/api/operations/dispatch?${params}`);
    if (res.ok) {
      const json = await res.json();
      setDispatches(json.data ?? []);
    }
    setLoading(false);
  }, [statusFilter, assignedFilter]);

  useEffect(() => {
    if (statusFilter || assignedFilter) {
      const timer = setTimeout(fetchDispatches, 300);
      return () => clearTimeout(timer);
    } else {
      setDispatches(initialDispatches);
    }
  }, [statusFilter, assignedFilter, fetchDispatches, initialDispatches]);

  /* ─── Pipeline Counts ───────────────────────────────────── */

  const counts: Record<string, number> = {};
  for (const s of DISPATCH_STATUSES) counts[s] = 0;
  for (const d of dispatches) {
    if (counts[d.status] !== undefined) counts[d.status]++;
  }
  const total = dispatches.length || 1; // avoid div by 0

  /* ─── Inline Status Update ──────────────────────────────── */

  async function updateStatus(id: string, status: string) {
    setDispatches(prev => prev.map(d => d.id === id ? { ...d, status } : d));
    const res = await fetch("/api/operations/dispatch", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    if (res.ok) {
      setToast({ message: "Dispatch status updated", type: "success" });
    } else {
      setToast({ message: "Failed to update dispatch status", type: "error" });
    }
    fetchDispatches();
  }

  /* ─── Create ─────────────────────────────────────────────── */

  function openCreate() {
    setForm({ order_id: "", assigned_to: "", is_preorder: false, remarks: "" });
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const payload = {
      order_id: form.order_id,
      assigned_to: form.assigned_to || null,
      is_preorder: form.is_preorder,
      remarks: form.remarks || null,
    };

    const res = await fetch("/api/operations/dispatch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      setShowModal(false);
      setToast({ message: "Dispatch entry created", type: "success" });
      fetchDispatches();
    } else {
      setToast({ message: "Failed to create dispatch entry", type: "error" });
    }
    setSaving(false);
  }

  /* ─── Delete ─────────────────────────────────────────────── */

  async function handleDelete(id: string) {
    if (!confirm("Delete this dispatch entry?")) return;
    setDispatches(prev => prev.filter(d => d.id !== id));
    const res = await fetch(`/api/operations/dispatch?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      setToast({ message: "Dispatch entry deleted", type: "success" });
    } else {
      setToast({ message: "Failed to delete dispatch entry", type: "error" });
    }
    fetchDispatches();
  }

  /* ─── Render ─────────────────────────────────────────────── */

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">Dispatch Queue</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">{dispatches.length} entries loaded</p>
        </div>
        <button
          onClick={openCreate}
          className="bg-[var(--color-text-primary)] text-white text-sm px-4 py-2 rounded-lg hover:bg-[var(--color-text-secondary)] transition-colors"
        >
          + New Dispatch
        </button>
      </div>

      {/* Status Pipeline Bar */}
      <div className="mb-6">
        <div className="flex h-8 rounded-lg overflow-hidden border border-[var(--color-border-primary)]">
          {DISPATCH_STATUSES.map((s) => {
            const pct = (counts[s] / total) * 100;
            if (counts[s] === 0) return null;
            return (
              <div
                key={s}
                className={`${STATUS_PIPELINE_COLOR[s]} flex items-center justify-center transition-all`}
                style={{ width: `${Math.max(pct, 4)}%` }}
                title={`${STATUS_LABEL[s]}: ${counts[s]}`}
              >
                <span className="text-[10px] font-semibold text-white drop-shadow-[var(--shadow-sm)] truncate px-1">
                  {counts[s]}
                </span>
              </div>
            );
          })}
          {dispatches.length === 0 && (
            <div className="w-full bg-[var(--color-bg-secondary)] flex items-center justify-center">
              <span className="text-xs text-[var(--color-text-tertiary)]">No dispatch entries</span>
            </div>
          )}
        </div>
        <div className="flex gap-4 mt-2 flex-wrap">
          {DISPATCH_STATUSES.map((s) => (
            <div key={s} className="flex items-center gap-1.5">
              <div className={`w-2.5 h-2.5 rounded-full ${STATUS_PIPELINE_COLOR[s]}`} />
              <span className="text-[11px] text-[var(--color-text-secondary)]">
                {STATUS_LABEL[s]} ({counts[s]})
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-[var(--color-border-primary)] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
        >
          <option value="">All Statuses</option>
          {DISPATCH_STATUSES.map((s) => (
            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
          ))}
        </select>
        <select
          value={assignedFilter}
          onChange={(e) => setAssignedFilter(e.target.value)}
          className="border border-[var(--color-border-primary)] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
        >
          <option value="">All Assigned</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>{profileName(p)}</option>
          ))}
        </select>
        {(statusFilter || assignedFilter) && (
          <button
            onClick={() => { setStatusFilter(""); setAssignedFilter(""); }}
            className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-16 text-[var(--color-text-tertiary)] text-sm">Loading...</div>
      ) : dispatches.length === 0 ? (
        <div className="bg-[var(--color-bg-secondary)] rounded-[var(--radius-lg)] p-12 text-center">
          <p className="text-sm text-[var(--color-text-tertiary)]">No dispatch entries found.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-border-primary)]">
          <table className="min-w-full divide-y divide-[var(--color-border-secondary)] text-sm">
            <thead className="bg-[var(--color-bg-secondary)]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase">Order #</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase">Customer</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase">Status</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-[var(--color-text-secondary)] uppercase">Pre-order?</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase">Courier</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase">Tracking #</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase">Assigned</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase">Dispatch Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase">Handoff</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="bg-[var(--color-bg-primary)] divide-y divide-[var(--color-border-secondary)]">
              {dispatches.map((d) => (
                <tr key={d.id} className="hover:bg-[var(--color-surface-hover)]">
                  <td className="px-4 py-3 font-mono text-xs font-medium text-[var(--color-text-primary)]">
                    {d.order?.order_number ?? "\u2014"}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-text-primary)]">
                    {d.order?.customer_name ?? <span className="text-[var(--color-text-tertiary)]">{"\u2014"}</span>}
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <select
                      value={d.status}
                      onChange={(e) => updateStatus(d.id, e.target.value)}
                      className={`text-xs px-2 py-0.5 rounded-full font-medium border-0 cursor-pointer focus:ring-2 focus:ring-[var(--color-accent)] ${STATUS_BADGE[d.status] ?? "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]"}`}
                    >
                      {DISPATCH_STATUSES.map((s) => (
                        <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {d.is_preorder ? (
                      <span className="text-xs bg-violet-50 text-violet-600 px-2 py-0.5 rounded-full font-medium">Yes</span>
                    ) : (
                      <span className="text-xs text-[var(--color-text-tertiary)]">{"\u2014"}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--color-text-secondary)]">{d.courier_name ?? "\u2014"}</td>
                  <td className="px-4 py-3 font-mono text-xs text-[var(--color-text-secondary)]">{d.tracking_number ?? "\u2014"}</td>
                  <td className="px-4 py-3 text-xs text-[var(--color-text-secondary)]">{profileName(d.assigned)}</td>
                  <td className="px-4 py-3 text-xs text-[var(--color-text-secondary)]">{formatDate(d.dispatch_date)}</td>
                  <td className="px-4 py-3 text-xs text-[var(--color-text-secondary)]">{formatDateTime(d.handoff_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDelete(d.id)}
                      className="text-xs text-[var(--color-text-tertiary)] hover:text-red-400"
                    >
                      Del
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--color-bg-primary)] rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4">New Dispatch Entry</h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">Order *</label>
                <select
                  required
                  value={form.order_id}
                  onChange={(e) => setForm((f) => ({ ...f, order_id: e.target.value }))}
                  className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                >
                  <option value="">Select order...</option>
                  {orders.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.order_number} {o.customer_name ? `\u2014 ${o.customer_name}` : ""} (\u20B1{Number(o.total_price).toLocaleString("en-PH", { minimumFractionDigits: 2 })})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">Assigned To</label>
                <select
                  value={form.assigned_to}
                  onChange={(e) => setForm((f) => ({ ...f, assigned_to: e.target.value }))}
                  className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                >
                  <option value="">Unassigned</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>{profileName(p)}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_preorder"
                  checked={form.is_preorder}
                  onChange={(e) => setForm((f) => ({ ...f, is_preorder: e.target.checked }))}
                  className="rounded border-[var(--color-border-primary)] text-[var(--color-text-primary)] focus:ring-[var(--color-accent)]"
                />
                <label htmlFor="is_preorder" className="text-sm text-[var(--color-text-primary)]">Pre-order</label>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">Remarks</label>
                <textarea
                  rows={2}
                  value={form.remarks}
                  onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))}
                  className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 border border-[var(--color-border-primary)] text-[var(--color-text-primary)] text-sm py-2 rounded-lg hover:bg-[var(--color-surface-hover)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-[var(--color-text-primary)] text-white text-sm py-2 rounded-lg hover:bg-[var(--color-text-secondary)] disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Create Dispatch"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
