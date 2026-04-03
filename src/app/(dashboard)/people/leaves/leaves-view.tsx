"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

type Leave = {
  id: string;
  user_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  profile?: {
    id: string;
    first_name: string;
    last_name: string;
    department: { name: string } | null;
  };
  reviewer?: { first_name: string; last_name: string } | null;
};

type Props = {
  currentUserId: string;
  currentUserName: string;
  isOps: boolean;
  isManager: boolean;
};

const STATUS_STYLES: Record<string, string> = {
  pending:  "bg-amber-100 text-amber-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  cancelled:"bg-gray-100 text-gray-500",
};

const TYPE_LABELS: Record<string, string> = {
  vacation: "Vacation",
  sick: "Sick",
  personal: "Personal",
  other: "Other",
};

type Tab = "mine" | "team" | "all";

export function LeavesView({ currentUserId, isOps, isManager }: Props) {
  const [tab, setTab] = useState<Tab>("mine");
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ leave_type: "vacation", start_date: "", end_date: "", reason: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLeaves = useCallback(async () => {
    setLoading(true);
    const scope = tab === "mine" ? "mine" : tab === "team" ? "department" : "all";
    const res = await fetch(`/api/leaves?scope=${scope}`);
    const data = await res.json();
    setLeaves(data.leaves ?? []);
    setLoading(false);
  }, [tab]);

  useEffect(() => { fetchLeaves(); }, [fetchLeaves]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/leaves", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    const data = await res.json();
    setSubmitting(false);

    if (!res.ok) {
      setError(data.error);
      return;
    }

    setShowForm(false);
    setForm({ leave_type: "vacation", start_date: "", end_date: "", reason: "" });
    fetchLeaves();
  }

  async function handleAction(leaveId: string, action: "approved" | "rejected") {
    const res = await fetch("/api/leaves", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leave_id: leaveId, action }),
    });

    if (res.ok) fetchLeaves();
  }

  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: "mine", label: "My requests", show: true },
    { id: "team", label: "Team", show: isManager && !isOps },
    { id: "all", label: "All", show: isOps },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Leaves & Absences</h1>
        <button
          onClick={() => setShowForm(true)}
          className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
        >
          + Request leave
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {tabs.filter((t) => t.show).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              tab === t.id
                ? "border-gray-900 text-gray-900"
                : "border-transparent text-gray-500 hover:text-gray-700"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Submit form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Request Leave</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Leave type</label>
                <select
                  value={form.leave_type}
                  onChange={(e) => setForm({ ...form, leave_type: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
                >
                  {Object.entries(TYPE_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Start date</label>
                  <input
                    type="date"
                    required
                    value={form.start_date}
                    onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">End date</label>
                  <input
                    type="date"
                    required
                    value={form.end_date}
                    onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Reason (optional)</label>
                <textarea
                  rows={3}
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
                />
              </div>
              {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setError(null); }}
                  className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 bg-gray-900 text-white py-2 rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
                >
                  {submitting ? "Submitting…" : "Submit request"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Leaves list */}
      {loading ? (
        <div className="text-sm text-gray-400 py-8 text-center">Loading…</div>
      ) : leaves.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-400">
          No leave requests found
        </div>
      ) : (
        <div className="space-y-3">
          {leaves.map((leave) => {
            const isOwn = leave.user_id === currentUserId;
            const canAct = (isOps || isManager) && leave.status === "pending" && !isOwn;

            return (
              <div key={leave.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    {(tab !== "mine") && leave.profile && (
                      <p className="text-sm font-medium text-gray-900 mb-0.5">
                        {leave.profile.first_name} {leave.profile.last_name}
                        {leave.profile.department && (
                          <span className="ml-1.5 text-xs text-gray-400 font-normal">
                            {leave.profile.department.name}
                          </span>
                        )}
                      </p>
                    )}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-800">
                        {TYPE_LABELS[leave.leave_type] ?? leave.leave_type}
                      </span>
                      <span className="text-sm text-gray-500">
                        {format(new Date(leave.start_date), "MMM d")} – {format(new Date(leave.end_date), "MMM d, yyyy")}
                      </span>
                    </div>
                    {leave.reason && (
                      <p className="text-sm text-gray-500 mt-1">{leave.reason}</p>
                    )}
                    {leave.reviewer && leave.reviewed_at && (
                      <p className="text-xs text-gray-400 mt-1">
                        {leave.status === "approved" ? "Approved" : "Rejected"} by {leave.reviewer.first_name} {leave.reviewer.last_name}
                        {" · "}{format(new Date(leave.reviewed_at), "MMM d, yyyy")}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={cn("px-2.5 py-1 rounded-full text-xs font-medium capitalize", STATUS_STYLES[leave.status])}>
                      {leave.status}
                    </span>
                    {canAct && (
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleAction(leave.id, "approved")}
                          className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleAction(leave.id, "rejected")}
                          className="text-xs bg-red-100 text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-200"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
