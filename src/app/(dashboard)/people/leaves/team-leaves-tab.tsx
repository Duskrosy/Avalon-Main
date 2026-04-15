"use client";

import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type Leave = {
  id: string;
  user_id: string;
  leave_type: "sick" | "vacation" | "emergency";
  start_date: string;
  end_date: string;
  reason: string | null;
  status: "pending" | "pre_approved" | "approved" | "rejected" | "cancelled";
  profile?: {
    id: string;
    first_name: string;
    last_name: string;
    department: { id: string; name: string } | null;
  };
  pre_approver?: { first_name: string; last_name: string } | null;
  reviewer?: { first_name: string; last_name: string } | null;
  reviewed_at?: string | null;
};

type Dept = { id: string; name: string; slug: string };

type CreditRow = {
  user_id: string;
  first_name: string;
  last_name: string;
  department: { id: string; name: string; slug: string } | null;
  totals: { sick: number; vacation: number; emergency: number };
  used:   { sick: number; vacation: number; emergency: number };
};

type DocRecord = {
  requested_by?: string | null;
  file_url?: string | null;
  file_name?: string | null;
} | null;

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_CREDITS = { sick: 5, vacation: 5, emergency: 5 };

const STATUS_STYLES: Record<string, string> = {
  pending:      "bg-amber-100 text-amber-700",
  pre_approved: "bg-blue-100 text-blue-700",
  approved:     "bg-green-100 text-green-700",
  rejected:     "bg-red-100 text-red-700",
  cancelled:    "bg-[var(--color-bg-secondary)] text-[var(--color-text-tertiary)]",
};

const STATUS_LABELS: Record<string, string> = {
  pending:      "Pending",
  pre_approved: "Pre-approved",
  approved:     "Approved",
  rejected:     "Rejected",
  cancelled:    "Cancelled",
};

const TYPE_LABELS: Record<string, string> = {
  sick:      "Sick",
  vacation:  "Vacation",
  emergency: "Emergency",
};

const TYPE_COLORS: Record<string, string> = {
  sick:      "bg-red-100 text-red-700",
  vacation:  "bg-blue-100 text-blue-700",
  emergency: "bg-orange-100 text-orange-700",
};

// ─── Credits Modal ─────────────────────────────────────────────────────────────

