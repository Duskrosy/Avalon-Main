"use client";

import { useState, useMemo, Fragment, useEffect } from "react";
import { format, parseISO } from "date-fns";
import type { PublicTicket } from "./page";

type Priority = PublicTicket["priority"];
type SortKey = "created_at" | "priority" | "status" | "category";
type TabKey = "mine" | "others" | "all";

type Comment = {
  id: string;
  body: string;
  created_at: string;
  author: { id: string; first_name: string; last_name: string; avatar_url: string | null } | null;
};

type Attachment = {
  id: string;
  path: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
  url: string | null;
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

const PRIORITY_RANK: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
const STATUS_RANK: Record<string, number> = { open: 0, acknowledged: 1, resolved: 2, wontfix: 3 };

const CATEGORY_LABELS: Record<string, string> = {
  bug: "Bug",
  missing_feature: "Missing feature",
  confusing: "Confusing",
  slow: "Slow",
  other: "Other",
};

function shortId(id: string): string {
  return id.slice(0, 8);
}

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
  const [activeTab, setActiveTab] = useState<TabKey>("mine");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, Comment[]>>({});
  const [attachments, setAttachments] = useState<Record<string, Attachment[]>>({});
  const [replyDraft, setReplyDraft] = useState<Record<string, string>>({});
  const [replying, setReplying] = useState<string | null>(null);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const deptName = useMemo(() => {
    const m: Record<string, string> = {};
    for (const d of departments) m[d.id] = d.name;
    return m;
  }, [departments]);

  const tabCounts = useMemo(() => {
    let mine = 0;
    let others = 0;
    for (const t of tickets) {
      if (t.user_id === currentUserId) mine++;
      else others++;
    }
    return { mine, others, all: tickets.length };
  }, [tickets, currentUserId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = tickets.filter((t) => {
      if (activeTab === "mine" && t.user_id !== currentUserId) return false;
      if (activeTab === "others" && t.user_id === currentUserId) return false;
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (categoryFilter !== "all" && t.category !== categoryFilter) return false;
      if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;
      if (deptFilter !== "all" && t.department_id !== deptFilter) return false;
      if (q) {
        const dept = t.department_id ? deptName[t.department_id] ?? "" : "";
        const hay = `${t.id} ${t.body} ${t.category} ${t.status} ${t.priority} ${dept}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const sorted = [...base].sort((a, b) => {
      let cmp = 0;
      if (sortBy === "created_at") {
        cmp = a.created_at.localeCompare(b.created_at);
      } else if (sortBy === "priority") {
        cmp = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      } else if (sortBy === "status") {
        cmp = (STATUS_RANK[a.status] ?? 99) - (STATUS_RANK[b.status] ?? 99);
      } else if (sortBy === "category") {
        cmp = a.category.localeCompare(b.category);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return sorted;
  }, [
    tickets, activeTab, currentUserId, search,
    statusFilter, categoryFilter, priorityFilter, deptFilter,
    sortBy, sortDir, deptName,
  ]);

  useEffect(() => {
    if (!expandedId) return;
    if (!comments[expandedId]) {
      fetch(`/api/feedback/${expandedId}/comments`)
        .then((r) => (r.ok ? r.json() : { comments: [] }))
        .then((data) => setComments((prev) => ({ ...prev, [expandedId]: data.comments ?? [] })))
        .catch(() => { /* non-critical */ });
    }
    if (!attachments[expandedId]) {
      fetch(`/api/feedback/${expandedId}/attachments`)
        .then((r) => (r.ok ? r.json() : { attachments: [] }))
        .then((data) => setAttachments((prev) => ({ ...prev, [expandedId]: data.attachments ?? [] })))
        .catch(() => { /* non-critical */ });
    }
  }, [expandedId, comments, attachments]);

  function reporterLabel(t: PublicTicket): string {
    if (t.user_id === currentUserId) return "You";
    const dept = t.department_id ? deptName[t.department_id] : null;
    return dept ? `Someone in ${dept}` : "Anonymous";
  }

  function toggleSort(key: SortKey) {
    if (sortBy === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortBy(key);
      setSortDir(key === "created_at" ? "desc" : "asc");
    }
  }

  function canReply(t: PublicTicket): boolean {
    return currentUserIsOps || t.user_id === currentUserId;
  }

  async function copyId(id: string) {
    try {
      await navigator.clipboard?.writeText(id);
      setCopiedId(id);
      setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1200);
    } catch {
      /* noop */
    }
  }

  async function submitReply(ticketId: string) {
    const body = (replyDraft[ticketId] ?? "").trim();
    if (!body) return;
    setReplying(ticketId);
    setReplyError(null);
    try {
      const res = await fetch(`/api/feedback/${ticketId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data.error === "string" ? data.error : "Failed to send reply");
      }
      const data = await res.json();
      setComments((prev) => ({
        ...prev,
        [ticketId]: [...(prev[ticketId] ?? []), data.comment],
      }));
      setReplyDraft((prev) => ({ ...prev, [ticketId]: "" }));
    } catch (err) {
      setReplyError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setReplying(null);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">Pulse Tickets</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          Transparent view of all feedback tickets across the company · OPS replies are public
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-[var(--color-border-secondary)]">
        <TabBtn active={activeTab === "mine"} onClick={() => setActiveTab("mine")} label="My Tickets" count={tabCounts.mine} />
        <TabBtn active={activeTab === "others"} onClick={() => setActiveTab("others")} label="Others' Tickets" count={tabCounts.others} />
        <TabBtn active={activeTab === "all"} onClick={() => setActiveTab("all")} label="All" count={tabCounts.all} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4 text-xs">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by ID, body, department…"
          className="flex-1 min-w-[200px] rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] px-3 py-1.5 focus:outline-none focus:border-[var(--color-accent)]"
        />
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
              <th className="px-4 py-2.5 text-left font-medium">ID</th>
              <SortHeader label="Priority" active={sortBy === "priority"} dir={sortDir} onClick={() => toggleSort("priority")} />
              <SortHeader label="Category" active={sortBy === "category"} dir={sortDir} onClick={() => toggleSort("category")} />
              <th className="px-4 py-2.5 text-left font-medium">Feedback</th>
              <SortHeader label="Status" active={sortBy === "status"} dir={sortDir} onClick={() => toggleSort("status")} />
              <th className="px-4 py-2.5 text-left font-medium">Replies</th>
              <SortHeader label="Date" active={sortBy === "created_at"} dir={sortDir} onClick={() => toggleSort("created_at")} />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border-secondary)]">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-[var(--color-text-tertiary)]">
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
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); copyId(t.id); }}
                      title={`Copy ticket ID: ${t.id}`}
                      className="font-mono text-[11px] text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] underline-offset-2 hover:underline"
                    >
                      {copiedId === t.id ? "Copied!" : shortId(t.id)}
                    </button>
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
                    <td colSpan={8} className="px-4 py-4">
                      <div className="space-y-3">
                        <div>
                          <p className="text-[10px] uppercase tracking-wide text-[var(--color-text-tertiary)] mb-1">
                            Ticket ID · <span className="font-mono normal-case">{t.id}</span>
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wide text-[var(--color-text-tertiary)] mb-1">Full feedback</p>
                          <p className="text-sm text-[var(--color-text-primary)] whitespace-pre-wrap">{t.body}</p>
                        </div>

                        {(attachments[t.id] ?? []).length > 0 && (
                          <div>
                            <p className="text-[10px] uppercase tracking-wide text-[var(--color-text-tertiary)] mb-1">
                              Attachments ({attachments[t.id]?.length ?? 0})
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {(attachments[t.id] ?? []).map((a) => (
                                a.url ? (
                                  <a
                                    key={a.id}
                                    href={a.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="block w-24 h-24 rounded border border-[var(--color-border-primary)] overflow-hidden hover:ring-2 hover:ring-[var(--color-accent)] transition"
                                  >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={a.url} alt="" className="h-full w-full object-cover" />
                                  </a>
                                ) : (
                                  <div key={a.id} className="w-24 h-24 rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-tertiary)] flex items-center justify-center text-[10px] text-[var(--color-text-tertiary)]">
                                    image
                                  </div>
                                )
                              ))}
                            </div>
                          </div>
                        )}

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

                          {canReply(t) ? (
                            <div className="mt-3 space-y-2">
                              <textarea
                                value={replyDraft[t.id] ?? ""}
                                onChange={(e) => setReplyDraft((prev) => ({ ...prev, [t.id]: e.target.value }))}
                                placeholder={currentUserIsOps ? "Reply publicly as OPS…" : "Reply to your ticket…"}
                                rows={2}
                                maxLength={5000}
                                onClick={(e) => e.stopPropagation()}
                                className="w-full resize-none rounded-[var(--radius-md)] border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-accent)] focus:outline-none"
                              />
                              {replyError && replying === null && (
                                <p className="text-xs text-[var(--color-error)]">{replyError}</p>
                              )}
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] text-[var(--color-text-tertiary)]">
                                  {currentUserIsOps ? "Your reply will be visible to the reporter." : "Only you and OPS can see this reply."}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); submitReply(t.id); }}
                                  disabled={replying === t.id || !(replyDraft[t.id] ?? "").trim()}
                                  className="rounded-[var(--radius-md)] bg-[var(--color-text-primary)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-inverted)] hover:bg-[var(--color-text-secondary)] disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {replying === t.id ? "Sending…" : "Send reply"}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <p className="text-[10px] text-[var(--color-text-tertiary)] italic mt-2">
                              Only the reporter and OPS can reply on this ticket.
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

function TabBtn({
  active, onClick, label, count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
        active
          ? "border-[var(--color-accent)] text-[var(--color-text-primary)]"
          : "border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
      }`}
    >
      {label}
      <span className="ml-1.5 text-xs text-[var(--color-text-tertiary)]">{count}</span>
    </button>
  );
}

function SortHeader({
  label, active, dir, onClick,
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
}) {
  return (
    <th className="px-4 py-2.5 text-left font-medium">
      <button
        type="button"
        onClick={onClick}
        className={`flex items-center gap-1 uppercase tracking-wide ${
          active ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
        }`}
      >
        {label}
        {active && <span className="text-[9px]">{dir === "asc" ? "▲" : "▼"}</span>}
      </button>
    </th>
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
