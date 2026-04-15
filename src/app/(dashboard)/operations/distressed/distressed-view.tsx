"use client";

import { useState, useEffect, useCallback } from "react";
import { format, parseISO } from "date-fns";
import { useToast, Toast } from "@/components/ui/toast";

/* ─── Types ────────────────────────────────────────────────── */

type Profile = { id: string; first_name: string; last_name: string };

type DistressedParcel = {
  id: string;
  condition: string;
  order_id: string | null;
  dispatch_id: string | null;
  tracking_number: string | null;
  issue_reason: string | null;
  courier_notes: string | null;
  action_needed: string | null;
  created_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  order: { id: string; order_number: string; customer_name: string | null } | null;
  creator: Profile | null;
};

type Props = {
  initialParcels: DistressedParcel[];
  currentUserId: string;
};

/* ─── Constants ────────────────────────────────────────────── */

const CONDITIONS = [
  "stuck",
  "returned",
  "damaged",
  "lost",
  "rts",
  "pending_redelivery",
  "resolved",
] as const;

const CONDITION_BADGE: Record<string, string> = {
  stuck:               "bg-[var(--color-warning-light)] text-[var(--color-warning-text)] border-[var(--color-border-primary)]",
  returned:            "bg-[var(--color-accent-light)] text-[var(--color-accent)] border-[var(--color-accent)]",
  damaged:             "bg-[var(--color-error-light)] text-red-800 border-red-200",
  lost:                "bg-[var(--color-error-light)] text-red-800 border-red-200",
  rts:                 "bg-purple-100 text-purple-800 border-purple-200",
  pending_redelivery:  "bg-yellow-100 text-yellow-800 border-yellow-200",
  resolved:            "bg-[var(--color-success-light)] text-green-800 border-green-200",
};

function conditionLabel(c: string) {
  return c.replace(/_/g, " ").replace(/\brts\b/i, "RTS").replace(/\b\w/g, (l) => l.toUpperCase());
}

function profileName(p: Profile | null) {
  if (!p) return "Unknown";
  return `${p.first_name} ${p.last_name}`;
}

/* ─── Component ────────────────────────────────────────────── */

