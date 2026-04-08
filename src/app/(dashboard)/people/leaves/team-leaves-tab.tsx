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

const STATUS_STYLES: Record<string, string> = {
  pending:      "bg-amber-100 text-amber-700",
  pre_approved: "bg-blue-100 text-blue-700",
  approved:     "bg-green-100 text-green-700",
  rejected:     "bg-red-100 text-red-700",
  cancelled:    "bg-gray-100 text-gray-500",
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

  // Per-row edits: user_id → { sick, vacation, emergency }
  const [edits, setEdits]   = useState<Record<string, { sick: number; vacation: number; emergency: number }>>({});
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
      [userId]: { ...(prev[userId] ?? {}), [type]: val },
    }));
    // Clear saved indicator when editing
    setSaved((prev) => ({ ...prev, [userId]: false }));
  }

  async function saveRow(row: CreditRow) {
    const rowEdits = edits[row.user_id];
    if (!rowEdits) return; // nothing changed

    setSaving((prev) => ({ ...prev, [row.user_id]: true }));

    await fetch("/api/leaves/credits", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id:        row.user_id,
        sick_total:     rowEdits.sick      ?? row.totals.sick,
        vacation_total: rowEdits.vacation  ?? row.totals.vacation,
        emergency_total:rowEdits.emergency ?? row.totals.emergency,
      }),
    });

    setSaving((prev) => ({ ...prev, [row.user_id]: false }));
    setSaved((prev)  => ({ ...prev, [row.user_id]: true }));

    // Update base row so edits are now the "saved" state
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
    // Refresh rows to reflect new values
    fetchCredits();
    setEdits({});
    setTimeout(() => setBulkSaved(false), 2000);
  }

  const filtered = rows.filter((r) =>
    deptFilter === "all" || r.department?.id === deptFilter
  );

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:rounded-2xl sm:shadow-2xl sm:max-w-3xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Manage Leave Credits</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Set how many days each employee gets per year. Changes take effect immediately.
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Apply-to-all section */}
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 shrink-0">
          <div className="flex items-end gap-4 flex-wrap">
            <div>
              <p className="text-xs font-medium text-gray-700 mb-2">
                Apply same credits to {deptFilter === "all" ? "all employees" : "this department"}
              </p>
              <div className="flex items-center gap-3">
                {(["sick", "vacation", "emergency"] as const).map((t) => (
                  <div key={t} className="flex items-center gap-1.5">
                    <label className="text-xs text-gray-500 capitalize w-16">{t}</label>
                    <input
                      type="number"
                      min={0}
                      max={365}
                      value={bulk[t]}
                      onChange={(e) => setBulk((b) => ({ ...b, [t]: Number(e.target.value) }))}
                      className="w-14 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-gray-900"
                    />
                  </div>
                ))}
              </div>
            </div>
            <button
              onClick={applyBulk}
              disabled={applyingBulk || filtered.length === 0}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition-colors shrink-0",
                bulkSaved
                  ? "bg-green-600 text-white"
                  : "bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-50"
              )}
            >
              {applyingBulk ? "Applying…" : bulkSaved ? "Applied ✓" : `Apply to ${filtered.length} employee${filtered.length !== 1 ? "s" : ""}`}
            </button>
          </div>
        </div>

        {/* Dept filter (OPS only) */}
        {isOps && departments.length > 0 && (
          <div className="px-6 py-3 border-b border-gray-100 shrink-0">
            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              <option value="all">All departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Employee list */}
        <div className="flex-1 overflow-y-auto">
          {/* Column headers */}
          <div className="grid grid-cols-[1fr_80px_80px_80px_80px] gap-2 items-center px-6 py-2 bg-gray-50 border-b border-gray-100 text-xs font-medium text-gray-500 uppercase tracking-wider sticky top-0">
            <span>Employee</span>
            <span className="text-center">Sick</span>
            <span className="text-center">Vacation</span>
            <span className="text-center">Emergency</span>
            <span />
          </div>

          {loading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-sm text-gray-400">No employees found.</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {filtered.map((row) => {
                const isDirty = !!edits[row.user_id];
                const isSaving = saving[row.user_id];
                const isSaved  = saved[row.user_id];

                return (
                  <div
                    key={row.user_id}
                    className="grid grid-cols-[1fr_80px_80px_80px_80px] gap-2 items-center px-6 py-3 hover:bg-gray-50 transition-colors"
                  >
                    {/* Name + dept + used */}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {row.first_name} {row.last_name}
                      </p>
                      <p className="text-xs text-gray-400">
                        {row.department?.name ?? "No dept"}
                        {" · "}used: {row.used.sick}s / {row.used.vacation}v / {row.used.emergency}e
                      </p>
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
                          "w-full border rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-gray-900 transition-colors",
                          isDirty ? "border-amber-400 bg-amber-50" : "border-gray-200"
                        )}
                      />
                    ))}

                    {/* Save button */}
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
                              ? "bg-gray-900 text-white hover:bg-gray-700"
                              : "bg-gray-100 text-gray-400 cursor-not-allowed"
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
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-1">Request supporting document</h3>
        <p className="text-sm text-gray-500 mb-4">
          A notification will be sent to <strong>{employeeName}</strong> asking them to upload.
        </p>
        <textarea
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional note for the employee…"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none mb-4"
        />
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending}
            className="flex-1 bg-gray-900 text-white py-2 rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
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

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <button
          onClick={handleExpand}
          className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
        >
          <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-semibold text-gray-600 shrink-0">
            {(profile?.first_name?.[0] ?? "") + (profile?.last_name?.[0] ?? "")}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-gray-900">{profile?.first_name} {profile?.last_name}</p>
              {profile?.department && <span className="text-xs text-gray-400">{profile.department.name}</span>}
            </div>
            <p className="text-xs text-gray-500">
              {TYPE_LABELS[leave.leave_type]} · {format(new Date(leave.start_date), "MMM d")}
              {leave.start_date !== leave.end_date && ` – ${format(new Date(leave.end_date), "MMM d")}`}
              {" "}· {days}d
            </p>
          </div>
          <span className={cn("px-2.5 py-1 rounded-full text-xs font-medium shrink-0", STATUS_STYLES[leave.status])}>
            {STATUS_LABELS[leave.status]}
          </span>
          <svg className={cn("w-4 h-4 text-gray-400 transition-transform shrink-0", expanded && "rotate-180")}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>

        {expanded && (
          <div className="border-t border-gray-100 px-4 py-3 space-y-3">
            {leave.reason && <p className="text-sm text-gray-600"><span className="font-medium">Reason:</span> {leave.reason}</p>}
            <div className="space-y-0.5">
              {leave.pre_approver && (
                <p className="text-xs text-gray-400">Pre-approved by {leave.pre_approver.first_name} {leave.pre_approver.last_name}</p>
              )}
              {leave.reviewer && leave.reviewed_at && (
                <p className="text-xs text-gray-400">
                  {STATUS_LABELS[leave.status]} by {leave.reviewer.first_name} {leave.reviewer.last_name}
                  {" · "}{format(new Date(leave.reviewed_at), "MMM d, yyyy")}
                </p>
              )}
            </div>
            {needsDocs && (
              <div className="border-t border-gray-50 pt-3">
                {!docLoaded ? (
                  <p className="text-xs text-gray-400">Loading document status…</p>
                ) : doc?.file_url ? (
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-600">Document: <span className="font-medium">{doc.file_name}</span></p>
                    <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">View</a>
                  </div>
                ) : doc?.requested_by ? (
                  <p className="text-xs text-amber-600 font-medium">Document requested — awaiting upload</p>
                ) : (
                  <button
                    onClick={() => setShowDocModal(true)}
                    className="text-xs border border-gray-300 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Request supporting document
                  </button>
                )}
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
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
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
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 w-48"
            />
          </div>

          {/* Credits button — OPS only */}
          {isOps && (
            <button
              onClick={() => setShowCredits(true)}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
              Manage Credits
            </button>
          )}
        </div>

        {/* Leave list */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
            <p className="text-sm text-gray-400">No leave requests found.</p>
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
