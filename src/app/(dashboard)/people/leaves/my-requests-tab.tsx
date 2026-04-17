"use client";

import { useState, useEffect, useCallback } from "react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type LeaveStatus =
  | "pending"
  | "approved"
  | "awaiting_form"
  | "finalized"
  | "rejected";

type LeaveRequest = {
  id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  status: LeaveStatus;
  reason: string | null;
  created_at: string;
};

type Props = {
  onNewRequest: () => void;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  LeaveStatus,
  { label: string; className: string }
> = {
  pending:       { label: "Pending",        className: "bg-amber-100 text-amber-700" },
  approved:      { label: "Approved",       className: "bg-blue-100 text-blue-700" },
  awaiting_form: { label: "Awaiting Form",  className: "bg-orange-100 text-orange-700" },
  finalized:     { label: "Finalized",      className: "bg-green-100 text-green-700" },
  rejected:      { label: "Rejected",       className: "bg-red-100 text-red-700" },
};

const TYPE_LABELS: Record<string, string> = {
  vacation:  "Vacation",
  sick:      "Sick Leave",
  emergency: "Emergency",
  personal:  "Personal",
  absent:    "Absent",
};

function formatDateRange(start: string, end: string): string {
  try {
    const s = parseISO(start);
    const e = parseISO(end);
    if (start === end) return format(s, "MMM d, yyyy");
    return `${format(s, "MMM d")} – ${format(e, "MMM d, yyyy")}`;
  } catch {
    return `${start} – ${end}`;
  }
}

// ─── Mark-as-Filed inline dialog ─────────────────────────────────────────────

function MarkFiledDialog({
  requestId,
  onDone,
  onCancel,
}: {
  requestId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [signedDigitally, setSignedDigitally] = useState(false);
  const [submitting, setSubmitting]           = useState(false);
  const [error, setError]                     = useState<string | null>(null);

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/leave-requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action:                "mark_filed",
          form_signed_digitally: signedDigitally,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to mark as filed.");
        setSubmitting(false);
        return;
      }
      onDone();
    } catch {
      setError("Network error — please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] p-4 space-y-3">
      <p className="text-sm font-medium text-[var(--color-text-primary)]">
        Mark leave form as filed
      </p>

      <label className="flex items-start gap-2.5 cursor-pointer">
        <input
          type="checkbox"
          checked={signedDigitally}
          onChange={(e) => setSignedDigitally(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-[var(--color-border-primary)] accent-[var(--color-text-primary)] cursor-pointer"
        />
        <span className="text-sm text-[var(--color-text-secondary)]">
          Signed digitally
        </span>
      </label>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="flex-1 border border-[var(--color-border-primary)] text-[var(--color-text-secondary)] py-1.5 rounded-lg text-xs font-medium hover:border-[var(--color-text-secondary)] disabled:opacity-50 transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={submitting}
          className="flex-1 bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] py-1.5 rounded-lg text-xs font-medium hover:bg-[var(--color-text-secondary)] disabled:opacity-50 transition-colors"
        >
          {submitting ? "Confirming…" : "Confirm"}
        </button>
      </div>
    </div>
  );
}

// ─── Request row ─────────────────────────────────────────────────────────────

function RequestRow({
  request,
  onRefresh,
}: {
  request: LeaveRequest;
  onRefresh: () => void;
}) {
  const [showFiled, setShowFiled] = useState(false);

  const statusCfg =
    STATUS_CONFIG[request.status] ?? { label: request.status, className: "bg-gray-100 text-gray-700" };

  return (
    <div className="py-4 border-b border-[var(--color-border-subtle)] last:border-0">
      <div className="flex items-start justify-between gap-3">
        {/* Left: type + date range + reason */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Leave type badge */}
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]">
              {TYPE_LABELS[request.leave_type] ?? request.leave_type}
            </span>
            {/* Status badge */}
            <span
              className={cn(
                "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                statusCfg.className
              )}
            >
              {statusCfg.label}
            </span>
          </div>

          <p className="mt-1 text-sm font-medium text-[var(--color-text-primary)]">
            {formatDateRange(request.start_date, request.end_date)}
          </p>

          {request.reason && (
            <p className="mt-0.5 text-xs text-[var(--color-text-muted)] truncate max-w-sm">
              {request.reason}
            </p>
          )}

          <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
            Filed{" "}
            {(() => {
              try {
                return format(parseISO(request.created_at), "MMM d, yyyy");
              } catch {
                return request.created_at;
              }
            })()}
          </p>
        </div>

        {/* Right: action button for awaiting_form */}
        {request.status === "awaiting_form" && !showFiled && (
          <button
            type="button"
            onClick={() => setShowFiled(true)}
            className="shrink-0 border border-orange-300 text-orange-700 bg-orange-50 hover:bg-orange-100 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          >
            Mark as Filed
          </button>
        )}
      </div>

      {/* Inline mark-filed dialog */}
      {showFiled && (
        <MarkFiledDialog
          requestId={request.id}
          onDone={() => {
            setShowFiled(false);
            onRefresh();
          }}
          onCancel={() => setShowFiled(false)}
        />
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function MyRequestsTab({ onNewRequest }: Props) {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch("/api/leave-requests");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to load leave requests.");
      } else {
        setRequests(data.requests ?? data ?? []);
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
          My Leave Requests
        </h2>
        <button
          type="button"
          onClick={onNewRequest}
          className="bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] px-4 py-2 rounded-lg text-sm font-medium hover:bg-[var(--color-text-secondary)] transition-colors"
        >
          New Request
        </button>
      </div>

      {/* Content */}
      <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-xl px-5">
        {loading ? (
          <div className="py-6 space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-2">
                <div className="h-4 w-24 bg-[var(--color-bg-secondary)] rounded animate-pulse" />
                <div className="h-4 w-40 bg-[var(--color-bg-secondary)] rounded animate-pulse" />
                <div className="h-3 w-32 bg-[var(--color-bg-secondary)] rounded animate-pulse" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="py-8 text-center">
            <p className="text-sm text-red-600">{error}</p>
            <button
              type="button"
              onClick={fetchRequests}
              className="mt-3 text-sm text-[var(--color-text-secondary)] underline underline-offset-2 hover:text-[var(--color-text-primary)]"
            >
              Try again
            </button>
          </div>
        ) : requests.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-[var(--color-text-secondary)]">
              No leave requests yet. Submit your first request.
            </p>
            <button
              type="button"
              onClick={onNewRequest}
              className="mt-4 bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] px-4 py-2 rounded-lg text-sm font-medium hover:bg-[var(--color-text-secondary)] transition-colors"
            >
              New Request
            </button>
          </div>
        ) : (
          <div>
            {requests.map((r) => (
              <RequestRow key={r.id} request={r} onRefresh={fetchRequests} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
