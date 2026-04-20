"use client";

import { useState, useMemo, Fragment, useEffect } from "react";
import { format, parseISO } from "date-fns";
import type { PublicTicket } from "./page";

type Priority = PublicTicket["priority"];

type Comment = {
  id: string;
  body: string;
  created_at: string;
  author: { id: string; first_name: string; last_name: string; avatar_url: string | null } | null;
};

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  acknowledged: "Acknowledged",
  resolved: "Resolved",
  wontfix: "Won't fix",
};

const STATUS_COLORS: Record<string, string> = {
  open: "bg-yellow-100 text-yellow-800",
  acknowledged: "bg-[var(--color-accent-light)] text-[var(--color-accent)]",
  resolved: "bg-[var(--color-success-light)] text-green-800",
  wontfix: "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]",
};

const PRIORITY_COLORS: Record<Priority, string> = {
  low: "bg-gray-100 text-gray-700",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-amber-100 text-amber-800",
  urgent: "bg-red-100 text-red-700",
};

const CATEGORY_LABELS: Record<string, string> = {
  bug: "Bug",
  missing_feature: "Missing feature",
  confusing: "Confusing",
  slow: "Slow",
  other: "Other",
};

export function TicketsView({
  initialTickets,
  departments,
  currentUserId,
  currentUserIsOps,
}: {
  initialTickets: PublicTicket[];
  departments: { id: string; name: string }[];
  currentUserId: string;
  currentUserIsOps: boolean;
}) {
  const [tickets] = useState<PublicTicket[]>(initialTickets);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, Comment[]>>({});

  const deptName = useMemo(() => {
    const m: Record<string, string> = {};
    for (const d of departments) m[d.id] = d.name;
    return m;
  }, [departments]);

  const filtered = useMemo(() => {
    return tickets.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (categoryFilter !== "all" && t.category !== categoryFilter) return false;
      if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;
      if (deptFilter !== "all" && t.department_id !== deptFilter) return false;
      return true;
    });
  }, [tickets, statusFilter, categoryFilter, priorityFilter, deptFilter]);

  useEffect(() => {
    if (!expandedId || comments[expandedId]) return;
    fetch(`/api/feedback/${expandedId}/comments`)
      .then((r) => (r.ok ? r.json() : { comments: [] }))
      .then((data) => setComments((prev) => ({ ...prev, [expandedId]: data.comments ?? [] })))
      .catch(() => { /* non-critical */ });
  }, [expandedId, comments]);

  function reporterLabel(t: PublicTicket): string {
    if (t.user_id === currentUserId) return "You";
    const dept = t.department_id ? deptName[t.department_id] : null;
    return dept ? `Someone in ${dept}` : "Anonymous";
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">Pulse Tickets</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          Transparent view of all feedback tickets across the company · OPS replies are public
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4 text-xs">
        <Select value={statusFilter} onChange={setStatusFilter} options={[
          { value: "all", label: "All statuses" },
          { value: "open", label: "Open" },
          { value: "acknowledged", label: "Acknowledged" },
          { value: "resolved", label: "Resolved" },
          { value: "wontfix", label: "Won't fix" },
        ]} />
        <Select value={categoryFilter} onChange={setCategoryFilter} options={[
          { value: "all", label: "All categories" },
          { value: "bug", label: "Bug" },
          { value: "missing_feature", label: "Missing feature" },
          { value: "confusing", label: "Confusing" },
          { value: "slow", label: "Slow" },
          { value: "other", label: "Other" },
        ]} />
        <Select value={priorityFilter} onChange={setPriorityFilter} options={[
          { value: "all", label: "All priorities" },
          { value: "urgent", label: "Urgent" },
          { value: "high", label: "High" },
          { value: "medium", label: "Medium" },
          { value: "low", label: "Low" },
        ]} />
        <Select value={deptFilter} onChange={setDeptFilter} options={[
          { value: "all", label: "All departments" },
          ...departments.map((d) => ({ value: d.id, label: d.name })),
        ]} />
        <div className="ml-auto text-[var(--color-text-secondary)] self-center">
          {filtered.length} ticket{filtered.length === 1 ? "" : "s"}
        </div>
      </div>

      <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-[var(--color-bg-secondary)] text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium">From</th>
              <th className="px-4 py-2.5 text-left font-medium">Priority</th>
              <th className="px-4 py-2.5 text-left font-medium">Category</th>
              <th className="px-4 py-2.5 text-left font-medium">Feedback</th>
              <th className="px-4 py-2.5 text-left font-medium">Status</th>
              <th className="px-4 py-2.5 text-left font-medium">Replies</th>
              <th className="px-4 py-2.5 text-left font-medium">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border-secondary)]">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-[var(--color-text-tertiary)]">
                  No tickets match the filters.
                </td>
              </tr>
            )}
            {filtered.map((t) => (
              <Fragment key={t.id}>
                <tr
                  className="hover:bg-[var(--color-surface-hover)] cursor-pointer"
                  onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
                >
                  <td className="px-4 py-2.5 text-[var(--color-text-primary)]">
                    <span className="flex items-center gap-1.5">
                      <span className={`text-[var(--color-text-tertiary)] text-[10px] transition-transform ${expandedId === t.id ? "rotate-90" : ""}`}>&#9654;</span>
                      {reporterLabel(t)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${PRIORITY_COLORS[t.priority]}`}>
                      {t.priority}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="inline-block rounded bg-[var(--color-bg-tertiary)] px-2 py-0.5 text-xs text-[var(--color-text-primary)]">
                      {CATEGORY_LABELS[t.category] ?? t.category}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-[var(--color-text-primary)] max-w-md truncate">{t.body}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[t.status] ?? ""}`}>
                      {STATUS_LABEL[t.status] ?? t.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-[var(--color-text-secondary)]">
                    {t.comment_count > 0 ? `${t.comment_count}` : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-[var(--color-text-tertiary)] text-xs">
                    {format(parseISO(t.created_at), "d MMM HH:mm")}
                  </td>
                </tr>

                {expandedId === t.id && (
                  <tr className="bg-[var(--color-bg-secondary)]/60">
                    <td colSpan={7} className="px-4 py-4">
                      <div className="space-y-3">
                        <div>
                          <p className="text-[10px] uppercase tracking-wide text-[var(--color-text-tertiary)] mb-1">Full feedback</p>
                          <p className="text-sm text-[var(--color-text-primary)] whitespace-pre-wrap">{t.body}</p>
                        </div>

                        <div>
                          <p className="text-[10px] uppercase tracking-wide text-[var(--color-text-tertiary)] mb-1">Replies</p>
                          {(comments[t.id] ?? []).length === 0 ? (
                            <p className="text-xs text-[var(--color-text-tertiary)] italic">No replies yet.</p>
                          ) : (
                            <div className="space-y-2">
                              {(comments[t.id] ?? []).map((c) => (
                                <div key={c.id} className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded px-2.5 py-1.5">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-medium text-[var(--color-text-primary)]">
                                      {c.author ? `${c.author.first_name} ${c.author.last_name}` : "Unknown"}
                                    </span>
                                    <span className="text-[10px] text-[var(--color-text-tertiary)]">
                                      {format(parseISO(c.created_at), "d MMM HH:mm")}
                                    </span>
                                  </div>
                                  <p className="text-xs text-[var(--color-text-primary)] whitespace-pre-wrap mt-0.5">{c.body}</p>
                                </div>
                              ))}
                            </div>
                          )}
                          {currentUserIsOps && (
                            <p className="text-[10px] text-[var(--color-text-tertiary)] italic mt-2">
                              Reply from the admin Pulse tab.
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] px-3 py-1.5 focus:outline-none focus:border-[var(--color-accent)]"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
