"use client";

import { useState, useMemo, useCallback, useEffect, Fragment } from "react";
import { useToast, Toast } from "@/components/ui/toast";
import { ItemTimeline } from "./item-timeline";

/* ---------- types ---------- */

type CatalogItem = {
  id: string;
  sku: string;
  product_name: string;
  color: string | null;
  size: string | null;
  product_family: string | null;
};

type InventoryRecord = {
  id: string;
  catalog_item_id: string;
  available_qty: number;
  reserved_qty: number;
  damaged_qty: number;
  catalog: CatalogItem | null;
};

type Movement = {
  id: string;
  catalog_item_id: string;
  adjustment_type: string;
  quantity: number;
  notes: string | null;
  performed_by: string | null;
  created_at: string;
};

const ADJUSTMENT_TYPES = [
  "received",
  "dispatched",
  "returned",
  "damaged",
  "correction",
  "reserved",
  "released",
] as const;

type AdjustmentType = (typeof ADJUSTMENT_TYPES)[number];

const ADJUSTMENT_LABELS: Record<AdjustmentType, string> = {
  received: "Received",
  dispatched: "Dispatched",
  returned: "Returned",
  damaged: "Damaged",
  correction: "Correction",
  reserved: "Reserved",
  released: "Released",
};

const ADJUSTMENT_COLORS: Record<AdjustmentType, string> = {
  received: "bg-[var(--color-success-light)] text-[var(--color-success)]",
  dispatched: "bg-orange-100 text-orange-700",
  returned: "bg-[var(--color-accent-light)] text-[var(--color-accent)]",
  damaged: "bg-[var(--color-error-light)] text-[var(--color-error)]",
  correction: "bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)]",
  reserved: "bg-purple-100 text-purple-700",
  released: "bg-cyan-100 text-cyan-700",
};

/* ---------- helpers ---------- */

