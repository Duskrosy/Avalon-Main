"use client";

// src/app/(dashboard)/cs/admin/quarantine/quarantine-view.tsx
//
// Interactive client component for the admin intake quarantine surface.
// Two tabs:
//   - Quarantine: orders the classifier couldn't categorise. Admins
//     assign a lane and resolve them.
//   - Disputes:   log of webhook vs reconciler disagreements for
//     classifier tuning.

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";

// ── Types ──────────────────────────────────────────────────────────────────

type ValidLane = "sales" | "shopify_admin" | "conversion";

type OrderStub = {
  id: number;
  shopify_order_id: string | null;
  shopify_order_name: string | null;
  final_total_amount: number;
  created_at: string;
  intake_lane: string | null;
};

type QuarantineRow = {
  id: number;
  order_id: number;
  classified_at: string;
  resolved_at: string | null;
  resolved_lane: string | null;
  resolved_by: string | null;
  order: OrderStub | null;
  // shopify_payload_snapshot intentionally omitted — not returned by API.
};

type DisputeOrderStub = Omit<OrderStub, "intake_lane">;

type DisputeRow = {
  id: number;
  order_id: number;
  winner_lane: string;
  loser_lane: string;
  source_winner: string;
  source_loser: string;
  recorded_at: string;
  order: DisputeOrderStub | null;
};

type Tab = "quarantine" | "disputes";
type StatusFilter = "pending" | "resolved";

// ── Component ──────────────────────────────────────────────────────────────

