"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type LeaveType = "sick" | "vacation" | "emergency";

type Leave = {
  id: string;
  user_id: string;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  reason: string | null;
  status: "pending" | "pre_approved" | "approved" | "rejected" | "cancelled";
  pre_approver?: { first_name: string; last_name: string } | null;
  pre_approved_at?: string | null;
  reviewer?: { first_name: string; last_name: string } | null;
  reviewed_at?: string | null;
};

type DocRecord = {
  requested_by?: string | null;
  requested_at?: string | null;
  request_note?: string | null;
  file_url?: string | null;
  file_name?: string | null;
  requester?: { first_name: string; last_name: string } | null;
} | null;

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  pending:      "bg-amber-100 text-amber-700",
  pre_approved: "bg-[var(--color-accent-light)] text-[var(--color-accent)]",
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

const TYPE_LABELS: Record<LeaveType, string> = {
  sick:      "Sick Leave",
  vacation:  "Vacation Leave",
  emergency: "Emergency Leave",
};

// ─── Leave Card ───────────────────────────────────────────────────────────────

function LeaveCard({
  leave,
  currentUserId,
  isManager,
  isOps,
  onRefresh,
}: {
  leave: Leave;
  currentUserId: string;
  isManager: boolean;
  isOps: boolean;
  onRefresh: () => void;
}) {
  const [doc, setDoc]           = useState<DocRecord>(undefined as unknown as DocRecord);
  const [docLoading, setDocLoading] = useState(false);
  const [uploading, setUploading]   = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const needsDocs = leave.leave_type === "sick" || leave.leave_type === "emergency";
  const canManageDocs = (isManager || isOps) && leave.user_id !== currentUserId;

  useEffect(() => {
    if (!needsDocs) return;
    setDocLoading(true);
    fetch(`/api/leaves/${leave.id}/documents`)
      .then((r) => r.json())
      .then((d) => { setDoc(d.document); setDocLoading(false); })
      .catch(() => setDocLoading(false));
  }, [leave.id, needsDocs]);

  async function handleCancel() {
    if (!confirm("Cancel this leave request?")) return;
    setCancelling(true);
    await fetch("/api/leaves", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leave_id: leave.id, action: "cancel" }),
    });
    setCancelling(false);
    onRefresh();
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/leaves/${leave.id}/documents`, { method: "POST", body: fd });
    setUploading(false);
    if (res.ok) {
      const r = await fetch(`/api/leaves/${leave.id}/documents`);
      const d = await r.json();
      setDoc(d.document);
    }
  }

  const days =
    Math.ceil(
      (new Date(leave.end_date).getTime() - new Date(leave.start_date).getTime()) /
        (1000 * 60 * 60 * 24)
    ) + 1;

  return (
    <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-[var(--color-text-primary)]">
              {format(new Date(leave.start_date), "MMM d")}
              {leave.start_date !== leave.end_date && ` – ${format(new Date(leave.end_date), "MMM d, yyyy")}`}
              {leave.start_date === leave.end_date && `, ${new Date(leave.start_date).getFullYear()}`}
            </span>
            <span className="text-xs text-[var(--color-text-muted)]">{days} day{days !== 1 ? "s" : ""}</span>
          </div>
          {leave.reason && <p className="text-sm text-[var(--color-text-tertiary)] mt-0.5">{leave.reason}</p>}

          {/* Approval trail */}
          <div className="mt-1 space-y-0.5">
            {leave.pre_approver && (
              <p className="text-xs text-[var(--color-text-muted)]">
                Pre-approved by {leave.pre_approver.first_name} {leave.pre_approver.last_name}
                {leave.pre_approved_at && ` · ${format(new Date(leave.pre_approved_at), "MMM d, yyyy")}`}
              </p>
            )}
            {leave.reviewer && leave.reviewed_at && (
              <p className="text-xs text-[var(--color-text-muted)]">
                {STATUS_LABELS[leave.status]} by {leave.reviewer.first_name} {leave.reviewer.last_name}
                {" · "}{format(new Date(leave.reviewed_at), "MMM d, yyyy")}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className={cn("px-2.5 py-1 rounded-full text-xs font-medium", STATUS_STYLES[leave.status])}>
            {STATUS_LABELS[leave.status]}
          </span>
          {leave.status === "pending" && leave.user_id === currentUserId && (
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="text-xs text-[var(--color-text-muted)] hover:text-red-600 transition-colors"
            >
              {cancelling ? "…" : "Cancel"}
            </button>
          )}
        </div>
      </div>

      {/* Supporting document section (sick + emergency only) */}
      {needsDocs && !docLoading && (
        <div className="border-t border-[var(--color-border-subtle)] pt-3">
          {doc?.requested_by && !doc.file_url && leave.user_id === currentUserId && (
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-amber-700">
                  Supporting document requested
                  {doc.requester && ` by ${doc.requester.first_name} ${doc.requester.last_name}`}
                </p>
                {doc.request_note && (
                  <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">{doc.request_note}</p>
                )}
              </div>
              <div>
                <input ref={fileRef} type="file" className="hidden" onChange={handleUpload} />
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="text-xs bg-amber-50 border border-amber-300 text-amber-700 px-3 py-1.5 rounded-lg hover:bg-amber-100 transition-colors"
                >
                  {uploading ? "Uploading…" : "Upload document"}
                </button>
              </div>
            </div>
          )}

          {doc?.file_url && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-[var(--color-text-tertiary)]">
                Supporting document: <span className="font-medium text-[var(--color-text-secondary)]">{doc.file_name}</span>
              </p>
              <a
                href={doc.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[var(--color-accent)] hover:underline"
              >
                View
              </a>
            </div>
          )}

          {!doc && !canManageDocs && leave.user_id === currentUserId && (
            <p className="text-xs text-[var(--color-text-muted)]">No supporting document requested yet.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function LeaveHistoryTab({
  currentUserId,
  isManager,
  isOps,
}: {
  currentUserId: string;
  isManager: boolean;
  isOps: boolean;
}) {
  const [leaves, setLeaves]   = useState<Leave[]>([]);
  const [loading, setLoading] = useState(true);
  const [openTypes, setOpenTypes] = useState<Set<LeaveType>>(new Set(["sick", "vacation", "emergency"]));

  const fetchLeaves = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/leaves?scope=mine");
    const data = await res.json();
    setLeaves(data.leaves ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchLeaves(); }, [fetchLeaves]);

  function toggleType(t: LeaveType) {
    setOpenTypes((prev) => {
      const next = new Set(prev);
      next.has(t) ? next.delete(t) : next.add(t);
      return next;
    });
  }

  const grouped = (["sick", "vacation", "emergency"] as LeaveType[]).map((t) => ({
    type: t,
    leaves: leaves.filter((l) => l.leave_type === t),
  }));

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-[var(--color-bg-secondary)] rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (leaves.length === 0) {
    return (
      <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-xl p-10 text-center">
        <p className="text-sm text-[var(--color-text-muted)]">No leave history yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {grouped.map(({ type, leaves: typeLeaves }) => {
        const open = openTypes.has(type);
        return (
          <div key={type} className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-xl overflow-hidden">
            <button
              onClick={() => toggleType(type)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-[var(--color-bg-hover)] transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-[var(--color-text-primary)]">{TYPE_LABELS[type]}</span>
                <span className="px-2 py-0.5 bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] rounded-full text-xs font-medium">
                  {typeLeaves.length}
                </span>
              </div>
              <svg
                className={cn("w-4 h-4 text-[var(--color-text-muted)] transition-transform", open && "rotate-180")}
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>

            {open && (
              <div className="px-4 pb-4 space-y-3 border-t border-[var(--color-border-subtle)] pt-3">
                {typeLeaves.length === 0 ? (
                  <p className="text-sm text-[var(--color-text-muted)] text-center py-4">No {TYPE_LABELS[type].toLowerCase()} records.</p>
                ) : (
                  typeLeaves.map((leave) => (
                    <LeaveCard
                      key={leave.id}
                      leave={leave}
                      currentUserId={currentUserId}
                      isManager={isManager}
                      isOps={isOps}
                      onRefresh={fetchLeaves}
                    />
                  ))
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
