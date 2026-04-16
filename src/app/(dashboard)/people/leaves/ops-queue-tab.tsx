"use client";

import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type LeaveRequest = {
  id: string;
  requester_id: string;
  leave_type: "vacation" | "sick" | "emergency" | "personal";
  start_date: string;
  end_date: string;
  reason: string | null;
  status: "pending" | "approved" | "awaiting_form" | "finalized" | "rejected";
  form_filed: boolean;
  form_signed_digitally: boolean;
  rejection_reason: string | null;
  approved_at: string | null;
  finalized_at: string | null;
  requester: { id: string; full_name: string; avatar_url: string | null } | null;
  approver: { id: string; full_name: string } | null;
  finalizer: { id: string; full_name: string } | null;
};

type SubTab = "pending" | "in_progress" | "finalized" | "rejected";

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  vacation:  "Vacation",
  sick:      "Sick",
  emergency: "Emergency",
  personal:  "Personal",
};

const TYPE_COLORS: Record<string, string> = {
  vacation:  "bg-[var(--color-accent-light)] text-[var(--color-accent)]",
  sick:      "bg-red-100 text-red-700",
  emergency: "bg-orange-100 text-orange-700",
  personal:  "bg-purple-100 text-purple-700",
};

// ─── Avatar Initial ───────────────────────────────────────────────────────────

function AvatarInitial({ name, url }: { name: string; url: string | null }) {
  const initial = name ? name[0].toUpperCase() : "?";
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={name}
        className="w-8 h-8 rounded-full object-cover shrink-0"
      />
    );
  }
  return (
    <div className="w-8 h-8 rounded-full bg-[var(--color-accent-light)] text-[var(--color-accent)] flex items-center justify-center text-sm font-semibold shrink-0">
      {initial}
    </div>
  );
}

// ─── Rejection Dialog ─────────────────────────────────────────────────────────

function RejectDialog({
  onConfirm,
  onCancel,
  loading,
}: {
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [reason, setReason] = useState("");

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-[var(--color-bg-primary)] rounded-2xl shadow-2xl w-full max-w-md p-6 flex flex-col gap-4">
        <div>
          <h3 className="text-base font-semibold text-[var(--color-text-primary)]">Reject Leave Request</h3>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">Provide a reason for the rejection. This will be visible to the requester.</p>
        </div>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Rejection reason…"
          rows={4}
          className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-text-primary)] resize-none"
        />
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-sm rounded-lg border border-[var(--color-border-primary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(reason.trim())}
            disabled={loading || !reason.trim()}
            className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {loading ? "Rejecting…" : "Reject"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2500);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] text-sm px-5 py-2.5 rounded-full shadow-lg animate-in fade-in slide-in-from-bottom-2">
      {message}
    </div>
  );
}

// ─── Pending Tab ──────────────────────────────────────────────────────────────

function PendingTab({
  requests,
  onAction,
}: {
  requests: LeaveRequest[];
  onAction: () => Promise<void>;
}) {
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget]   = useState<string | null>(null);
  const [rejectLoading, setRejectLoading] = useState(false);
  const [toast, setToast]                 = useState<string | null>(null);

  async function approve(id: string) {
    setActionLoading(id);
    await fetch(`/api/leave-requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve" }),
    });
    setActionLoading(null);
    setToast("Request approved.");
    await onAction();
  }

  async function reject(id: string, reason: string) {
    setRejectLoading(true);
    await fetch(`/api/leave-requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reject", rejection_reason: reason }),
    });
    setRejectLoading(false);
    setRejectTarget(null);
    setToast("Request rejected.");
    await onAction();
  }

  if (requests.length === 0) {
    return (
      <div className="p-10 text-center text-sm text-[var(--color-text-muted)]">
        No pending requests.
      </div>
    );
  }

  return (
    <>
      <div className="divide-y divide-[var(--color-border-secondary)]">
        {requests.map((req) => (
          <div
            key={req.id}
            className="flex items-start gap-4 px-6 py-4 hover:bg-[var(--color-bg-hover)] transition-colors"
          >
            {/* Avatar */}
            <AvatarInitial
              name={req.requester?.full_name ?? "?"}
              url={req.requester?.avatar_url ?? null}
            />

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-[var(--color-text-primary)]">
                  {req.requester?.full_name ?? "Unknown"}
                </span>
                <span
                  className={cn(
                    "text-xs px-2 py-0.5 rounded-full font-medium",
                    TYPE_COLORS[req.leave_type]
                  )}
                >
                  {TYPE_LABELS[req.leave_type]}
                </span>
              </div>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                {format(new Date(req.start_date), "MMM d, yyyy")} —{" "}
                {format(new Date(req.end_date), "MMM d, yyyy")}
              </p>
              {req.reason && (
                <p className="text-xs text-[var(--color-text-tertiary)] mt-1 line-clamp-2">
                  {req.reason}
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => approve(req.id)}
                disabled={actionLoading === req.id}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {actionLoading === req.id ? "…" : "Approve"}
              </button>
              <button
                onClick={() => setRejectTarget(req.id)}
                disabled={actionLoading === req.id}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
              >
                Reject
              </button>
            </div>
          </div>
        ))}
      </div>

      {rejectTarget && (
        <RejectDialog
          loading={rejectLoading}
          onConfirm={(reason) => reject(rejectTarget, reason)}
          onCancel={() => setRejectTarget(null)}
        />
      )}

      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </>
  );
}

