"use client";

import { useState, useEffect, useCallback } from "react";
import { format, parseISO } from "date-fns";
import { useToast, Toast } from "@/components/ui/toast";

/* ─── Types ────────────────────────────────────────────────── */

type Profile = { id: string; first_name: string; last_name: string };

type RemittanceBatch = {
  id: string;
  batch_name: string;
  courier_name: string;
  status: string;
  total_expected: number;
  total_received: number;
  mismatch_amount: number;
  settlement_date: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  creator: Profile | null;
};

type RemittanceItem = {
  id: string;
  batch_id: string;
  order_id: string | null;
  dispatch_id: string | null;
  expected_amount: number;
  received_amount: number | null;
  is_matched: boolean;
  notes: string | null;
  created_at: string;
  order: { id: string; order_number: string } | null;
};

type Props = {
  initialBatches: RemittanceBatch[];
  currentUserId: string;
};

/* ─── Constants ────────────────────────────────────────────── */

const STATUSES = ["draft", "pending", "reconciled", "disputed", "settled"] as const;

const STATUS_BADGE: Record<string, string> = {
  draft:       "bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] border-[var(--color-border-primary)]",
  pending:     "bg-[var(--color-warning-light)] text-[var(--color-warning-text)] border-[var(--color-border-primary)]",
  reconciled:  "bg-[var(--color-success-light)] text-green-800 border-green-200",
  disputed:    "bg-[var(--color-error-light)] text-red-800 border-red-200",
  settled:     "bg-[var(--color-accent-light)] text-[var(--color-accent)] border-[var(--color-accent)]",
};