function CreditsModal({
  isOps,
  departments,
  onClose,
}: {
  isOps: boolean;
  departments: Dept[];
  onClose: () => void;
}) {
  const [rows, setRows]       = useState<CreditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deptFilter, setDeptFilter] = useState("all");
  const [search, setSearch]   = useState("");
  const [view, setView]       = useState<"limit" | "balance">("limit");

  // Credit Limit edits (edit the total allocation)
  const [edits, setEdits]   = useState<Record<string, { sick: number; vacation: number; emergency: number }>>({});
  // Current Balance edits (edit the remaining days directly — computes new total = used + remaining)
  const [balanceEdits, setBalanceEdits] = useState<Record<string, { sick: number; vacation: number; emergency: number }>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saved, setSaved]   = useState<Record<string, boolean>>({});

  // Bulk "apply to team" values
  const [bulk, setBulk]           = useState({ sick: 5, vacation: 5, emergency: 5 });
  const [applyingBulk, setApplyingBulk] = useState(false);
  const [bulkSaved, setBulkSaved]       = useState(false);

  const fetchCredits = useCallback(async () => {
    setLoading(true);
    const scope = isOps ? "all" : "team";
    const res  = await fetch(`/api/leaves/credits?scope=${scope}`);
    const data = await res.json();
    setRows(data.team ?? []);
    setLoading(false);
  }, [isOps]);

  useEffect(() => { fetchCredits(); }, [fetchCredits]);

  function getVal(row: CreditRow, type: "sick" | "vacation" | "emergency"): number {
    return edits[row.user_id]?.[type] ?? row.totals[type];
  }

  function setVal(userId: string, type: "sick" | "vacation" | "emergency", val: number) {
    setEdits((prev) => ({
      ...prev,
      [userId]: { ...(prev[userId] ?? {}), [type]: Math.max(0, Math.min(365, val)) },
    }));
    setSaved((prev) => ({ ...prev, [userId]: false }));
  }

  async function saveRow(row: CreditRow) {
    const rowEdits = edits[row.user_id];
    if (!rowEdits) return;
    setSaving((prev) => ({ ...prev, [row.user_id]: true }));
    await fetch("/api/leaves/credits", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id:         row.user_id,
        sick_total:      rowEdits.sick      ?? row.totals.sick,
        vacation_total:  rowEdits.vacation  ?? row.totals.vacation,
        emergency_total: rowEdits.emergency ?? row.totals.emergency,
      }),
    });
    setSaving((prev) => ({ ...prev, [row.user_id]: false }));
    setSaved((prev)  => ({ ...prev, [row.user_id]: true }));
    setRows((prev) =>
      prev.map((r) =>
        r.user_id === row.user_id
          ? { ...r, totals: { sick: rowEdits.sick ?? r.totals.sick, vacation: rowEdits.vacation ?? r.totals.vacation, emergency: rowEdits.emergency ?? r.totals.emergency } }
          : r
      )
    );
    setEdits((prev) => { const n = { ...prev }; delete n[row.user_id]; return n; });
    setTimeout(() => setSaved((prev) => ({ ...prev, [row.user_id]: false })), 2000);
  }

  async function resetRow(row: CreditRow) {
    if (!confirm(`Reset ${row.first_name} ${row.last_name}'s credit limits to defaults (${DEFAULT_CREDITS.sick} sick / ${DEFAULT_CREDITS.vacation} vacation / ${DEFAULT_CREDITS.emergency} emergency)?`)) return;
    setSaving((prev) => ({ ...prev, [row.user_id]: true }));
    await fetch("/api/leaves/credits", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id:         row.user_id,
        sick_total:      DEFAULT_CREDITS.sick,
        vacation_total:  DEFAULT_CREDITS.vacation,
        emergency_total: DEFAULT_CREDITS.emergency,
      }),
    });
    setSaving((prev) => ({ ...prev, [row.user_id]: false }));
    setSaved((prev)  => ({ ...prev, [row.user_id]: true }));
    setRows((prev) =>
      prev.map((r) => r.user_id === row.user_id ? { ...r, totals: { ...DEFAULT_CREDITS } } : r)
    );
    setEdits((prev) => { const n = { ...prev }; delete n[row.user_id]; return n; });
    setTimeout(() => setSaved((prev) => ({ ...prev, [row.user_id]: false })), 2000);
  }

  // Save balance: compute new total = used + desired_remaining, then PATCH
  async function saveBalance(row: CreditRow) {
    const be = balanceEdits[row.user_id];
    if (!be) return;
    setSaving((prev) => ({ ...prev, [row.user_id]: true }));
    const newTotals = {
      sick_total:      row.used.sick      + (be.sick      ?? Math.max(0, row.totals.sick - row.used.sick)),
      vacation_total:  row.used.vacation  + (be.vacation  ?? Math.max(0, row.totals.vacation - row.used.vacation)),
      emergency_total: row.used.emergency + (be.emergency ?? Math.max(0, row.totals.emergency - row.used.emergency)),
    };
    await fetch("/api/leaves/credits", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: row.user_id, ...newTotals }),
    });
    setSaving((prev) => ({ ...prev, [row.user_id]: false }));
    setSaved((prev)  => ({ ...prev, [row.user_id]: true }));
    setRows((prev) =>
      prev.map((r) => r.user_id === row.user_id
        ? { ...r, totals: { sick: newTotals.sick_total, vacation: newTotals.vacation_total, emergency: newTotals.emergency_total } }
        : r
      )
    );
    setBalanceEdits((prev) => { const n = { ...prev }; delete n[row.user_id]; return n; });
    setTimeout(() => setSaved((prev) => ({ ...prev, [row.user_id]: false })), 2000);
  }

  async function applyBulk() {
    const targetIds = filtered.map((r) => r.user_id);
    if (targetIds.length === 0) return;
    setApplyingBulk(true);
    await fetch("/api/leaves/credits", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_ids:        targetIds,
        sick_total:      bulk.sick,
        vacation_total:  bulk.vacation,
        emergency_total: bulk.emergency,
      }),
    });
    setApplyingBulk(false);
    setBulkSaved(true);
    fetchCredits();
    setEdits({});
    setBalanceEdits({});
    setTimeout(() => setBulkSaved(false), 2000);
  }

  const filtered = rows.filter((r) => {
    if (deptFilter !== "all" && r.department?.id !== deptFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!`${r.first_name} ${r.last_name}`.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-[var(--color-bg-primary)] w-full sm:rounded-2xl sm:shadow-2xl sm:max-w-3xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border-subtle)] shrink-0">
          <div>
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Manage Leave Credits</h2>
            <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">Control how many leave days each employee is entitled to per year.</p>
          </div>
          <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors p-1">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* View toggle + filters */}
        <div className="px-6 py-3 border-b border-[var(--color-border-subtle)] shrink-0 space-y-3">
          {/* View tabs */}
          <div className="flex items-center gap-1 bg-[var(--color-bg-secondary)] rounded-lg p-1 w-fit">
            <button
              onClick={() => setView("limit")}
              className={cn(
                "px-4 py-1.5 rounded-md text-sm font-medium transition-colors",
                view === "limit" ? "bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] shadow-sm" : "text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
              )}
            >
              Credit Limit
            </button>
            <button
              onClick={() => setView("balance")}
              className={cn(
                "px-4 py-1.5 rounded-md text-sm font-medium transition-colors",
                view === "balance" ? "bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] shadow-sm" : "text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
              )}
            >
              Current Balance
            </button>
          </div>

          {/* Search + dept filter */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                type="search"
                placeholder="Search employee…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-3 py-1.5 border border-[var(--color-border-primary)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-text-primary)] w-48"
              />
            </div>
            {isOps && departments.length > 0 && (
              <select
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                className="border border-[var(--color-border-primary)] rounded-lg px-3 py-1.5 text-sm bg-[var(--color-bg-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-text-primary)]"
              >
                <option value="all">All departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Credit Limit view — bulk apply bar */}
        {view === "limit" && (
          <div className="px-6 py-3 bg-[var(--color-accent-light)] border-b border-[var(--color-border-primary)] shrink-0">
            <p className="text-xs font-semibold text-[var(--color-accent)] mb-2 uppercase tracking-wide">
              Apply same limit to {deptFilter === "all" ? "all employees" : "this department"} ({filtered.length})
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              {(["sick", "vacation", "emergency"] as const).map((t) => (
                <div key={t} className="flex items-center gap-1.5">
                  <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", TYPE_COLORS[t])}>{TYPE_LABELS[t]}</span>
                  <input
                    type="number"
                    min={0}
                    max={365}
                    value={bulk[t]}
                    onChange={(e) => setBulk((b) => ({ ...b, [t]: Number(e.target.value) }))}
                    className="w-14 border border-[var(--color-border-primary)] rounded-lg px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] bg-[var(--color-bg-primary)]"
                  />
                  <span className="text-xs text-[var(--color-text-tertiary)]">days</span>
                </div>
              ))}
              <button
                onClick={applyBulk}
                disabled={applyingBulk || filtered.length === 0}
                className={cn(
                  "px-4 py-1.5 rounded-lg text-sm font-medium transition-colors shrink-0",
                  bulkSaved ? "bg-[var(--color-success)] text-white" : "bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
                )}
              >
                {applyingBulk ? "Applying…" : bulkSaved ? "Applied ✓" : "Apply to All"}
              </button>
            </div>
          </div>
        )}

        {/* Current Balance view — legend */}
        {view === "balance" && (
          <div className="px-6 py-2.5 bg-[var(--color-bg-secondary)] border-b border-[var(--color-border-subtle)] shrink-0">
            <p className="text-xs text-[var(--color-text-tertiary)]">
              Shows <strong>remaining days</strong> for this year. Edit any number to manually set someone&apos;s balance — it adjusts their credit limit accordingly. Green = plenty, amber = low, red = nearly gone.
            </p>
          </div>
        )}

        {/* Column headers */}
        <div className={cn(
          "grid gap-2 items-center px-6 py-2 bg-[var(--color-bg-secondary)] border-b border-[var(--color-border-subtle)] text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider sticky top-0 shrink-0",
          view === "limit"
            ? "grid-cols-[1fr_70px_70px_80px_90px_56px]"
            : "grid-cols-[1fr_70px_70px_80px_56px]"
        )}>
          <span>Employee</span>
          <span className="text-center">Sick</span>
          <span className="text-center">Vacation</span>
          <span className="text-center">Emergency</span>
          {view === "limit" ? <span className="text-center">Reset</span> : null}
          <span />
        </div>

        {/* Employee list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-14 bg-[var(--color-bg-secondary)] rounded-lg animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-sm text-[var(--color-text-muted)]">No employees found.</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {filtered.map((row) => {
                const isDirty  = !!edits[row.user_id];
                const isSaving = saving[row.user_id];
                const isSaved  = saved[row.user_id];

                // Remaining = limit - used (clamped to 0)
                const remaining = {
                  sick:      Math.max(0, row.totals.sick - row.used.sick),
                  vacation:  Math.max(0, row.totals.vacation - row.used.vacation),
                  emergency: Math.max(0, row.totals.emergency - row.used.emergency),
                };

                function balanceColor(rem: number, total: number) {
                  if (total === 0) return "text-[var(--color-text-muted)]";
                  const pct = rem / total;
                  if (pct > 0.5) return "text-green-700 font-semibold";
                  if (pct > 0.2) return "text-amber-600 font-semibold";
                  return "text-red-600 font-semibold";
                }

                const isBalanceDirty = !!balanceEdits[row.user_id];

                if (view === "balance") {
                  return (
                    <div
                      key={row.user_id}
                      className={cn(
                        "grid grid-cols-[1fr_70px_70px_80px_56px] gap-2 items-center px-6 py-3 hover:bg-[var(--color-bg-hover)] transition-colors",
                        isBalanceDirty && "bg-amber-50"
                      )}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                          {row.first_name} {row.last_name}
                        </p>
                        <p className="text-xs text-[var(--color-text-muted)]">{row.department?.name ?? "No dept"} · {row.used.sick}s / {row.used.vacation}v / {row.used.emergency}e used</p>
                      </div>
                      {(["sick", "vacation", "emergency"] as const).map((t) => {
                        const currentRemaining = balanceEdits[row.user_id]?.[t] ?? remaining[t];
                        return (
                          <div key={t} className="text-center">
                            <input
                              type="number"
                              min={0}
                              max={365}
                              value={currentRemaining}
                              onChange={(e) => {
                                setBalanceEdits((prev) => ({
                                  ...prev,
                                  [row.user_id]: {
                                    sick:      prev[row.user_id]?.sick      ?? remaining.sick,
                                    vacation:  prev[row.user_id]?.vacation  ?? remaining.vacation,
                                    emergency: prev[row.user_id]?.emergency ?? remaining.emergency,
                                    [t]: Math.max(0, Number(e.target.value)),
                                  },
                                }));
                                setSaved((prev) => ({ ...prev, [row.user_id]: false }));
                              }}
                              className={cn(
                                "w-full border rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-[var(--color-text-primary)] transition-colors",
                                isBalanceDirty ? "border-amber-400 bg-amber-50" : "border-[var(--color-border-primary)] bg-[var(--color-bg-primary)]",
                                balanceColor(currentRemaining, row.totals[t]).replace("font-semibold", "")
                              )}
                            />
                            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{row.used[t]} used</p>
                          </div>
                        );
                      })}
                      {/* Save */}
                      <div className="flex justify-center">
                        {isSaved ? (
                          <span className="text-xs text-green-600 font-medium">Saved ✓</span>
                        ) : (
                          <button
                            onClick={() => saveBalance(row)}
                            disabled={!isBalanceDirty || isSaving}
                            className={cn(
                              "text-xs px-3 py-1.5 rounded-lg font-medium transition-colors",
                              isBalanceDirty
                                ? "bg-[var(--color-text-primary)] text-white hover:bg-[var(--color-text-secondary)]"
                                : "bg-[var(--color-bg-secondary)] text-[var(--color-text-muted)] cursor-not-allowed"
                            )}
                          >
                            {isSaving ? "…" : "Save"}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                }

                // Credit Limit view
                return (
                  <div
                    key={row.user_id}
                    className={cn(
                      "grid grid-cols-[1fr_70px_70px_80px_90px_56px] gap-2 items-center px-6 py-3 hover:bg-[var(--color-bg-hover)] transition-colors",
                      isDirty && "bg-amber-50"
                    )}
                  >
                    {/* Name */}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                        {row.first_name} {row.last_name}
                      </p>
                      <p className="text-xs text-[var(--color-text-muted)]">{row.department?.name ?? "No dept"}</p>
                    </div>

                    {/* Credit inputs */}
                    {(["sick", "vacation", "emergency"] as const).map((t) => (
                      <input
                        key={t}
                        type="number"
                        min={0}
                        max={365}
                        value={getVal(row, t)}
                        onChange={(e) => setVal(row.user_id, t, Number(e.target.value))}
                        className={cn(
                          "w-full border rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-[var(--color-text-primary)] transition-colors",
                          isDirty ? "border-amber-400 bg-amber-50" : "border-[var(--color-border-primary)] bg-[var(--color-bg-primary)]"
                        )}
                      />
                    ))}

                    {/* Reset to defaults */}
                    <div className="flex justify-center">
                      <button
                        onClick={() => resetRow(row)}
                        disabled={isSaving}
                        title="Reset to defaults (5/5/5)"
                        className="text-xs px-2 py-1.5 rounded-lg border border-[var(--color-border-primary)] text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-secondary)] transition-colors disabled:opacity-40 whitespace-nowrap"
                      >
                        ↺ Reset
                      </button>
                    </div>

                    {/* Save */}
                    <div className="flex justify-center">
                      {isSaved ? (
                        <span className="text-xs text-green-600 font-medium">Saved ✓</span>
                      ) : (
                        <button
                          onClick={() => saveRow(row)}
                          disabled={!isDirty || isSaving}
                          className={cn(
                            "text-xs px-3 py-1.5 rounded-lg font-medium transition-colors",
                            isDirty
                              ? "bg-[var(--color-text-primary)] text-white hover:bg-[var(--color-text-secondary)]"
                              : "bg-[var(--color-bg-secondary)] text-[var(--color-text-muted)] cursor-not-allowed"
                          )}
                        >
                          {isSaving ? "…" : "Save"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer note */}
        <div className="px-6 py-3 border-t border-[var(--color-border-subtle)] shrink-0">
          <p className="text-xs text-[var(--color-text-muted)]">
            Default is {DEFAULT_CREDITS.sick} sick · {DEFAULT_CREDITS.vacation} vacation · {DEFAULT_CREDITS.emergency} emergency days per year. Changes take effect immediately.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Doc Request Modal ─────────────────────────────────────────────────────────

function DocRequestModal({
  leaveId,
  employeeName,
  onClose,
  onSent,
}: {
  leaveId: string;
  employeeName: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const [note, setNote]       = useState("");
  const [sending, setSending] = useState(false);

  async function handleSend() {
    setSending(true);
    const res = await fetch(`/api/leaves/${leaveId}/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "request", note: note || null }),
    });
    setSending(false);
    if (res.ok) { onSent(); onClose(); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-[var(--color-bg-primary)] rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h3 className="text-base font-semibold text-[var(--color-text-primary)] mb-1">Request supporting document</h3>
        <p className="text-sm text-[var(--color-text-tertiary)] mb-4">
          A notification will be sent to <strong>{employeeName}</strong> asking them to upload.
        </p>
        <textarea
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional note for the employee…"
          className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-text-primary)] resize-none mb-4"
        />
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 border border-[var(--color-border-primary)] text-[var(--color-text-secondary)] py-2 rounded-lg text-sm hover:bg-[var(--color-bg-hover)]">
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending}
            className="flex-1 bg-[var(--color-text-primary)] text-white py-2 rounded-lg text-sm font-medium hover:bg-[var(--color-text-secondary)] disabled:opacity-50"
          >
            {sending ? "Sending…" : "Send request"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Leave Row ─────────────────────────────────────────────────────────────────

function LeaveRow({ leave, isOps, onRefresh }: { leave: Leave; isOps: boolean; onRefresh: () => void }) {
  const [doc, setDoc]               = useState<DocRecord>(undefined as unknown as DocRecord);
  const [docLoaded, setDocLoaded]   = useState(false);
  const [showDocModal, setShowDocModal] = useState(false);
  const [expanded, setExpanded]     = useState(false);
  const [rescinding, setRescinding] = useState(false);

  const needsDocs = leave.leave_type === "sick" || leave.leave_type === "emergency";

  function loadDoc() {
    if (docLoaded) return;
    fetch(`/api/leaves/${leave.id}/documents`)
      .then((r) => r.json())
      .then((d) => { setDoc(d.document); setDocLoaded(true); });
  }

  function handleExpand() {
    setExpanded((v) => !v);
    if (!expanded && needsDocs) loadDoc();
  }

  async function handleRescind() {
    if (!confirm("Rescind this approved leave? The employee will be notified and their leave credits will be restored.")) return;
    setRescinding(true);
    await fetch("/api/leaves", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leave_id: leave.id, action: "rescind" }),
    });
    setRescinding(false);
    onRefresh();
  }

  const profile = leave.profile;
  const days = Math.ceil(
    (new Date(leave.end_date).getTime() - new Date(leave.start_date).getTime()) / (1000 * 60 * 60 * 24)
  ) + 1;

  return (
    <>
      {showDocModal && profile && (
        <DocRequestModal
          leaveId={leave.id}
          employeeName={`${profile.first_name} ${profile.last_name}`}
          onClose={() => setShowDocModal(false)}
          onSent={() => { setDocLoaded(false); setDoc(null); loadDoc(); }}
        />
      )}

      <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-xl overflow-hidden">
        <button
          onClick={handleExpand}
          className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--color-bg-hover)] transition-colors"
        >
          <div className="w-8 h-8 rounded-full bg-[var(--color-bg-tertiary)] flex items-center justify-center text-xs font-semibold text-[var(--color-text-secondary)] shrink-0">
            {(profile?.first_name?.[0] ?? "") + (profile?.last_name?.[0] ?? "")}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-[var(--color-text-primary)]">{profile?.first_name} {profile?.last_name}</p>
              {profile?.department && <span className="text-xs text-[var(--color-text-muted)]">{profile.department.name}</span>}
            </div>
            <p className="text-xs text-[var(--color-text-tertiary)]">
              {TYPE_LABELS[leave.leave_type]} · {format(new Date(leave.start_date), "MMM d")}
              {leave.start_date !== leave.end_date && ` – ${format(new Date(leave.end_date), "MMM d")}`}
              {" "}· {days}d
            </p>
          </div>
          <span className={cn("px-2.5 py-1 rounded-full text-xs font-medium shrink-0", STATUS_STYLES[leave.status])}>
            {STATUS_LABELS[leave.status]}
          </span>
          <svg className={cn("w-4 h-4 text-[var(--color-text-muted)] transition-transform shrink-0", expanded && "rotate-180")}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>

        {expanded && (
          <div className="border-t border-[var(--color-border-subtle)] px-4 py-3 space-y-3">
            {leave.reason && <p className="text-sm text-[var(--color-text-secondary)]"><span className="font-medium">Reason:</span> {leave.reason}</p>}
            <div className="space-y-0.5">
              {leave.pre_approver && (
                <p className="text-xs text-[var(--color-text-muted)]">Pre-approved by {leave.pre_approver.first_name} {leave.pre_approver.last_name}</p>
              )}
              {leave.reviewer && leave.reviewed_at && (
                <p className="text-xs text-[var(--color-text-muted)]">
                  {STATUS_LABELS[leave.status]} by {leave.reviewer.first_name} {leave.reviewer.last_name}
                  {" · "}{format(new Date(leave.reviewed_at), "MMM d, yyyy")}
                </p>
              )}
            </div>

            {/* Document section */}
            {needsDocs && (
              <div className="border-t border-[var(--color-border-subtle)] pt-3">
                {!docLoaded ? (
                  <p className="text-xs text-[var(--color-text-muted)]">Loading document status…</p>
                ) : doc?.file_url ? (
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-[var(--color-text-secondary)]">Document: <span className="font-medium">{doc.file_name}</span></p>
                    <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--color-accent)] hover:underline">View</a>
                  </div>
                ) : doc?.requested_by ? (
                  <p className="text-xs text-amber-600 font-medium">Document requested — awaiting upload</p>
                ) : (
                  <button
                    onClick={() => setShowDocModal(true)}
                    className="text-xs border border-[var(--color-border-primary)] text-[var(--color-text-secondary)] px-3 py-1.5 rounded-lg hover:bg-[var(--color-bg-hover)] transition-colors"
                  >
                    Request supporting document
                  </button>
                )}
              </div>
            )}

            {/* Rescind — OPS only, approved leaves */}
            {isOps && leave.status === "approved" && (
              <div className="border-t border-[var(--color-border-subtle)] pt-3">
                <button
                  onClick={handleRescind}
                  disabled={rescinding}
                  className="text-xs border border-red-200 text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  {rescinding ? "Rescinding…" : "Rescind approved leave"}
                </button>
                <p className="text-xs text-[var(--color-text-muted)] mt-1">Removes approval and notifies the employee.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function TeamLeavesTab({ isOps, departments }: { isOps: boolean; departments: Dept[] }) {
  const [leaves, setLeaves]         = useState<Leave[]>([]);
  const [loading, setLoading]       = useState(true);
  const [deptFilter, setDeptFilter] = useState("all");
  const [search, setSearch]         = useState("");
  const [showCredits, setShowCredits] = useState(false);

  const fetchLeaves = useCallback(async () => {
    setLoading(true);
    const scope = isOps ? "all" : "department";
    const res = await fetch(`/api/leaves?scope=${scope}`);
    const data = await res.json();
    setLeaves(data.leaves ?? []);
    setLoading(false);
  }, [isOps]);

  useEffect(() => { fetchLeaves(); }, [fetchLeaves]);

  const filtered = leaves.filter((l) => {
    const p = l.profile;
    if (!p) return false;
    if (deptFilter !== "all" && p.department?.id !== deptFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!`${p.first_name} ${p.last_name}`.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <>
      {showCredits && (
        <CreditsModal
          isOps={isOps}
          departments={departments}
          onClose={() => setShowCredits(false)}
        />
      )}

      <div className="space-y-4">
        {/* Toolbar */}
        <div className="flex items-center gap-3 flex-wrap justify-between">
          <div className="flex items-center gap-3 flex-wrap">
            {isOps && departments.length > 0 && (
              <select
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                className="border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm bg-[var(--color-bg-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-text-primary)]"
              >
                <option value="all">All departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            )}
            <input
              type="search"
              placeholder="Search employee…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-text-primary)] w-48"
            />
          </div>

          {isOps && (
            <button
              onClick={() => setShowCredits(true)}
              className="flex items-center gap-2 px-4 py-2 border border-[var(--color-border-primary)] rounded-lg text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
              </svg>
              Manage Credits
            </button>
          )}
        </div>

        {/* Leave list */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-[var(--color-bg-secondary)] rounded-xl animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-xl p-10 text-center">
            <p className="text-sm text-[var(--color-text-muted)]">No leave requests found.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((leave) => (
              <LeaveRow key={leave.id} leave={leave} isOps={isOps} onRefresh={fetchLeaves} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