function availColor(qty: number): string {
  if (qty === 0) return "text-[var(--color-error)] font-semibold";
  if (qty < 5) return "text-[var(--color-warning)] font-medium";
  return "text-[var(--color-success)]";
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ---------- adjust stock modal ---------- */

function AdjustModal({
  record,
  onClose,
  onSubmitted,
}: {
  record: InventoryRecord;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [type, setType] = useState<AdjustmentType>("received");
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const qty = Number(quantity);
    if (!qty || qty <= 0) {
      setError("Quantity must be greater than 0");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/operations/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          catalog_item_id: record.catalog_item_id,
          adjustment_type: type,
          quantity: qty,
          notes: notes || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error ?? "Failed to adjust stock");
      }
      onSubmitted();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--color-bg-primary)] rounded-2xl p-6 w-full max-w-md">
        <h2 className="text-base font-semibold text-[var(--color-text-primary)] mb-1">
          Adjust Stock
        </h2>
        <p className="text-sm text-[var(--color-text-secondary)] mb-4">
          {record.catalog?.product_name ?? "Unknown"}{" "}
          <span className="text-[var(--color-text-tertiary)]">
            ({record.catalog?.sku ?? "—"})
          </span>
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-[var(--color-text-secondary)] mb-1">
              Adjustment Type
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as AdjustmentType)}
              className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            >
              {ADJUSTMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ADJUSTMENT_LABELS[t]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-[var(--color-text-secondary)] mb-1">
              Quantity
            </label>
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="Enter quantity"
              className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              required
            />
          </div>

          <div>
            <label className="block text-xs text-[var(--color-text-secondary)] mb-1">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes..."
              rows={3}
              className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] resize-none"
            />
          </div>

          {error && (
            <p className="text-sm text-[var(--color-error)]">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-[var(--color-text-inverted)] bg-[var(--color-text-primary)] hover:bg-[var(--color-text-secondary)] rounded-lg disabled:opacity-50"
            >
              {submitting ? "Saving..." : "Submit Adjustment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ---------- movement history panel ---------- */

function MovementHistory({ catalogItemId }: { catalogItemId: string }) {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(
      `/api/operations/inventory?movements=true&catalog_item_id=${catalogItemId}`
    )
      .then((r) => r.json())
      .then((body) => {
        if (!cancelled) setMovements(body.data ?? []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [catalogItemId]);

  if (loading) {
    return (
      <div className="px-4 py-3 text-sm text-[var(--color-text-tertiary)]">
        Loading movements...
      </div>
    );
  }

  if (movements.length === 0) {
    return (
      <div className="px-4 py-3 text-sm text-[var(--color-text-tertiary)]">
        No movements recorded.
      </div>
    );
  }

  return (
    <div className="px-4 py-3">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-[var(--color-text-tertiary)] text-left">
            <th className="pb-1 font-medium">Date</th>
            <th className="pb-1 font-medium">Type</th>
            <th className="pb-1 font-medium text-right">Qty</th>
            <th className="pb-1 font-medium">Notes</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-border-secondary)]">
          {movements.map((m) => (
            <tr key={m.id}>
              <td className="py-1.5 text-[var(--color-text-secondary)]">{fmtDate(m.created_at)}</td>
              <td className="py-1.5">
                <span
                  className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${
                    ADJUSTMENT_COLORS[m.adjustment_type as AdjustmentType] ??
                    "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]"
                  }`}
                >
                  {ADJUSTMENT_LABELS[m.adjustment_type as AdjustmentType] ??
                    m.adjustment_type}
                </span>
              </td>
              <td className="py-1.5 text-right font-mono">{m.quantity}</td>
              <td className="py-1.5 text-[var(--color-text-tertiary)] truncate max-w-[200px]">
                {m.notes ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- main view ---------- */

export default function InventoryView({
  records: initialRecords,
}: {
  records: InventoryRecord[];
}) {
  const { toast, setToast } = useToast();
  const [records, setRecords] = useState<InventoryRecord[]>(initialRecords);
  const [search, setSearch] = useState("");
  const [adjusting, setAdjusting] = useState<InventoryRecord | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [timelineItem, setTimelineItem] = useState<{ id: string; label: string } | null>(null);

  const fetchRecords = useCallback(async () => {
    const res = await fetch("/api/operations/inventory");
    if (res.ok) {
      const json = await res.json();
      setRecords(json.data ?? []);
    }
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return records;
    const q = search.toLowerCase();
    return records.filter((r) => {
      const name = r.catalog?.product_name?.toLowerCase() ?? "";
      const sku = r.catalog?.sku?.toLowerCase() ?? "";
      return name.includes(q) || sku.includes(q);
    });
  }, [records, search]);

  // Summary stats
  const totalSkus = records.length;
  const lowStock = records.filter(
    (r) => r.available_qty > 0 && r.available_qty < 5
  ).length;
  const outOfStock = records.filter((r) => r.available_qty === 0).length;
  const totalReserved = records.reduce((sum, r) => sum + (r.reserved_qty ?? 0), 0);

  const handleAdjusted = useCallback(() => {
    setAdjusting(null);
    setToast({ message: "Stock adjusted", type: "success" });
    fetchRecords();
  }, [fetchRecords, setToast]);

  const toggleExpand = useCallback(
    (id: string) => setExpandedId((prev) => (prev === id ? null : id)),
    []
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">Inventory</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          Stock levels, adjustments, and movement history
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-[var(--color-bg-primary)] rounded-[var(--radius-lg)] border border-[var(--color-border-secondary)] p-4">
          <p className="text-xs text-[var(--color-text-tertiary)] mb-1">Total SKUs</p>
          <p className="text-2xl font-semibold text-[var(--color-text-primary)]">{totalSkus}</p>
        </div>
        <div className="bg-[var(--color-bg-primary)] rounded-[var(--radius-lg)] border border-[var(--color-border-secondary)] p-4">
          <p className="text-xs text-[var(--color-text-tertiary)] mb-1">Low Stock</p>
          <p className="text-2xl font-semibold text-[var(--color-warning)]">{lowStock}</p>
        </div>
        <div className="bg-[var(--color-bg-primary)] rounded-[var(--radius-lg)] border border-[var(--color-border-secondary)] p-4">
          <p className="text-xs text-[var(--color-text-tertiary)] mb-1">Out of Stock</p>
          <p className="text-2xl font-semibold text-[var(--color-error)]">{outOfStock}</p>
        </div>
        <div className="bg-[var(--color-bg-primary)] rounded-[var(--radius-lg)] border border-[var(--color-border-secondary)] p-4">
          <p className="text-xs text-[var(--color-text-tertiary)] mb-1">Total Reserved</p>
          <p className="text-2xl font-semibold text-purple-600">
            {totalReserved}
          </p>
        </div>
      </div>

      {/* Search bar */}
      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by product name or SKU..."
          className="w-full bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] px-4 py-2.5 pl-10 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
        />
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-tertiary)]"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </div>

      {/* Inventory table */}
      <div className="bg-[var(--color-bg-primary)] rounded-[var(--radius-lg)] border border-[var(--color-border-secondary)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border-secondary)] text-left">
                <th className="px-4 py-3 text-xs font-medium text-[var(--color-text-tertiary)]">
                  SKU
                </th>
                <th className="px-4 py-3 text-xs font-medium text-[var(--color-text-tertiary)]">
                  Product
                </th>
                <th className="px-4 py-3 text-xs font-medium text-[var(--color-text-tertiary)]">
                  Color / Size
                </th>
                <th className="px-4 py-3 text-xs font-medium text-[var(--color-text-tertiary)] text-right">
                  Available
                </th>
                <th className="px-4 py-3 text-xs font-medium text-[var(--color-text-tertiary)] text-right">
                  Reserved
                </th>
                <th className="px-4 py-3 text-xs font-medium text-[var(--color-text-tertiary)] text-right">
                  Damaged
                </th>
                <th className="px-4 py-3 text-xs font-medium text-[var(--color-text-tertiary)] text-right">
                  Total
                </th>
                <th className="px-4 py-3 text-xs font-medium text-[var(--color-text-tertiary)]" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-secondary)]">
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-12 text-center text-[var(--color-text-tertiary)]"
                  >
                    {search
                      ? "No items match your search."
                      : "No inventory records found."}
                  </td>
                </tr>
              )}
              {filtered.map((r) => {
                const total =
                  (r.available_qty ?? 0) +
                  (r.reserved_qty ?? 0) +
                  (r.damaged_qty ?? 0);
                const isExpanded = expandedId === r.id;

                return (
                  <Fragment key={r.id}>
                    <tr
                      className="hover:bg-[var(--color-surface-hover)]/50 cursor-pointer transition-colors"
                      onClick={() => toggleExpand(r.id)}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-[var(--color-text-secondary)]">
                        {r.catalog?.sku ?? "—"}
                      </td>
                      <td className="px-4 py-3 font-medium text-[var(--color-text-primary)]">
                        {r.catalog?.product_name ?? "Unknown"}
                        {r.catalog?.product_family && (
                          <span className="ml-2 text-[10px] px-1.5 py-0.5 bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] rounded-full">
                            {r.catalog.product_family}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                        {[r.catalog?.color, r.catalog?.size]
                          .filter(Boolean)
                          .join(" / ") || "—"}
                      </td>
                      <td
                        className={`px-4 py-3 text-right tabular-nums ${availColor(
                          r.available_qty ?? 0
                        )}`}
                      >
                        {r.available_qty ?? 0}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-purple-600">
                        {r.reserved_qty ?? 0}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-[var(--color-error)]">
                        {r.damaged_qty ?? 0}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium text-[var(--color-text-primary)]">
                        {total}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setTimelineItem({
                                id: r.id,
                                label: r.catalog?.product_name
                                  ? `${r.catalog.product_name}${r.catalog.sku ? ` (${r.catalog.sku})` : ""}`
                                  : r.id,
                              });
                            }}
                            className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] px-2 py-1 rounded-lg hover:bg-[var(--color-surface-active)] transition-colors"
                          >
                            History
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setAdjusting(r);
                            }}
                            className="text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] px-2.5 py-1 rounded-lg hover:bg-[var(--color-surface-active)] transition-colors"
                          >
                            Adjust
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={8} className="bg-[var(--color-bg-secondary)]/50">
                          <MovementHistory
                            catalogItemId={r.catalog_item_id}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Toast toast={toast} onDismiss={() => setToast(null)} />

      {/* Adjust stock modal */}
      {adjusting && (
        <AdjustModal
          record={adjusting}
          onClose={() => setAdjusting(null)}
          onSubmitted={handleAdjusted}
        />
      )}

      {/* Item timeline modal */}
      {timelineItem && (
        <ItemTimeline
          recordId={timelineItem.id}
          tableName="inventory_records"
          itemLabel={timelineItem.label}
          onClose={() => setTimelineItem(null)}
        />
      )}
    </div>
  );
}
