"use client";

import { useState, useEffect } from "react";
import { format, parseISO } from "date-fns";

type FeedbackItem = {
  id: string;
  category: string;
  body: string;
  page_url: string | null;
  status: string;
  created_at: string;
  department_id: string | null;
  profiles: { first_name: string; last_name: string; email: string } | null;
};

const STATUS_COLORS: Record<string, string> = {
  open: "bg-yellow-100 text-yellow-800",
  acknowledged: "bg-blue-100 text-blue-800",
  resolved: "bg-green-100 text-green-800",
  wontfix: "bg-gray-100 text-gray-600",
};

const CATEGORY_LABELS: Record<string, string> = {
  bug: "Bug",
  missing_feature: "Missing feature",
  confusing: "Confusing",
  slow: "Slow",
  other: "Other",
};

export function PulseTab() {
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    fetchFeedback();
  }, [statusFilter, categoryFilter]);

  async function fetchFeedback() {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (categoryFilter !== "all") params.set("category", categoryFilter);

    try {
      const res = await fetch(`/api/feedback?${params}`);
      if (!res.ok) throw new Error("Failed to load feedback");
      const data = await res.json();
      setFeedback(data.feedback ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load feedback");
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(id: string, newStatus: string) {
    setUpdating(id);
    try {
      const res = await fetch("/api/feedback", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: newStatus }),
      });
      if (!res.ok) throw new Error("Failed to update status");
      setFeedback((prev) =>
        prev.map((f) => (f.id === id ? { ...f, status: newStatus } : f))
      );
    } catch {
      // Silently fail — the user can retry
    } finally {
      setUpdating(null);
    }
  }

  const openCount = feedback.filter((f) => f.status === "open").length;
  const totalCount = feedback.length;

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Total Feedback</p>
          <p className="text-2xl font-bold text-gray-900">{totalCount}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Open</p>
          <p className="text-2xl font-bold text-yellow-600">{openCount}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Acknowledged</p>
          <p className="text-2xl font-bold text-blue-600">
            {feedback.filter((f) => f.status === "acknowledged").length}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Resolved</p>
          <p className="text-2xl font-bold text-green-600">
            {feedback.filter((f) => f.status === "resolved").length}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 focus:border-gray-400 focus:outline-none"
        >
          <option value="all">All statuses</option>
          <option value="open">Open</option>
          <option value="acknowledged">Acknowledged</option>
          <option value="resolved">Resolved</option>
          <option value="wontfix">Won&apos;t fix</option>
        </select>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 focus:border-gray-400 focus:outline-none"
        >
          <option value="all">All categories</option>
          <option value="bug">Bug</option>
          <option value="missing_feature">Missing feature</option>
          <option value="confusing">Confusing</option>
          <option value="slow">Slow</option>
          <option value="other">Other</option>
        </select>

        <button
          onClick={fetchFeedback}
          className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:border-gray-400 transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Feedback table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">User Feedback</h2>
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-400 text-sm">Loading...</div>
        ) : error ? (
          <div className="text-center py-16 text-red-500 text-sm">{error}</div>
        ) : feedback.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">
            No feedback yet. The feedback widget is live on all dashboard pages.
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  From
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Category
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Feedback
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Page
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Date
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-50">
              {feedback.map((f) => (
                <tr key={f.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-gray-800 whitespace-nowrap">
                    {f.profiles
                      ? `${f.profiles.first_name} ${f.profiles.last_name}`
                      : "Unknown"}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="inline-block rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                      {CATEGORY_LABELS[f.category] ?? f.category}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-700 max-w-xs truncate">
                    {f.body}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-400 max-w-[140px] truncate">
                    {f.page_url ?? "-"}
                  </td>
                  <td className="px-4 py-2.5">
                    <select
                      value={f.status}
                      onChange={(e) => updateStatus(f.id, e.target.value)}
                      disabled={updating === f.id}
                      className={`text-xs px-2 py-1 rounded-full font-medium border-0 cursor-pointer ${STATUS_COLORS[f.status] ?? "bg-gray-100 text-gray-600"} ${updating === f.id ? "opacity-50" : ""}`}
                    >
                      <option value="open">Open</option>
                      <option value="acknowledged">Acknowledged</option>
                      <option value="resolved">Resolved</option>
                      <option value="wontfix">Won&apos;t fix</option>
                    </select>
                  </td>
                  <td className="px-4 py-2.5 text-gray-400 text-xs whitespace-nowrap">
                    {format(parseISO(f.created_at), "d MMM HH:mm")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
