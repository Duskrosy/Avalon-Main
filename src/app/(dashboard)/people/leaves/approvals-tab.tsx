"use client";

import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type Leave = {
  id: string;
  leave_type: "sick" | "vacation" | "emergency";
  start_date: string;
  end_date: string;
  reason: string | null;
  status: "pending" | "pre_approved" | "approved" | "rejected" | "cancelled";
  profile?: {
    id: string;
    first_name: string;
    last_name: string;
    department: { name: string } | null;
  };
  pre_approver?: { first_name: string; last_name: string } | null;
  pre_approved_at?: string | null;
};

type DocRecord = {
  requested_by?: string | null;
  file_url?: string | null;
  file_name?: string | null;
} | null;

const TYPE_LABELS: Record<string, string> = {
  sick:      "Sick",
  vacation:  "Vacation",
  emergency: "Emergency",
};

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

// ─── Leave Approval Card ──────────────────────────────────────────────────────

function ApprovalCard({
  leave,
  isOps,
  onAction,
}: {
  leave: Leave;
  isOps: boolean;
  onAction: (id: string, action: "pre_approve" | "approve" | "reject") => Promise<void>;
}) {
  const [acting, setActing]         = useState<string | null>(null);
  const [doc, setDoc]               = useState<DocRecord>(undefined as unknown as DocRecord);
  const [docLoaded, setDocLoaded]   = useState(false);
  const [showDocModal, setShowDocModal] = useState(false);

  const profile    = leave.profile;
  const needsDocs  = leave.leave_type === "sick" || leave.leave_type === "emergency";
  const isPending     = leave.status === "pending";
  const isPreApproved = leave.status === "pre_approved";

  const days =
    Math.ceil(
      (new Date(leave.end_date).getTime() - new Date(leave.start_date).getTime()) /
        (1000 * 60 * 60 * 24)
    ) + 1;

  // Load doc status when card mounts (for sick/emergency)
  useEffect(() => {
    if (!needsDocs) return;
    fetch(`/api/leaves/${leave.id}/documents`)
      .then((r) => r.json())
      .then((d) => { setDoc(d.document); setDocLoaded(true); });
  }, [leave.id, needsDocs]);

  async function act(action: "pre_approve" | "approve" | "reject") {
    if (action === "reject" && !confirm("Reject this leave request?")) return;
    setActing(action);
    await onAction(leave.id, action);
    setActing(null);
  }

  return (
    <>
      {showDocModal && profile && (
        <DocRequestModal
          leaveId={leave.id}
          employeeName={`${profile.first_name} ${profile.last_name}`}
          onClose={() => setShowDocModal(false)}
          onSent={() => { setDoc(null); setDocLoaded(false);
            fetch(`/api/leaves/${leave.id}/documents`).then((r) => r.json()).then((d) => { setDoc(d.document); setDocLoaded(true); });
          }}
        />
      )}

      <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-xl p-4">
        <div className="flex items-start gap-3">
          {/* Avatar */}
          <div className="w-9 h-9 rounded-full bg-[var(--color-bg-tertiary)] flex items-center justify-center text-xs font-semibold text-[var(--color-text-secondary)] shrink-0">
            {(profile?.first_name?.[0] ?? "") + (profile?.last_name?.[0] ?? "")}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                  {profile?.first_name} {profile?.last_name}
                </p>
                <p className="text-xs text-[var(--color-text-muted)]">{profile?.department?.name}</p>
              </div>
              <span className={cn(
                "px-2.5 py-1 rounded-full text-xs font-medium shrink-0",
                isPending ? "bg-amber-100 text-amber-700" : "bg-[var(--color-accent-light)] text-[var(--color-accent)]"
              )}>
                {isPending ? "Pending your review" : "Awaiting final approval"}
              </span>
            </div>

            {/* Leave details */}
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              <p className="text-sm text-[var(--color-text-secondary)]">
                <span className="font-medium">{TYPE_LABELS[leave.leave_type]} leave</span>
                {" · "}{days} day{days !== 1 ? "s" : ""}
              </p>
              <p className="text-sm text-[var(--color-text-tertiary)]">
                {format(new Date(leave.start_date), "MMM d")}
                {leave.start_date !== leave.end_date &&
                  ` – ${format(new Date(leave.end_date), "MMM d, yyyy")}`}
                {leave.start_date === leave.end_date &&
                  `, ${new Date(leave.start_date).getFullYear()}`}
              </p>
            </div>

            {leave.reason && (
              <p className="text-sm text-[var(--color-text-tertiary)] mt-1 italic">&ldquo;{leave.reason}&rdquo;</p>
            )}

            {/* Pre-approval info (for OPS final-approval view) */}
            {isPreApproved && leave.pre_approver && (
              <p className="text-xs text-[var(--color-accent)] mt-1.5">
                Pre-approved by {leave.pre_approver.first_name} {leave.pre_approver.last_name}
                {leave.pre_approved_at &&
                  ` on ${format(new Date(leave.pre_approved_at), "MMM d, yyyy")}`}
              </p>
            )}

            {/* Document status (sick / emergency only) */}
            {needsDocs && (
              <div className="mt-3 pt-3 border-t border-[var(--color-border-subtle)]">
                {!docLoaded ? (
                  <p className="text-xs text-[var(--color-text-muted)]">Checking document status…</p>
                ) : doc?.file_url ? (
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-green-700 font-medium">✓ Document uploaded</span>
                    <a
                      href={doc.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[var(--color-accent)] hover:underline"
                    >
                      View — {doc.file_name}
                    </a>
                  </div>
                ) : doc?.requested_by ? (
                  <p className="text-xs text-amber-600 font-medium">
                    Supporting document requested — awaiting upload from employee
                  </p>
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

            {/* Action buttons */}
            <div className="flex gap-2 mt-3">
              {isPending && (
                <button
                  onClick={() => act("pre_approve")}
                  disabled={acting !== null}
                  className="px-4 py-1.5 bg-[var(--color-success)] text-white text-xs font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-colors"
                >
                  {acting === "pre_approve" ? "Approving…" : "Pre-Approve"}
                </button>
              )}
              {isPreApproved && isOps && (
                <button
                  onClick={() => act("approve")}
                  disabled={acting !== null}
                  className="px-4 py-1.5 bg-[var(--color-success)] text-white text-xs font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-colors"
                >
                  {acting === "approve" ? "Approving…" : "Final Approve"}
                </button>
              )}
              <button
                onClick={() => act("reject")}
                disabled={acting !== null}
                className="px-4 py-1.5 bg-red-50 text-red-700 border border-red-200 text-xs font-medium rounded-lg hover:bg-[var(--color-error-light)] disabled:opacity-50 transition-colors"
              >
                {acting === "reject" ? "Rejecting…" : "Reject"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ApprovalsTab({
  isOps,
  isManager,
}: {
  isOps: boolean;
  isManager: boolean;
}) {
  const [pending, setPending]         = useState<Leave[]>([]);
  const [preApproved, setPreApproved] = useState<Leave[]>([]);
  const [loading, setLoading]         = useState(true);

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    const scope = isOps ? "all" : "department";

    const [pendingRes, preApprovedRes] = await Promise.all([
      fetch(`/api/leaves?scope=${scope}&status=pending`),
      isOps ? fetch(`/api/leaves?scope=all&status=pre_approved`) : Promise.resolve(null),
    ]);

    const pendingData = await pendingRes.json();
    setPending(pendingData.leaves ?? []);

    if (preApprovedRes) {
      const preData = await preApprovedRes.json();
      setPreApproved(preData.leaves ?? []);
    }

    setLoading(false);
  }, [isOps]);

  useEffect(() => { fetchQueue(); }, [fetchQueue]);

  async function handleAction(leaveId: string, action: "pre_approve" | "approve" | "reject") {
    await fetch("/api/leaves", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leave_id: leaveId, action }),
    });
    fetchQueue();
  }

  // suppress unused warning
  void isManager;

  const totalPending = pending.length + preApproved.length;

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => <div key={i} className="h-28 bg-[var(--color-bg-secondary)] rounded-xl animate-pulse" />)}
      </div>
    );
  }

  if (totalPending === 0) {
    return (
      <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-xl p-10 text-center">
        <div className="text-3xl mb-3">✓</div>
        <p className="text-sm font-medium text-[var(--color-text-secondary)]">All caught up</p>
        <p className="text-xs text-[var(--color-text-muted)] mt-1">No leave requests awaiting your action.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* Manager queue: pending leaves needing pre-approval */}
      {pending.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
              {isOps ? "Pending — needs manager pre-approval" : "Pending requests"}
            </h3>
            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">
              {pending.length}
            </span>
          </div>
          <div className="space-y-3">
            {pending.map((leave) => (
              <ApprovalCard
                key={leave.id}
                leave={leave}
                isOps={isOps}
                onAction={handleAction}
              />
            ))}
          </div>
        </div>
      )}

      {/* OPS queue: pre-approved leaves needing final approval */}
      {isOps && preApproved.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Pre-approved — awaiting your final approval</h3>
            <span className="px-2 py-0.5 bg-[var(--color-accent-light)] text-[var(--color-accent)] rounded-full text-xs font-medium">
              {preApproved.length}
            </span>
          </div>
          <div className="space-y-3">
            {preApproved.map((leave) => (
              <ApprovalCard
                key={leave.id}
                leave={leave}
                isOps={isOps}
                onAction={handleAction}
              />
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