export function QuarantineView() {
  const [tab, setTab] = useState<Tab>("quarantine");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");

  const [quarantineRows, setQuarantineRows] = useState<QuarantineRow[]>([]);
  const [quarantineCount, setQuarantineCount] = useState(0);
  const [disputeRows, setDisputeRows] = useState<DisputeRow[]>([]);
  const [disputeCount, setDisputeCount] = useState(0);

  const [loading, setLoading] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Per-row resolve state: id → selected lane
  const [resolveLane, setResolveLane] = useState<Record<number, ValidLane>>({});
  const [resolving, setResolving] = useState<Record<number, boolean>>({});
  const [toast, setToast] = useState<string | null>(null);
  // Per-row payload expand state
  const [expandedPayload, setExpandedPayload] = useState<Record<number, boolean>>({});

  // ── Fetch ────────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ tab });
      if (tab === "quarantine") params.set("status", statusFilter);

      const res = await fetch(
        `/api/customer-service/admin/quarantine?${params.toString()}`,
      );

      if (res.status === 403) {
        setAccessDenied(true);
        return;
      }
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "Failed to load data");
        return;
      }

      const json = await res.json();
      if (tab === "quarantine") {
        setQuarantineRows(json.rows ?? []);
        setQuarantineCount(json.count ?? 0);
      } else {
        setDisputeRows(json.rows ?? []);
        setDisputeCount(json.count ?? 0);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, [tab, statusFilter]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Auto-dismiss toast after 4 s
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // ── Resolve action ───────────────────────────────────────────────────────

  const resolve = async (reviewId: number) => {
    const lane = resolveLane[reviewId];
    if (!lane) {
      setToast("Select a lane before resolving");
      return;
    }
    setResolving((prev) => ({ ...prev, [reviewId]: true }));
    try {
      const res = await fetch(
        `/api/customer-service/admin/quarantine/${reviewId}/resolve`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ lane }),
        },
      );
      if (res.ok) {
        setToast(`Resolved as ${lane}`);
        void fetchData();
      } else {
        const j = await res.json().catch(() => ({}));
        setToast(j.error ?? "Could not resolve");
      }
    } finally {
      setResolving((prev) => ({ ...prev, [reviewId]: false }));
    }
  };

  // ── Access denied ────────────────────────────────────────────────────────

  if (accessDenied) {
    return (
      <div className="p-6">
        <p className="text-sm text-[var(--color-text-secondary)]">
          Access denied. Admin role required.
        </p>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Intake Quarantine</h1>
        {tab === "quarantine" && (
          <div className="flex items-center gap-2">
            {(["pending", "resolved"] as StatusFilter[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1 rounded text-xs font-medium border ${
                  statusFilter === s
                    ? "bg-[var(--color-accent)] text-white border-[var(--color-accent)]"
                    : "border-[var(--color-border-primary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]"
                }`}
              >
                {s[0].toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-[var(--color-border-primary)]">
        {(["quarantine", "disputes"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-xs border-b-2 -mb-px ${
              tab === t
                ? "border-[var(--color-accent)] text-[var(--color-accent)] font-medium"
                : "border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
            }`}
          >
            {t === "quarantine" ? "Quarantine" : "Disputes"}
            {t === "quarantine" && quarantineCount > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-[var(--color-warning-light)] text-[var(--color-warning)] text-[9px] font-semibold px-1.5 py-0.5">
                {quarantineCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-md border border-[var(--color-border-primary)] px-3 py-2 text-sm text-[var(--color-text-secondary)]">
          {error}
        </div>
      )}

      {/* Quarantine tab */}
      {tab === "quarantine" && (
        <div className="border border-[var(--color-border-primary)] rounded-md overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-bg-secondary)] text-xs text-[var(--color-text-secondary)]">
              <tr>
                <th className="text-left px-3 py-2">Order ID</th>
                <th className="text-left px-3 py-2">Shopify ID</th>
                <th className="text-right px-3 py-2">Total</th>
                <th className="text-left px-3 py-2">Created</th>
                <th className="text-left px-3 py-2">Payload Preview</th>
                <th className="text-right px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-center text-[var(--color-text-tertiary)]">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && quarantineRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-center text-[var(--color-text-tertiary)]">
                    No quarantined orders
                  </td>
                </tr>
              )}
              {!loading && quarantineRows.map((row) => {
                const isPending = row.resolved_at === null;
                const isExpanded = expandedPayload[row.id] ?? false;
                const pending = resolving[row.id] ?? false;

                return (
                  <tr
                    key={row.id}
                    className="border-t border-[var(--color-border-secondary)]"
                  >
                    {/* Order ID */}
                    <td className="px-3 py-2 font-medium">
                      {row.order?.shopify_order_name ?? `#${row.order_id}`}
                    </td>

                    {/* Shopify ID */}
                    <td className="px-3 py-2 text-[var(--color-text-secondary)] text-xs">
                      {row.order?.shopify_order_id ?? "—"}
                    </td>

                    {/* Total */}
                    <td className="px-3 py-2 text-right tabular-nums">
                      {row.order != null
                        ? `₱${row.order.final_total_amount.toFixed(2)}`
                        : "—"}
                    </td>

                    {/* Created */}
                    <td className="px-3 py-2 text-xs text-[var(--color-text-secondary)]">
                      {row.order?.created_at
                        ? format(new Date(row.order.created_at), "MMM d, h:mm a")
                        : "—"}
                    </td>

                    {/* Payload preview */}
                    <td className="px-3 py-2 max-w-xs">
                      {/* Note: shopify_payload_snapshot is not returned by the
                          API for security. This column shows row metadata
                          instead — admins can view the full order in Shopify. */}
                      <div className="text-xs font-mono text-[var(--color-text-secondary)]">
                        <span>
                          {isExpanded
                            ? `lane=${row.order?.intake_lane ?? "quarantine"} classified=${format(new Date(row.classified_at), "MMM d HH:mm")}`
                            : `lane=${row.order?.intake_lane ?? "quarantine"}`}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedPayload((prev) => ({
                              ...prev,
                              [row.id]: !isExpanded,
                            }))
                          }
                          className="ml-2 text-[var(--color-accent)] text-[10px] hover:underline"
                        >
                          {isExpanded ? "less" : "more"}
                        </button>
                      </div>
                      {row.resolved_at && (
                        <div className="mt-0.5 text-[10px] text-[var(--color-success)]">
                          Resolved → {row.resolved_lane} on{" "}
                          {format(new Date(row.resolved_at), "MMM d")}
                        </div>
                      )}
                    </td>

                    {/* Action */}
                    <td className="px-3 py-2 text-right">
                      {isPending ? (
                        <div className="inline-flex items-center gap-2">
                          <select
                            value={resolveLane[row.id] ?? ""}
                            onChange={(e) =>
                              setResolveLane((prev) => ({
                                ...prev,
                                [row.id]: e.target.value as ValidLane,
                              }))
                            }
                            className="text-xs border border-[var(--color-border-primary)] rounded px-2 py-1 bg-transparent"
                          >
                            <option value="" disabled>
                              Pick lane…
                            </option>
                            <option value="sales">Sales</option>
                            <option value="shopify_admin">Shopify Admin</option>
                            <option value="conversion">Conversion</option>
                          </select>
                          <button
                            type="button"
                            disabled={pending || !resolveLane[row.id]}
                            onClick={() => void resolve(row.id)}
                            className="px-3 py-1 rounded text-xs font-medium bg-[var(--color-accent)] text-white hover:opacity-90 disabled:opacity-50"
                          >
                            {pending ? "…" : "Resolve"}
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-[var(--color-text-tertiary)]">
                          Resolved
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Disputes tab */}
      {tab === "disputes" && (
        <div className="border border-[var(--color-border-primary)] rounded-md overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-bg-secondary)] text-xs text-[var(--color-text-secondary)]">
              <tr>
                <th className="text-left px-3 py-2">Order ID</th>
                <th className="text-left px-3 py-2">Winner Lane</th>
                <th className="text-left px-3 py-2">Loser Lane</th>
                <th className="text-left px-3 py-2">Source Winner</th>
                <th className="text-left px-3 py-2">Source Loser</th>
                <th className="text-left px-3 py-2">Recorded At</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-center text-[var(--color-text-tertiary)]">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && disputeRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-center text-[var(--color-text-tertiary)]">
                    No disagreements recorded
                  </td>
                </tr>
              )}
              {!loading && disputeRows.map((row) => (
                <tr
                  key={row.id}
                  className="border-t border-[var(--color-border-secondary)]"
                >
                  <td className="px-3 py-2 font-medium">
                    {row.order?.shopify_order_name ?? `#${row.order_id}`}
                  </td>
                  <td className="px-3 py-2">
                    <LaneBadge lane={row.winner_lane} />
                  </td>
                  <td className="px-3 py-2">
                    <LaneBadge lane={row.loser_lane} muted />
                  </td>
                  <td className="px-3 py-2 text-xs text-[var(--color-text-secondary)]">
                    {row.source_winner}
                  </td>
                  <td className="px-3 py-2 text-xs text-[var(--color-text-secondary)]">
                    {row.source_loser}
                  </td>
                  <td className="px-3 py-2 text-xs text-[var(--color-text-secondary)]">
                    {format(new Date(row.recorded_at), "MMM d, h:mm a")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && disputeCount > 0 && (
            <div className="px-3 py-2 text-[11px] text-[var(--color-text-tertiary)] border-t border-[var(--color-border-secondary)]">
              {disputeCount} disagreement{disputeCount !== 1 ? "s" : ""} recorded
            </div>
          )}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-md text-sm bg-[var(--color-surface-card)] border border-[var(--color-border-primary)] shadow-lg"
        >
          {toast}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function LaneBadge({ lane, muted = false }: { lane: string; muted?: boolean }) {
  const label =
    lane === "shopify_admin"
      ? "Shopify Admin"
      : lane[0].toUpperCase() + lane.slice(1);

  const colorClass = muted
    ? "bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] border-[var(--color-border-primary)]"
    : lane === "sales"
      ? "bg-[var(--color-success-light)] text-[var(--color-success)] border-[var(--color-success-light)]"
      : lane === "conversion"
        ? "bg-[var(--color-info-light)] text-[var(--color-info)] border-[var(--color-info-light)]"
        : "bg-[var(--color-warning-light)] text-[var(--color-warning)] border-[var(--color-warning-light)]";

  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider border ${colorClass}`}
    >
      {label}
    </span>
  );
}