export function DistressedView({ initialParcels, currentUserId }: Props) {
  const { toast, setToast } = useToast();
  const [parcels, setParcels] = useState<DistressedParcel[]>(initialParcels);
  const [loading, setLoading] = useState(false);

  // Filters
  const [conditionFilter, setConditionFilter] = useState("");
  const [showResolved, setShowResolved] = useState(false);

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);

  // Create form
  const [form, setForm] = useState({
    condition: "stuck",
    order_id: "",
    dispatch_id: "",
    tracking_number: "",
    issue_reason: "",
    courier_notes: "",
    action_needed: "",
  });

  /* ─── Fetch ──────────────────────────────────────────────── */

  const fetchParcels = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (conditionFilter) params.set("condition", conditionFilter);
    if (!showResolved) params.set("resolved", "false");

    const res = await fetch(`/api/operations/distressed?${params}`);
    if (res.ok) {
      const json = await res.json();
      setParcels(json.data ?? []);
    }
    setLoading(false);
  }, [conditionFilter, showResolved]);

  useEffect(() => {
    // Re-fetch when filters change; use SSR data for initial unresolved view
    if (conditionFilter || showResolved) {
      fetchParcels();
    } else {
      // Default: show unresolved only from initial data
      setParcels(initialParcels.filter((p) => !p.resolved_at));
    }
  }, [conditionFilter, showResolved, fetchParcels, initialParcels]);

  /* ─── Resolve ────────────────────────────────────────────── */

  async function handleResolve(id: string) {
    setParcels(prev => prev.map(p => p.id === id ? { ...p, condition: "resolved", resolved_at: new Date().toISOString() } : p));
    await fetch("/api/operations/distressed", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, condition: "resolved" }),
    });
    setToast({ message: "Parcel marked as resolved", type: "success" });
    fetchParcels();
  }

  /* ─── Create ─────────────────────────────────────────────── */

  function openCreate() {
    setForm({
      condition: "stuck",
      order_id: "",
      dispatch_id: "",
      tracking_number: "",
      issue_reason: "",
      courier_notes: "",
      action_needed: "",
    });
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const payload = {
      condition: form.condition,
      order_id: form.order_id || null,
      dispatch_id: form.dispatch_id || null,
      tracking_number: form.tracking_number || null,
      issue_reason: form.issue_reason || null,
      courier_notes: form.courier_notes || null,
      action_needed: form.action_needed || null,
    };

    const res = await fetch("/api/operations/distressed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      setShowModal(false);
      setToast({ message: "Parcel reported", type: "success" });
      fetchParcels();
    }
    setSaving(false);
  }

  /* ─── Delete ─────────────────────────────────────────────── */

  async function handleDelete(id: string) {
    if (!confirm("Delete this distressed parcel record?")) return;
    setParcels(prev => prev.filter(p => p.id !== id));
    await fetch(`/api/operations/distressed?id=${id}`, { method: "DELETE" });
    setToast({ message: "Parcel record deleted", type: "success" });
    fetchParcels();
  }

  /* ─── Summary Stats ──────────────────────────────────────── */

  const unresolved = parcels.filter((p) => !p.resolved_at).length;
  const stuck = parcels.filter((p) => p.condition === "stuck").length;
  const returnedRts = parcels.filter((p) => p.condition === "returned" || p.condition === "rts").length;
  const damagedLost = parcels.filter((p) => p.condition === "damaged" || p.condition === "lost").length;

  /* ─── Render ─────────────────────────────────────────────── */

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">Distressed Parcels</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            {parcels.length} parcel{parcels.length !== 1 ? "s" : ""} shown
          </p>
        </div>
        <button
          onClick={openCreate}
          className="bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] text-sm px-4 py-2 rounded-lg hover:bg-[var(--color-text-secondary)] transition-colors"
        >
          + Report Parcel
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <SummaryCard label="Total Unresolved" value={unresolved} accent={unresolved > 0 ? "red" : undefined} />
        <SummaryCard label="Stuck" value={stuck} accent={stuck > 0 ? "amber" : undefined} />
        <SummaryCard label="Returned / RTS" value={returnedRts} accent={returnedRts > 0 ? "blue" : undefined} />
        <SummaryCard label="Damaged / Lost" value={damagedLost} accent={damagedLost > 0 ? "red" : undefined} />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <select
          value={conditionFilter}
          onChange={(e) => setConditionFilter(e.target.value)}
          className="border border-[var(--color-border-primary)] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
        >
          <option value="">All Conditions</option>
          {CONDITIONS.filter((c) => c !== "resolved").map((c) => (
            <option key={c} value={c}>{conditionLabel(c)}</option>
          ))}
        </select>

        <label className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)] cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showResolved}
            onChange={(e) => setShowResolved(e.target.checked)}
            className="rounded border-[var(--color-border-primary)] text-[var(--color-text-primary)] focus:ring-[var(--color-accent)]"
          />
          Show resolved
        </label>

        {(conditionFilter || showResolved) && (
          <button
            onClick={() => { setConditionFilter(""); setShowResolved(false); }}
            className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Card Queue */}
      {loading ? (
        <div className="text-center py-16 text-[var(--color-text-tertiary)] text-sm">Loading...</div>
      ) : parcels.length === 0 ? (
        <div className="bg-[var(--color-bg-secondary)] rounded-[var(--radius-lg)] p-12 text-center">
          <p className="text-sm text-[var(--color-text-tertiary)]">No distressed parcels found.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {parcels.map((parcel) => (
            <ParcelCard
              key={parcel.id}
              parcel={parcel}
              onResolve={() => handleResolve(parcel.id)}
              onDelete={() => handleDelete(parcel.id)}
            />
          ))}
        </div>
      )}

      <Toast toast={toast} onDismiss={() => setToast(null)} />

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--color-bg-primary)] rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4">Report Distressed Parcel</h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">Condition *</label>
                <select
                  required
                  value={form.condition}
                  onChange={(e) => setForm((f) => ({ ...f, condition: e.target.value }))}
                  className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                >
                  {CONDITIONS.filter((c) => c !== "resolved").map((c) => (
                    <option key={c} value={c}>{conditionLabel(c)}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">Order ID</label>
                  <input
                    type="text"
                    value={form.order_id}
                    onChange={(e) => setForm((f) => ({ ...f, order_id: e.target.value }))}
                    placeholder="UUID (optional)"
                    className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">Dispatch ID</label>
                  <input
                    type="text"
                    value={form.dispatch_id}
                    onChange={(e) => setForm((f) => ({ ...f, dispatch_id: e.target.value }))}
                    placeholder="UUID (optional)"
                    className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">Tracking Number</label>
                <input
                  type="text"
                  value={form.tracking_number}
                  onChange={(e) => setForm((f) => ({ ...f, tracking_number: e.target.value }))}
                  className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">Issue Reason</label>
                <textarea
                  rows={2}
                  value={form.issue_reason}
                  onChange={(e) => setForm((f) => ({ ...f, issue_reason: e.target.value }))}
                  placeholder="Describe what happened..."
                  className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">Courier Notes</label>
                <textarea
                  rows={2}
                  value={form.courier_notes}
                  onChange={(e) => setForm((f) => ({ ...f, courier_notes: e.target.value }))}
                  placeholder="Notes from courier..."
                  className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">Action Needed</label>
                <input
                  type="text"
                  value={form.action_needed}
                  onChange={(e) => setForm((f) => ({ ...f, action_needed: e.target.value }))}
                  placeholder="e.g. Redeliver, Refund, Contact customer"
                  className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
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
                  className="flex-1 bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] text-sm py-2 rounded-lg hover:bg-[var(--color-text-secondary)] disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Report Parcel"}
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

function SummaryCard({ label, value, accent }: { label: string; value: number; accent?: "amber" | "red" | "green" | "blue" }) {
  const accentColors = {
    amber: "text-[var(--color-warning)]",
    red: "text-[var(--color-error)]",
    green: "text-[var(--color-success)]",
    blue: "text-[var(--color-accent)]",
  };
  return (
    <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] px-4 py-3">
      <p className="text-xs text-[var(--color-text-secondary)]">{label}</p>
      <p className={`text-2xl font-semibold mt-1 ${accent ? accentColors[accent] : "text-[var(--color-text-primary)]"}`}>
        {value}
      </p>
    </div>
  );
}

/* ─── Parcel Card ──────────────────────────────────────────── */

function ParcelCard({
  parcel,
  onResolve,
  onDelete,
}: {
  parcel: DistressedParcel;
  onResolve: () => void;
  onDelete: () => void;
}) {
  const isResolved = parcel.condition === "resolved" || !!parcel.resolved_at;
  const badgeClass = CONDITION_BADGE[parcel.condition] ?? "bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] border-[var(--color-border-primary)]";

  return (
    <div className={`bg-[var(--color-bg-primary)] border rounded-[var(--radius-lg)] p-4 flex flex-col gap-3 ${isResolved ? "border-[var(--color-border-secondary)] opacity-60" : "border-[var(--color-border-primary)]"}`}>
      {/* Header: badge + actions */}
      <div className="flex items-start justify-between gap-2">
        <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full border ${badgeClass}`}>
          {conditionLabel(parcel.condition)}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          {!isResolved && (
            <button
              onClick={onResolve}
              className="text-xs bg-[var(--color-success-light)] text-[var(--color-success)] px-2.5 py-1 rounded-full hover:bg-[var(--color-success-light)] transition-colors font-medium"
            >
              Resolve
            </button>
          )}
          <button
            onClick={onDelete}
            className="text-xs text-[var(--color-text-tertiary)] hover:text-red-400"
          >
            Del
          </button>
        </div>
      </div>

      {/* Order + Tracking */}
      <div className="space-y-1">
        {parcel.order && (
          <p className="text-sm text-[var(--color-text-primary)]">
            <span className="font-mono text-xs font-medium">{parcel.order.order_number}</span>
            {parcel.order.customer_name && (
              <span className="text-[var(--color-text-secondary)] ml-1.5">- {parcel.order.customer_name}</span>
            )}
          </p>
        )}
        {parcel.tracking_number && (
          <p className="text-xs text-[var(--color-text-secondary)]">
            Tracking: <span className="font-mono font-medium text-[var(--color-text-primary)]">{parcel.tracking_number}</span>
          </p>
        )}
      </div>

      {/* Issue reason */}
      {parcel.issue_reason && (
        <div>
          <p className="text-[10px] font-medium text-[var(--color-text-tertiary)] uppercase">Issue</p>
          <p className="text-sm text-[var(--color-text-primary)] mt-0.5">{parcel.issue_reason}</p>
        </div>
      )}

      {/* Courier notes */}
      {parcel.courier_notes && (
        <div>
          <p className="text-[10px] font-medium text-[var(--color-text-tertiary)] uppercase">Courier Notes</p>
          <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">{parcel.courier_notes}</p>
        </div>
      )}

      {/* Action needed — highlighted */}
      {parcel.action_needed && (
        <div className="bg-[var(--color-warning-light)] border border-amber-100 rounded-lg px-3 py-2">
          <p className="text-[10px] font-medium text-[var(--color-warning)] uppercase">Action Needed</p>
          <p className="text-sm font-medium text-amber-900 mt-0.5">{parcel.action_needed}</p>
        </div>
      )}

      {/* Footer: creator + date */}
      <div className="flex items-center justify-between pt-1 border-t border-[var(--color-border-secondary)] text-[11px] text-[var(--color-text-tertiary)] mt-auto">
        <span>{profileName(parcel.creator)}</span>
        <span>{format(parseISO(parcel.created_at), "d MMM yyyy, h:mm a")}</span>
      </div>
    </div>
  );
}