function statusLabel(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function profileName(p: Profile | null) {
  if (!p) return "Unknown";
  return `${p.first_name} ${p.last_name}`;
}

function peso(n: number | null | undefined) {
  if (n === null || n === undefined) return "--";
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(Number(n));
}

/* ─── Component ────────────────────────────────────────────── */

export function RemittanceView({ initialBatches, currentUserId }: Props) {
  const { toast, setToast } = useToast();
  const [batches, setBatches] = useState<RemittanceBatch[]>(initialBatches);
  const [loading, setLoading] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState("");
  const [courierFilter, setCourierFilter] = useState("");

  // Expanded batch → items
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);
  const [batchItems, setBatchItems] = useState<RemittanceItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);

  // Modals
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [showItemModal, setShowItemModal] = useState(false);
  const [saving, setSaving] = useState(false);

  // Batch form
  const [batchForm, setBatchForm] = useState({
    batch_name: "",
    courier_name: "",
    total_expected: "",
    notes: "",
  });

  // Item form
  const [itemForm, setItemForm] = useState({
    batch_id: "",
    order_id: "",
    dispatch_id: "",
    expected_amount: "",
    received_amount: "",
    notes: "",
  });

  // Inline editing
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editReceivedAmount, setEditReceivedAmount] = useState("");
  const [editItemNotes, setEditItemNotes] = useState("");

  /* ─── Unique couriers from data ─────────────────────────── */

  const uniqueCouriers = Array.from(
    new Set(initialBatches.map((b) => b.courier_name))
  ).sort();

  /* ─── Fetch batches ─────────────────────────────────────── */

  const fetchBatches = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (courierFilter) params.set("courier_name", courierFilter);

    const res = await fetch(`/api/operations/remittance?${params}`);
    if (res.ok) {
      const json = await res.json();
      setBatches(json.data ?? []);
    }
    setLoading(false);
  }, [statusFilter, courierFilter]);

  useEffect(() => {
    if (statusFilter || courierFilter) {
      fetchBatches();
    } else {
      setBatches(initialBatches);
    }
  }, [statusFilter, courierFilter, fetchBatches, initialBatches]);

  /* ─── Fetch items for expanded batch ────────────────────── */

  const fetchItems = useCallback(async (batchId: string) => {
    setItemsLoading(true);
    const res = await fetch(
      `/api/operations/remittance?items=true&batch_id=${batchId}`
    );
    if (res.ok) {
      const json = await res.json();
      setBatchItems(json.data ?? []);
    }
    setItemsLoading(false);
  }, []);

  function toggleExpand(batchId: string) {
    if (expandedBatchId === batchId) {
      setExpandedBatchId(null);
      setBatchItems([]);
    } else {
      setExpandedBatchId(batchId);
      fetchItems(batchId);
    }
  }

  /* ─── Create batch ──────────────────────────────────────── */

  function openBatchModal() {
    setBatchForm({ batch_name: "", courier_name: "", total_expected: "", notes: "" });
    setShowBatchModal(true);
  }

  async function handleCreateBatch(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const res = await fetch("/api/operations/remittance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "batch",
        batch_name: batchForm.batch_name,
        courier_name: batchForm.courier_name,
        total_expected: batchForm.total_expected ? parseFloat(batchForm.total_expected) : 0,
        notes: batchForm.notes || null,
      }),
    });

    if (res.ok) {
      setShowBatchModal(false);
      setToast({ message: "Batch created", type: "success" });
      fetchBatches();
    }
    setSaving(false);
  }

  /* ─── Create item ───────────────────────────────────────── */

  function openItemModal(batchId: string) {
    setItemForm({
      batch_id: batchId,
      order_id: "",
      dispatch_id: "",
      expected_amount: "",
      received_amount: "",
      notes: "",
    });
    setShowItemModal(true);
  }

  async function handleCreateItem(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const res = await fetch("/api/operations/remittance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "item",
        batch_id: itemForm.batch_id,
        expected_amount: parseFloat(itemForm.expected_amount) || 0,
        order_id: itemForm.order_id || null,
        dispatch_id: itemForm.dispatch_id || null,
        received_amount: itemForm.received_amount
          ? parseFloat(itemForm.received_amount)
          : null,
        notes: itemForm.notes || null,
      }),
    });

    if (res.ok) {
      setShowItemModal(false);
      fetchItems(itemForm.batch_id);
      setToast({ message: "Item added", type: "success" });
      fetchBatches();
    }
    setSaving(false);
  }

  /* ─── Inline update item ────────────────────────────────── */

  function startEditItem(item: RemittanceItem) {
    setEditingItemId(item.id);
    setEditReceivedAmount(item.received_amount !== null ? String(item.received_amount) : "");
    setEditItemNotes(item.notes ?? "");
  }

  async function saveEditItem(item: RemittanceItem) {
    const received = editReceivedAmount ? parseFloat(editReceivedAmount) : null;
    const matched = received !== null && received === Number(item.expected_amount);

    await fetch("/api/operations/remittance", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: item.id,
        type: "item",
        received_amount: received,
        is_matched: matched,
        notes: editItemNotes || null,
      }),
    });

    setEditingItemId(null);
    if (expandedBatchId) fetchItems(expandedBatchId);
    setToast({ message: "Item updated", type: "success" });
    fetchBatches();
  }

  async function toggleMatched(item: RemittanceItem) {
    await fetch("/api/operations/remittance", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: item.id,
        type: "item",
        is_matched: !item.is_matched,
      }),
    });

    if (expandedBatchId) fetchItems(expandedBatchId);
  }

  /* ─── Update batch status ───────────────────────────────── */

  async function updateBatchStatus(batchId: string, newStatus: string) {
    setBatches(prev => prev.map(b => b.id === batchId ? { ...b, status: newStatus } : b));
    await fetch("/api/operations/remittance", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: batchId, type: "batch", status: newStatus }),
    });

    setToast({ message: `Batch status updated to ${statusLabel(newStatus)}`, type: "success" });
    fetchBatches();
  }

  /* ─── Delete batch ──────────────────────────────────────── */

  async function handleDeleteBatch(id: string) {
    if (!confirm("Delete this remittance batch and all its items?")) return;
    setBatches(prev => prev.filter(b => b.id !== id));
    if (expandedBatchId === id) {
      setExpandedBatchId(null);
      setBatchItems([]);
    }
    await fetch(`/api/operations/remittance?id=${id}&type=batch`, { method: "DELETE" });
    setToast({ message: "Batch deleted", type: "success" });
    fetchBatches();
  }

  /* ─── Delete item ───────────────────────────────────────── */

  async function handleDeleteItem(itemId: string) {
    if (!confirm("Delete this remittance item?")) return;
    setBatchItems(prev => prev.filter(i => i.id !== itemId));
    await fetch(`/api/operations/remittance?id=${itemId}&type=item`, { method: "DELETE" });
    if (expandedBatchId) fetchItems(expandedBatchId);
    setToast({ message: "Item deleted", type: "success" });
    fetchBatches();
  }

  /* ─── Summary Stats ─────────────────────────────────────── */

  const totalBatches = batches.length;
  const pendingCount = batches.filter((b) => b.status === "pending").length;
  const disputedCount = batches.filter((b) => b.status === "disputed").length;
  const totalMismatch = batches.reduce(
    (sum, b) => sum + Math.abs(Number(b.mismatch_amount) || 0),
    0
  );

  /* ─── Render ────────────────────────────────────────────── */

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">Remittance</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            {batches.length} batch{batches.length !== 1 ? "es" : ""} shown
          </p>
        </div>
        <button
          onClick={openBatchModal}
          className="bg-[var(--color-text-primary)] text-white text-sm px-4 py-2 rounded-lg hover:bg-[var(--color-text-secondary)] transition-colors"
        >
          + Create Batch
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <SummaryCard label="Total Batches" value={String(totalBatches)} />
        <SummaryCard
          label="Pending"
          value={String(pendingCount)}
          accent={pendingCount > 0 ? "amber" : undefined}
        />
        <SummaryCard
          label="Disputed"
          value={String(disputedCount)}
          accent={disputedCount > 0 ? "red" : undefined}
        />
        <SummaryCard
          label="Total Mismatch"
          value={peso(totalMismatch)}
          accent={totalMismatch > 0 ? "red" : undefined}
        />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-[var(--color-border-primary)] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
        >
          <option value="">All Statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </select>

        <select
          value={courierFilter}
          onChange={(e) => setCourierFilter(e.target.value)}
          className="border border-[var(--color-border-primary)] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
        >
          <option value="">All Couriers</option>
          {uniqueCouriers.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        {(statusFilter || courierFilter) && (
          <button
            onClick={() => {
              setStatusFilter("");
              setCourierFilter("");
            }}
            className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Batch List */}
      {loading ? (
        <div className="text-center py-16 text-[var(--color-text-tertiary)] text-sm">Loading...</div>
      ) : batches.length === 0 ? (
        <div className="bg-[var(--color-bg-secondary)] rounded-[var(--radius-lg)] p-12 text-center">
          <p className="text-sm text-[var(--color-text-tertiary)]">No remittance batches found.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {batches.map((batch) => {
            const isExpanded = expandedBatchId === batch.id;
            const mismatch = Number(batch.mismatch_amount) || 0;
            const hasMismatch = mismatch !== 0;
            const badgeClass =
              STATUS_BADGE[batch.status] ?? "bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] border-[var(--color-border-primary)]";

            return (
              <div
                key={batch.id}
                className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] overflow-hidden"
              >
                {/* Batch card header */}
                <button
                  onClick={() => toggleExpand(batch.id)}
                  className="w-full text-left p-4 hover:bg-[var(--color-surface-hover)] transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                          {batch.batch_name}
                        </h3>
                        <span
                          className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full border ${badgeClass}`}
                        >
                          {statusLabel(batch.status)}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                        {batch.courier_name}
                        {batch.settlement_date && (
                          <span className="ml-3">
                            Settlement:{" "}
                            {format(parseISO(batch.settlement_date), "d MMM yyyy")}
                          </span>
                        )}
                      </p>
                    </div>

                    {/* Amounts */}
                    <div className="text-right shrink-0">
                      <div className="flex items-center gap-4 text-xs">
                        <div>
                          <p className="text-[var(--color-text-tertiary)]">Expected</p>
                          <p className="font-semibold text-[var(--color-text-primary)]">
                            {peso(batch.total_expected)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[var(--color-text-tertiary)]">Received</p>
                          <p className="font-semibold text-[var(--color-text-primary)]">
                            {peso(batch.total_received)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[var(--color-text-tertiary)]">Mismatch</p>
                          <p
                            className={`font-semibold ${
                              hasMismatch ? "text-[var(--color-error)]" : "text-[var(--color-success)]"
                            }`}
                          >
                            {peso(mismatch)}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Expand indicator */}
                    <span className="text-[var(--color-text-tertiary)] text-sm mt-1">
                      {isExpanded ? "\u25B2" : "\u25BC"}
                    </span>
                  </div>

                  {/* Footer row */}
                  <div className="flex items-center justify-between mt-2 text-[11px] text-[var(--color-text-tertiary)]">
                    <span>By {profileName(batch.creator)}</span>
                    <span>
                      {format(parseISO(batch.created_at), "d MMM yyyy, h:mm a")}
                    </span>
                  </div>
                </button>

                {/* Batch actions row */}
                <div className="px-4 pb-2 flex items-center gap-2 flex-wrap">
                  <select
                    value={batch.status}
                    onChange={(e) => updateBatchStatus(batch.id, e.target.value)}
                    className="text-xs border border-[var(--color-border-primary)] rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {statusLabel(s)}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleDeleteBatch(batch.id)}
                    className="text-xs text-[var(--color-text-tertiary)] hover:text-red-400 ml-auto"
                  >
                    Delete
                  </button>
                </div>

                {/* Expanded: items table */}
                {isExpanded && (
                  <div className="border-t border-[var(--color-border-secondary)] p-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
                        Items
                      </p>
                      <button
                        onClick={() => openItemModal(batch.id)}
                        className="text-xs bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] px-3 py-1 rounded-lg hover:bg-[var(--color-border-primary)] transition-colors font-medium"
                      >
                        + Add Item
                      </button>
                    </div>

                    {itemsLoading ? (
                      <div className="text-center py-6 text-[var(--color-text-tertiary)] text-xs">
                        Loading items...
                      </div>
                    ) : batchItems.length === 0 ? (
                      <div className="text-center py-6 text-[var(--color-text-tertiary)] text-xs">
                        No items yet. Add one to start reconciling.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-[11px] text-[var(--color-text-tertiary)] uppercase tracking-wider border-b border-[var(--color-border-secondary)]">
                              <th className="text-left py-2 pr-3 font-medium">
                                Order #
                              </th>
                              <th className="text-right py-2 px-3 font-medium">
                                Expected
                              </th>
                              <th className="text-right py-2 px-3 font-medium">
                                Received
                              </th>
                              <th className="text-center py-2 px-3 font-medium">
                                Matched
                              </th>
                              <th className="text-left py-2 px-3 font-medium">
                                Notes
                              </th>
                              <th className="text-right py-2 pl-3 font-medium">
                                Actions
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {batchItems.map((item) => {
                              const isEditing = editingItemId === item.id;
                              const unmatched =
                                !item.is_matched &&
                                item.received_amount !== null &&
                                Number(item.received_amount) !==
                                  Number(item.expected_amount);

                              return (
                                <tr
                                  key={item.id}
                                  className={`border-b border-[var(--color-border-secondary)] ${
                                    unmatched ? "bg-[var(--color-error-light)]" : ""
                                  }`}
                                >
                                  <td className="py-2 pr-3">
                                    <span className="font-mono text-xs">
                                      {item.order?.order_number ?? "--"}
                                    </span>
                                  </td>
                                  <td className="py-2 px-3 text-right font-medium">
                                    {peso(item.expected_amount)}
                                  </td>
                                  <td className="py-2 px-3 text-right">
                                    {isEditing ? (
                                      <input
                                        type="number"
                                        step="0.01"
                                        value={editReceivedAmount}
                                        onChange={(e) =>
                                          setEditReceivedAmount(e.target.value)
                                        }
                                        className="w-24 border border-[var(--color-border-primary)] rounded px-2 py-1 text-xs text-right focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                                      />
                                    ) : (
                                      <span
                                        className={
                                          unmatched
                                            ? "text-[var(--color-error)] font-semibold"
                                            : ""
                                        }
                                      >
                                        {peso(item.received_amount)}
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-2 px-3 text-center">
                                    <input
                                      type="checkbox"
                                      checked={item.is_matched}
                                      onChange={() => toggleMatched(item)}
                                      className="rounded border-[var(--color-border-primary)] text-[var(--color-success)] focus:ring-green-500"
                                    />
                                  </td>
                                  <td className="py-2 px-3">
                                    {isEditing ? (
                                      <input
                                        type="text"
                                        value={editItemNotes}
                                        onChange={(e) =>
                                          setEditItemNotes(e.target.value)
                                        }
                                        className="w-full border border-[var(--color-border-primary)] rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                                      />
                                    ) : (
                                      <span className="text-xs text-[var(--color-text-secondary)]">
                                        {item.notes ?? ""}
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-2 pl-3 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                      {isEditing ? (
                                        <>
                                          <button
                                            onClick={() => saveEditItem(item)}
                                            className="text-xs text-[var(--color-success)] hover:text-green-800 font-medium"
                                          >
                                            Save
                                          </button>
                                          <button
                                            onClick={() =>
                                              setEditingItemId(null)
                                            }
                                            className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
                                          >
                                            Cancel
                                          </button>
                                        </>
                                      ) : (
                                        <>
                                          <button
                                            onClick={() => startEditItem(item)}
                                            className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]"
                                          >
                                            Edit
                                          </button>
                                          <button
                                            onClick={() =>
                                              handleDeleteItem(item.id)
                                            }
                                            className="text-xs text-[var(--color-text-tertiary)] hover:text-red-400"
                                          >
                                            Del
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Toast toast={toast} onDismiss={() => setToast(null)} />

      {/* Create Batch Modal */}
      {showBatchModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--color-bg-primary)] rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4">
              Create Remittance Batch
            </h2>
            <form onSubmit={handleCreateBatch} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">
                  Batch Name *
                </label>
                <input
                  type="text"
                  required
                  value={batchForm.batch_name}
                  onChange={(e) =>
                    setBatchForm((f) => ({ ...f, batch_name: e.target.value }))
                  }
                  placeholder="e.g. J&T Week 15 Remittance"
                  className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">
                  Courier Name *
                </label>
                <input
                  type="text"
                  required
                  value={batchForm.courier_name}
                  onChange={(e) =>
                    setBatchForm((f) => ({ ...f, courier_name: e.target.value }))
                  }
                  placeholder="e.g. J&T Express"
                  className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">
                  Total Expected Amount
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={batchForm.total_expected}
                  onChange={(e) =>
                    setBatchForm((f) => ({ ...f, total_expected: e.target.value }))
                  }
                  placeholder="0.00"
                  className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">
                  Notes
                </label>
                <textarea
                  rows={2}
                  value={batchForm.notes}
                  onChange={(e) =>
                    setBatchForm((f) => ({ ...f, notes: e.target.value }))
                  }
                  placeholder="Optional notes..."
                  className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowBatchModal(false)}
                  className="flex-1 border border-[var(--color-border-primary)] text-[var(--color-text-primary)] text-sm py-2 rounded-lg hover:bg-[var(--color-surface-hover)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-[var(--color-text-primary)] text-white text-sm py-2 rounded-lg hover:bg-[var(--color-text-secondary)] disabled:opacity-50"
                >
                  {saving ? "Creating..." : "Create Batch"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Item Modal */}
      {showItemModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--color-bg-primary)] rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4">
              Add Remittance Item
            </h2>
            <form onSubmit={handleCreateItem} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">
                    Order ID
                  </label>
                  <input
                    type="text"
                    value={itemForm.order_id}
                    onChange={(e) =>
                      setItemForm((f) => ({ ...f, order_id: e.target.value }))
                    }
                    placeholder="UUID (optional)"
                    className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">
                    Dispatch ID
                  </label>
                  <input
                    type="text"
                    value={itemForm.dispatch_id}
                    onChange={(e) =>
                      setItemForm((f) => ({ ...f, dispatch_id: e.target.value }))
                    }
                    placeholder="UUID (optional)"
                    className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">
                    Expected Amount *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={itemForm.expected_amount}
                    onChange={(e) =>
                      setItemForm((f) => ({
                        ...f,
                        expected_amount: e.target.value,
                      }))
                    }
                    placeholder="0.00"
                    className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">
                    Received Amount
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={itemForm.received_amount}
                    onChange={(e) =>
                      setItemForm((f) => ({
                        ...f,
                        received_amount: e.target.value,
                      }))
                    }
                    placeholder="0.00 (optional)"
                    className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">
                  Notes
                </label>
                <textarea
                  rows={2}
                  value={itemForm.notes}
                  onChange={(e) =>
                    setItemForm((f) => ({ ...f, notes: e.target.value }))
                  }
                  placeholder="Optional notes..."
                  className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowItemModal(false)}
                  className="flex-1 border border-[var(--color-border-primary)] text-[var(--color-text-primary)] text-sm py-2 rounded-lg hover:bg-[var(--color-surface-hover)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-[var(--color-text-primary)] text-white text-sm py-2 rounded-lg hover:bg-[var(--color-text-secondary)] disabled:opacity-50"
                >
                  {saving ? "Adding..." : "Add Item"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Summary Card ─────────────────────────────────────────── */

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "amber" | "red" | "green" | "blue";
}) {
  const accentColors = {
    amber: "text-[var(--color-warning)]",
    red: "text-[var(--color-error)]",
    green: "text-[var(--color-success)]",
    blue: "text-[var(--color-accent)]",
  };
  return (
    <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] px-4 py-3">
      <p className="text-xs text-[var(--color-text-secondary)]">{label}</p>
      <p
        className={`text-2xl font-semibold mt-1 ${
          accent ? accentColors[accent] : "text-[var(--color-text-primary)]"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
