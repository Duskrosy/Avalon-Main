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

const TYPE_LABELS: Record<string, string> = {
  sick:      "Sick",
  vacation:  "Vacation",
  emergency: "Emergency",
};

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
  const [acting, setActing] = useState<string | null>(null);

  const profile = leave.profile;
  const days =
    Math.ceil(
      (new Date(leave.end_date).getTime() - new Date(leave.start_date).getTime()) /
        (1000 * 60 * 60 * 24)
    ) + 1;

  async function act(action: "pre_approve" | "approve" | "reject") {
    if (action === "reject" && !confirm("Reject this leave request?")) return;
    setActing(action);
    await onAction(leave.id, action);
    setActing(null);
  }

  const isPending     = leave.status === "pending";
  const isPreApproved = leave.status === "pre_approved";

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-xs font-semibold text-gray-600 shrink-0">
          {(profile?.first_name?.[0] ?? "") + (profile?.last_name?.[0] ?? "")}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-gray-900">
                {profile?.first_name} {profile?.last_name}
              </p>
              <p className="text-xs text-gray-400">
                {profile?.department?.name}
              </p>
            </div>
            <span className={cn(
              "px-2.5 py-1 rounded-full text-xs font-medium shrink-0",
              isPending     ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"
            )}>
              {isPending ? "Pending your review" : "Awaiting final approval"}
            </span>
          </div>

          {/* Leave details */}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            <p className="text-sm text-gray-700">
              <span className="font-medium">{TYPE_LABELS[leave.leave_type]} leave</span>
              {" · "}{days} day{days !== 1 ? "s" : ""}
            </p>
            <p className="text-sm text-gray-500">
              {format(new Date(leave.start_date), "MMM d")}
              {leave.start_date !== leave.end_date &&
                ` – ${format(new Date(leave.end_date), "MMM d, yyyy")}`}
              {leave.start_date === leave.end_date &&
                `, ${new Date(leave.start_date).getFullYear()}`}
            </p>
          </div>

          {leave.reason && (
            <p className="text-sm text-gray-500 mt-1 italic">&ldquo;{leave.reason}&rdquo;</p>
          )}

          {/* Pre-approval info (for OPS final-approval view) */}
          {isPreApproved && leave.pre_approver && (
            <p className="text-xs text-blue-600 mt-1.5">
              Pre-approved by {leave.pre_approver.first_name} {leave.pre_approver.last_name}
              {leave.pre_approved_at &&
                ` on ${format(new Date(leave.pre_approved_at), "MMM d, yyyy")}`}
            </p>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 mt-3">
            {isPending && (
              <button
                onClick={() => act("pre_approve")}
                disabled={acting !== null}
                className="px-4 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {acting === "pre_approve" ? "Approving…" : "Pre-Approve"}
              </button>
            )}
            {isPreApproved && isOps && (
              <button
                onClick={() => act("approve")}
                disabled={acting !== null}
                className="px-4 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {acting === "approve" ? "Approving…" : "Final Approve"}
              </button>
            )}
            <button
              onClick={() => act("reject")}
              disabled={acting !== null}
              className="px-4 py-1.5 bg-red-50 text-red-700 border border-red-200 text-xs font-medium rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors"
            >
              {acting === "reject" ? "Rejecting…" : "Reject"}
            </button>
          </div>
        </div>
      </div>
    </div>
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

  const totalPending = pending.length + preApproved.length;

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />)}
      </div>
    );
  }

  if (totalPending === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
        <div className="text-3xl mb-3">✓</div>
        <p className="text-sm font-medium text-gray-700">All caught up</p>
        <p className="text-xs text-gray-400 mt-1">No leave requests awaiting your action.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* Manager queue: pending leaves needing pre-approval */}
      {pending.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-sm font-semibold text-gray-900">
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
            <h3 className="text-sm font-semibold text-gray-900">Pre-approved — awaiting your final approval</h3>
            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
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
