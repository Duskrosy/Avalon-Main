"use client";

import { useState, useEffect, Fragment } from "react";
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
  acknowledged: "bg-[var(--color-accent-light)] text-[var(--color-accent)]",
  resolved: "bg-[var(--color-success-light)] text-green-800",
  wontfix: "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]",
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
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
      // Refresh to get server state on failure
      fetchFeedback();
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
        <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4">
          <p className="text-xs text-[var(--color-text-secondary)] mb-1">Total Feedback</p>
          <p className="text-2xl font-bold text-[var(--color-text-primary)]">{totalCount}</p>
        </div>
        <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4">
          <p className="text-xs text-[var(--color-text-secondary)] mb-1">Open</p>
          <p className="text-2xl font-bold text-yellow-600">{openCount}</p>
        </div>
        <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4">
          <p className="text-xs text-[var(--color-text-secondary)] mb-1">Acknowledged</p>
          <p className="text-2xl font-bold text-[var(--color-accent)]">
            {feedback.filter((f) => f.status === "acknowledged").length}
          </p>
        </div>
        <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4">
          <p className="text-xs text-[var(--color-text-secondary)] mb-1">Resolved</p>
          <p className="text-2xl font-bold text-[var(--color-success)]">
            {feedback.filter((f) => f.status === "resolved").length}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="text-xs px-3 py-1.5 rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] focus:border-[var(--color-accent)] focus:outline-none"
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
          className="text-xs px-3 py-1.5 rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] focus:border-[var(--color-accent)] focus:outline-none"
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
          className="text-xs px-3 py-1.5 rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-primary)] transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Feedback table */}
      <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--color-border-secondary)]">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">User Feedback</h2>
        </div>

        {loading ? (
          <div className="text-center py-16 text-[var(--color-text-tertiary)] text-sm">Loading...</div>
        ) : error ? (
          <div className="text-center py-16 text-[var(--color-error)] text-sm">{error}</div>
        ) : feedback.length === 0 ? (
          <div className="text-center py-16 text-[var(--color-text-tertiary)] text-sm">
            No feedback yet. The feedback widget is live on all dashboard pages.
          </div>
        ) : (
          <table className="min-w-full divide-y divide-[var(--color-border-secondary)] text-sm">
            <thead className="bg-[var(--color-bg-secondary)]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase">
                  From
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase">
                  Category
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase">
                  Feedback
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase">
                  Page
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase">
                  Date
                </th>
              </tr>
            </thead>
            <tbody className="bg-[var(--color-bg-primary)] divide-y divide-[var(--color-border-secondary)]">
              {feedback.map((f) => (
                <Fragment key={f.id}>
                <tr
                  className="hover:bg-[var(--color-surface-hover)] cursor-pointer"
                  onClick={() => setExpandedId(expandedId === f.id ? null : f.id)}
                >
                  <td className="px-4 py-2.5 text-[var(--color-text-primary)] whitespace-nowrap">
                    <span className="flex items-center gap-1.5">
                      <span className={`text-[var(--color-text-tertiary)] text-[10px] transition-transform ${expandedId === f.id ? "rotate-90" : ""}`}>&#9654;</span>
                      {f.profiles
                        ? `${f.profiles.first_name} ${f.profiles.last_name}`
                        : "Unknown"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="inline-block rounded bg-[var(--color-bg-tertiary)] px-2 py-0.5 text-xs text-[var(--color-text-primary)]">
                      {CATEGORY_LABELS[f.category] ?? f.category}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-[var(--color-text-primary)] max-w-xs truncate">
                    {f.body}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-[var(--color-text-tertiary)] max-w-[140px] truncate">
                    {f.page_url ?? "-"}
                  </td>
                  <td className="px-4 py-2.5">
                    <select
                      value={f.status}
                      onChange={(e) => updateStatus(f.id, e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      disabled={updating === f.id}
                      className={`text-xs px-2 py-1 rounded-full font-medium border-0 cursor-pointer ${STATUS_COLORS[f.status] ?? "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]"} ${updating === f.id ? "opacity-50" : ""}`}
                    >
                      <option value="open">Open</option>
                      <option value="acknowledged">Acknowledged</option>
                      <option value="resolved">Resolved</option>
                      <option value="wontfix">Won&apos;t fix</option>
                    </select>
                  </td>
                  <td className="px-4 py-2.5 text-[var(--color-text-tertiary)] text-xs whitespace-nowrap">
                    {f.created_at
                      ? format(parseISO(f.created_at), "d MMM HH:mm")
                      : "-"}
                  </td>
                </tr>
                {expandedId === f.id && (
                  <tr className="bg-[var(--color-bg-secondary)]/80">
                    <td colSpan={6} className="px-4 py-4">
                      <div className="space-y-3 max-w-3xl">
                        {/* Full feedback body */}
                        <div>
                          <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-1">Full Feedback</p>
                          <p className="text-sm text-[var(--color-text-primary)] whitespace-pre-wrap leading-relaxed">{f.body}</p>
                        </div>

                        {/* Metadata grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-3 border-t border-[var(--color-border-primary)]">
                          <div>
                            <p className="text-[10px] text-[var(--color-text-tertiary)] uppercase tracking-wide">Submitted by</p>
                            <p className="text-sm text-[var(--color-text-primary)] mt-0.5">
                              {f.profiles ? `${f.profiles.first_name} ${f.profiles.last_name}` : "Unknown"}
                            </p>
                            {f.profiles?.email && (
                              <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">{f.profiles.email}</p>
                            )}
                          </div>
                          <div>
                            <p className="text-[10px] text-[var(--color-text-tertiary)] uppercase tracking-wide">Category</p>
                            <p className="text-sm text-[var(--color-text-primary)] mt-0.5">{CATEGORY_LABELS[f.category] ?? f.category}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-[var(--color-text-tertiary)] uppercase tracking-wide">Page</p>
                            <p className="text-sm font-mono text-[var(--color-text-secondary)] break-all mt-0.5">{f.page_url ?? "\u2014"}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-[var(--color-text-tertiary)] uppercase tracking-wide">Submitted</p>
                            <p className="text-sm text-[var(--color-text-primary)] mt-0.5">
                              {f.created_at ? format(parseISO(f.created_at), "d MMM yyyy 'at' HH:mm") : "\u2014"}
                            </p>
                          </div>
                        </div>

                        {/* Department + ID row */}
                        <div className="flex items-center gap-4 pt-3 border-t border-[var(--color-border-primary)]">
                          {f.department_id && (
                            <div>
                              <span className="text-[10px] text-[var(--color-text-tertiary)] uppercase tracking-wide">Dept: </span>
                              <span className="text-xs font-mono text-[var(--color-text-secondary)]">{f.department_id.slice(0, 8)}...</span>
                            </div>
                          )}
                          <div>
                            <span className="text-[10px] text-[var(--color-text-tertiary)] uppercase tracking-wide">ID: </span>
                            <span className="text-xs font-mono text-[var(--color-text-secondary)]">{f.id.slice(0, 8)}...</span>
                          </div>
                          <div className="ml-auto">
                            <select
                              value={f.status}
                              onChange={(e) => {
                                e.stopPropagation();
                                updateStatus(f.id, e.target.value);
                              }}
                              onClick={(e) => e.stopPropagation()}
                              disabled={updating === f.id}
                              className={`text-xs px-2 py-1 rounded-full font-medium border-0 cursor-pointer ${STATUS_COLORS[f.status] ?? "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]"} ${updating === f.id ? "opacity-50" : ""}`}
                            >
                              <option value="open">Open</option>
                              <option value="acknowledged">Acknowledged</option>
                              <option value="resolved">Resolved</option>
                              <option value="wontfix">Won&apos;t fix</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