// ─── In Progress Tab ──────────────────────────────────────────────────────────

function InProgressTab({
  requests,
  onAction,
}: {
  requests: LeaveRequest[];
  onAction: () => Promise<void>;
}) {
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [notified, setNotified]           = useState<string | null>(null);
  const [toast, setToast]                 = useState<string | null>(null);

  async function doAction(id: string, action: string, extra?: Record<string, unknown>) {
    setActionLoading(`${id}:${action}`);
    await fetch(`/api/leave-requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    setActionLoading(null);
    if (action === "re_notify") {
      setNotified(id);
      setTimeout(() => setNotified(null), 2000);
    } else {
      await onAction();
    }
  }

  if (requests.length === 0) {
    return (
      <div className="p-10 text-center text-sm text-[var(--color-text-muted)]">
        No requests in progress.
      </div>
    );
  }

  return (
    <>
      <div className="divide-y divide-[var(--color-border-secondary)]">
        {requests.map((req) => {
          const isApproved       = req.status === "approved";
          const isAwaitingFiled  = req.status === "awaiting_form" && !req.form_filed;
          const isAwaitingDone   = req.status === "awaiting_form" && req.form_filed;

          let subStatus = "";
          if (isApproved)      subStatus = "Approved — awaiting form request";
          else if (isAwaitingFiled) subStatus = "Awaiting form";
          else if (isAwaitingDone)  subStatus = "Form filed";

          return (
            <div
              key={req.id}
              className="flex items-start gap-4 px-6 py-4 hover:bg-[var(--color-bg-hover)] transition-colors"
            >
              {/* Avatar */}
              <AvatarInitial
                name={req.requester?.full_name ?? "?"}
                url={req.requester?.avatar_url ?? null}
              />

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-[var(--color-text-primary)]">
                    {req.requester?.full_name ?? "Unknown"}
                  </span>
                  <span
                    className={cn(
                      "text-xs px-2 py-0.5 rounded-full font-medium",
                      TYPE_COLORS[req.leave_type]
                    )}
                  >
                    {TYPE_LABELS[req.leave_type]}
                  </span>
                </div>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                  {format(new Date(req.start_date), "MMM d, yyyy")} —{" "}
                  {format(new Date(req.end_date), "MMM d, yyyy")}
                </p>
                <p className="text-xs text-[var(--color-text-tertiary)] mt-1">{subStatus}</p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                {isApproved && (
                  <button
                    onClick={() => { doAction(req.id, "request_form"); setToast("Form requested."); }}
                    disabled={actionLoading?.startsWith(req.id)}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors"
                  >
                    {actionLoading === `${req.id}:request_form` ? "…" : "Request Form"}
                  </button>
                )}

                {isAwaitingFiled && (
                  <>
                    {notified === req.id ? (
                      <span className="text-xs font-medium text-green-600 px-3 py-1.5">Notified!</span>
                    ) : (
                      <button
                        onClick={() => doAction(req.id, "re_notify")}
                        disabled={actionLoading?.startsWith(req.id)}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--color-border-primary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] disabled:opacity-50 transition-colors"
                      >
                        {actionLoading === `${req.id}:re_notify` ? "…" : "Re-notify"}
                      </button>
                    )}
                    <button
                      onClick={() => {
                        const digital = confirm("Mark as filed with digital signature?");
                        doAction(req.id, "mark_filed", { form_signed_digitally: digital });
                        setToast("Marked as filed.");
                      }}
                      disabled={actionLoading?.startsWith(req.id)}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors"
                    >
                      {actionLoading === `${req.id}:mark_filed` ? "…" : "Mark Filed on Behalf"}
                    </button>
                  </>
                )}

                {isAwaitingDone && (
                  <button
                    onClick={() => { doAction(req.id, "finalize"); setToast("Request finalized."); }}
                    disabled={actionLoading?.startsWith(req.id)}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                  >
                    {actionLoading === `${req.id}:finalize` ? "…" : "Finalize"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </>
  );
}

// ─── Finalized Tab ────────────────────────────────────────────────────────────

function FinalizedTab({ requests }: { requests: LeaveRequest[] }) {
  if (requests.length === 0) {
    return (
      <div className="p-10 text-center text-sm text-[var(--color-text-muted)]">
        No finalized requests.
      </div>
    );
  }

  return (
    <div className="divide-y divide-[var(--color-border-secondary)]">
      {requests.map((req) => (
        <div
          key={req.id}
          className="flex items-start gap-4 px-6 py-4"
        >
          <AvatarInitial
            name={req.requester?.full_name ?? "?"}
            url={req.requester?.avatar_url ?? null}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-[var(--color-text-primary)]">
                {req.requester?.full_name ?? "Unknown"}
              </span>
              <span
                className={cn(
                  "text-xs px-2 py-0.5 rounded-full font-medium",
                  TYPE_COLORS[req.leave_type]
                )}
              >
                {TYPE_LABELS[req.leave_type]}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700">
                Finalized
              </span>
            </div>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              {format(new Date(req.start_date), "MMM d, yyyy")} —{" "}
              {format(new Date(req.end_date), "MMM d, yyyy")}
            </p>
            <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
              {req.finalized_at && (
                <>Finalized on {format(new Date(req.finalized_at), "MMM d, yyyy")}</>
              )}
              {req.finalizer && <> · by {req.finalizer.full_name}</>}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Rejected Tab ─────────────────────────────────────────────────────────────

function RejectedTab({ requests }: { requests: LeaveRequest[] }) {
  if (requests.length === 0) {
    return (
      <div className="p-10 text-center text-sm text-[var(--color-text-muted)]">
        No rejected requests.
      </div>
    );
  }

  return (
    <div className="divide-y divide-[var(--color-border-secondary)]">
      {requests.map((req) => (
        <div
          key={req.id}
          className="flex items-start gap-4 px-6 py-4"
        >
          <AvatarInitial
            name={req.requester?.full_name ?? "?"}
            url={req.requester?.avatar_url ?? null}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-[var(--color-text-primary)]">
                {req.requester?.full_name ?? "Unknown"}
              </span>
              <span
                className={cn(
                  "text-xs px-2 py-0.5 rounded-full font-medium",
                  TYPE_COLORS[req.leave_type]
                )}
              >
                {TYPE_LABELS[req.leave_type]}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-700">
                Rejected
              </span>
            </div>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              {format(new Date(req.start_date), "MMM d, yyyy")} —{" "}
              {format(new Date(req.end_date), "MMM d, yyyy")}
            </p>
            {req.rejection_reason && (
              <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
                <span className="font-medium">Reason:</span> {req.rejection_reason}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function OpsQueueTab() {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading]   = useState(true);
  const [activeTab, setActiveTab] = useState<SubTab>("pending");

  const fetchRequests = useCallback(async () => {
    const res  = await fetch("/api/leave-requests");
    const data = await res.json();
    setRequests(Array.isArray(data) ? data : (data.data ?? []));
    setLoading(false);
  }, []);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  async function refetch() {
    await fetchRequests();
  }

  const pending    = requests.filter((r) => r.status === "pending");
  const inProgress = requests.filter((r) => r.status === "approved" || r.status === "awaiting_form");
  const finalized  = requests.filter((r) => r.status === "finalized");
  const rejected   = requests.filter((r) => r.status === "rejected");

  const tabs: { id: SubTab; label: string; count: number }[] = [
    { id: "pending",     label: "Pending",     count: pending.length },
    { id: "in_progress", label: "In Progress",  count: inProgress.length },
    { id: "finalized",   label: "Finalized",    count: finalized.length },
    { id: "rejected",    label: "Rejected",     count: rejected.length },
  ];

  return (
    <div className="bg-[var(--color-bg-primary)] rounded-2xl border border-[var(--color-border-subtle)] overflow-hidden">

      {/* Sub-tab bar */}
      <div className="flex items-center gap-1 px-4 pt-4 pb-0 border-b border-[var(--color-border-subtle)]">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-t-lg transition-colors border-b-2 -mb-px",
              activeTab === tab.id
                ? "border-[var(--color-text-primary)] text-[var(--color-text-primary)]"
                : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
            )}
          >
            {tab.label}
            {tab.count > 0 && (
              <span
                className={cn(
                  "text-xs px-1.5 py-0.5 rounded-full font-medium",
                  activeTab === tab.id
                    ? "bg-[var(--color-text-primary)] text-[var(--color-text-inverted)]"
                    : "bg-[var(--color-bg-secondary)] text-[var(--color-text-muted)]"
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="p-6 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-[var(--color-bg-secondary)] rounded-lg animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {activeTab === "pending"     && <PendingTab    requests={pending}    onAction={refetch} />}
          {activeTab === "in_progress" && <InProgressTab requests={inProgress} onAction={refetch} />}
          {activeTab === "finalized"   && <FinalizedTab  requests={finalized} />}
          {activeTab === "rejected"    && <RejectedTab   requests={rejected} />}
        </>
      )}
    </div>
  );
}
