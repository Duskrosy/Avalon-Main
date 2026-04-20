"use client";

import { useState, useEffect, Fragment, useRef } from "react";
import { format, parseISO } from "date-fns";
import { toCSV, toMarkdown, downloadFile } from "@/lib/export/format";

type Priority = "low" | "medium" | "high" | "urgent";

type FeedbackItem = {
  id: string;
  category: string;
  body: string;
  page_url: string | null;
  user_agent: string | null;
  status: string;
  priority: Priority;
  notes: string | null;
  merged_into_id: string | null;
  merged_into: { id: string; body: string; status: string } | null;
  created_at: string;
  updated_at: string | null;
  department_id: string | null;
  department: { name: string } | null;
  profiles: { first_name: string; last_name: string; email: string } | null;
};

type FeedbackComment = {
  id: string;
  body: string;
  created_at: string;
  author: { id: string; first_name: string; last_name: string; avatar_url: string | null } | null;
};

const PRIORITY_RANK: Record<Priority, number> = { urgent: 3, high: 2, medium: 1, low: 0 };
const PRIORITY_COLORS: Record<Priority, string> = {
  low: "bg-gray-100 text-gray-700",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-amber-100 text-amber-800",
  urgent: "bg-red-100 text-red-700",
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

function parseDeviceInfo(ua: string): { browser: string; os: string } {
  let browser = "Browser";
  if (ua.includes("Edg/"))                                      browser = "Edge";
  else if (ua.includes("OPR/") || ua.includes("Opera/"))       browser = "Opera";
  else if (ua.includes("Chrome/") && !ua.includes("Chromium")) browser = "Chrome";
  else if (ua.includes("Firefox/"))                            browser = "Firefox";
  else if (ua.includes("Safari/") && !ua.includes("Chrome"))   browser = "Safari";

  let os = "Unknown";
  if (ua.includes("iPhone"))        os = "iPhone";
  else if (ua.includes("iPad"))     os = "iPad";
  else if (ua.includes("Android"))  os = "Android";
  else if (ua.includes("Mac OS X")) os = "macOS";
  else if (ua.includes("Windows"))  os = "Windows";
  else if (ua.includes("Linux"))    os = "Linux";

  return { browser, os };
}

export function PulseTab() {
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [showMerged, setShowMerged] = useState(false);
  const [comments, setComments] = useState<Record<string, FeedbackComment[]>>({});
  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({});
  const [mergeSearch, setMergeSearch] = useState<Record<string, string>>({});
  const notesTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [updating, setUpdating] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [exportStatus, setExportStatus] = useState<string>("unresolved");
  const [exportFrom, setExportFrom] = useState<string>("");
  const [exportTo, setExportTo] = useState<string>("");
  const [goals, setGoals]           = useState<{ id: string; title: string }[]>([]);
  const [linkingId, setLinkingId]   = useState<string | null>(null); // feedback row being linked
  const [linkGoalId, setLinkGoalId] = useState<string>("");
  const [linking, setLinking]       = useState(false);
  const [linkedMap, setLinkedMap]   = useState<Record<string, string[]>>({}); // feedbackId -> goalIds[]

  useEffect(() => { fetchFeedback(); fetchGoals(); }, [statusFilter, categoryFilter]);

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
      const loadedFeedback = data.feedback ?? [];
      setFeedback(loadedFeedback);
      fetchLinked(loadedFeedback.map((f: { id: string }) => f.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load feedback");
    } finally {
      setLoading(false);
    }
  }

  async function fetchGoals() {
    try {
      const res = await fetch("/api/feature-goals");
      if (!res.ok) return;
      const data = await res.json();
      setGoals((data.goals ?? []).map((g: { id: string; title: string }) => ({ id: g.id, title: g.title })));
    } catch { /* non-critical */ }
  }

  async function fetchLinked(feedbackIds: string[]) {
    // Build a map of feedbackId -> linked goalIds by reading the embedded tickets
    // from the goals response (avoids a separate query)
    void feedbackIds; // used for conceptual filtering; currently loads all
    try {
      const res = await fetch("/api/feature-goals");
      if (!res.ok) return;
      const data = await res.json();
      const map: Record<string, string[]> = {};
      for (const goal of data.goals ?? []) {
        for (const t of goal.feature_goal_tickets ?? []) {
          if (!map[t.feedback_id]) map[t.feedback_id] = [];
          map[t.feedback_id].push(goal.id);
        }
      }
      setLinkedMap(map);
    } catch { /* non-critical */ }
  }

  async function patchFeedback(id: string, patch: Record<string, unknown>) {
    setUpdating(id);
    try {
      const res = await fetch("/api/feedback", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      if (!res.ok) throw new Error("Failed to update");
      setFeedback((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } as FeedbackItem : f)));
    } catch {
      fetchFeedback();
    } finally {
      setUpdating(null);
    }
  }

  function updateStatus(id: string, newStatus: string) {
    return patchFeedback(id, { status: newStatus });
  }

  function setPriority(id: string, newPriority: Priority) {
    return patchFeedback(id, { priority: newPriority });
  }

  function saveNotesDebounced(id: string, value: string) {
    setFeedback((prev) => prev.map((f) => (f.id === id ? { ...f, notes: value } : f)));
    if (notesTimers.current[id]) clearTimeout(notesTimers.current[id]);
    notesTimers.current[id] = setTimeout(() => {
      patchFeedback(id, { notes: value || null });
    }, 500);
  }

  async function mergeInto(id: string, targetId: string | null) {
    await patchFeedback(id, { merged_into_id: targetId });
    if (targetId) {
      setMergeSearch((m) => ({ ...m, [id]: "" }));
    }
  }

  async function loadComments(feedbackId: string) {
    try {
      const res = await fetch(`/api/feedback/${feedbackId}/comments`);
      if (!res.ok) return;
      const data = await res.json();
      setComments((prev) => ({ ...prev, [feedbackId]: data.comments ?? [] }));
    } catch { /* non-critical */ }
  }

  async function postComment(feedbackId: string) {
    const body = (commentDraft[feedbackId] ?? "").trim();
    if (!body) return;
    const res = await fetch(`/api/feedback/${feedbackId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    if (!res.ok) return;
    const data = await res.json();
    setComments((prev) => ({
      ...prev,
      [feedbackId]: [...(prev[feedbackId] ?? []), data.comment],
    }));
    setCommentDraft((d) => ({ ...d, [feedbackId]: "" }));
  }

  async function handleLink(feedbackId: string) {
    if (!linkGoalId) return;
    setLinking(true);
    try {
      const res = await fetch(`/api/feature-goals/${linkGoalId}/tickets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback_id: feedbackId }),
      });
      if (!res.ok) {
        const d = await res.json();
        if (d.error === "Already linked") {
          alert("This ticket is already linked to that goal.");
        }
        return;
      }
      setLinkingId(null);
      setLinkGoalId("");
      // Refresh linked map
      const allIds = feedback.map(f => f.id);
      await fetchLinked(allIds);
    } finally {
      setLinking(false);
    }
  }

  function exportData(fmt: "csv" | "md") {
    const columns = [
      { key: "from", label: "From" },
      { key: "email", label: "Email" },
      { key: "department", label: "Department" },
      { key: "category", label: "Category" },
      { key: "body", label: "Feedback" },
      { key: "page_url", label: "Page" },
      { key: "status", label: "Status" },
      { key: "date", label: "Date" },
    ];

    let filtered = feedback;

    if (exportStatus === "unresolved") {
      filtered = filtered.filter((f) => f.status === "open" || f.status === "acknowledged");
    } else if (exportStatus !== "all") {
      filtered = filtered.filter((f) => f.status === exportStatus);
    }

    if (exportFrom) {
      const fromDate = new Date(exportFrom);
      filtered = filtered.filter((f) => new Date(f.created_at) >= fromDate);
    }
    if (exportTo) {
      const toDate = new Date(exportTo + "T23:59:59");
      filtered = filtered.filter((f) => new Date(f.created_at) <= toDate);
    }

    const rows = filtered.map((f) => ({
      from: f.profiles ? `${f.profiles.first_name} ${f.profiles.last_name}` : "Unknown",
      email: f.profiles?.email ?? "",
      department: f.department?.name ?? "",
      category: CATEGORY_LABELS[f.category] ?? f.category,
      body: f.body,
      page_url: f.page_url ?? "",
      status: f.status,
      date: f.created_at ? format(parseISO(f.created_at), "yyyy-MM-dd HH:mm") : "",
    }));

    if (rows.length === 0) return;

    const timestamp = format(new Date(), "yyyy-MM-dd");
    if (fmt === "csv") {
      downloadFile(toCSV(rows, columns), `feedback-${timestamp}.csv`, "text/csv;charset=utf-8;");
    } else {
      const md = `# Feedback Export — ${timestamp}\n\n${toMarkdown(rows, columns)}`;
      downloadFile(md, `feedback-${timestamp}.md`, "text/markdown;charset=utf-8;");
    }
    setShowExport(false);
  }

  const visibleFeedback = (showMerged ? feedback : feedback.filter((f) => !f.merged_into_id))
    .filter((f) => priorityFilter === "all" || f.priority === priorityFilter)
    .slice()
    .sort((a, b) => {
      const p = (PRIORITY_RANK[b.priority] ?? 0) - (PRIORITY_RANK[a.priority] ?? 0);
      if (p !== 0) return p;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  const openCount = feedback.filter((f) => f.status === "open").length;

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4">
          <p className="text-xs text-[var(--color-text-secondary)] mb-1">Total Feedback</p>
          <p className="text-2xl font-bold text-[var(--color-text-primary)]">{feedback.length}</p>
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
      <div className="flex items-center gap-3 flex-wrap">
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
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="text-xs px-3 py-1.5 rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] focus:border-[var(--color-accent)] focus:outline-none"
        >
          <option value="all">All priorities</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <label className="flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)] cursor-pointer">
          <input
            type="checkbox"
            checked={showMerged}
            onChange={(e) => setShowMerged(e.target.checked)}
          />
          Show merged
        </label>
        <button
          onClick={fetchFeedback}
          className="text-xs px-3 py-1.5 rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-primary)] transition-colors"
        >
          Refresh
        </button>
        <button
          onClick={() => setShowExport(!showExport)}
          disabled={feedback.length === 0}
          className="ml-auto text-xs px-3 py-1.5 rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] text-[var(--color-text-secondary)] hover:border-[var(--color-accent)] disabled:opacity-50 transition-colors"
        >
          Export
        </button>
      </div>

      {/* Export panel */}
      {showExport && (
        <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4 space-y-3">
          <p className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide">Export Options</p>
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <label className="block text-[10px] text-[var(--color-text-tertiary)] mb-1">Status</label>
              <select
                value={exportStatus}
                onChange={(e) => setExportStatus(e.target.value)}
                className="text-xs px-3 py-1.5 rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] focus:border-[var(--color-accent)] focus:outline-none"
              >
                <option value="unresolved">Unresolved (open + acknowledged)</option>
                <option value="all">All statuses</option>
                <option value="open">Open only</option>
                <option value="acknowledged">Acknowledged only</option>
                <option value="resolved">Resolved only</option>
                <option value="wontfix">Won&apos;t fix only</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-[var(--color-text-tertiary)] mb-1">From</label>
              <input
                type="date"
                value={exportFrom}
                onChange={(e) => setExportFrom(e.target.value)}
                className="text-xs px-3 py-1.5 rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] focus:border-[var(--color-accent)] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] text-[var(--color-text-tertiary)] mb-1">To</label>
              <input
                type="date"
                value={exportTo}
                onChange={(e) => setExportTo(e.target.value)}
                className="text-xs px-3 py-1.5 rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] focus:border-[var(--color-accent)] focus:outline-none"
              />
            </div>
            <button
              onClick={() => exportData("csv")}
              className="text-xs px-3 py-1.5 rounded-lg bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] hover:bg-[var(--color-text-secondary)] transition-colors"
            >
              Download CSV
            </button>
            <button
              onClick={() => exportData("md")}
              className="text-xs px-3 py-1.5 rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] text-[var(--color-text-secondary)] hover:border-[var(--color-accent)] transition-colors"
            >
              Download MD
            </button>
          </div>
        </div>
      )}

      {/* Feedback table */}
      <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--color-border-secondary)]">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">User Feedback</h2>
        </div>

        {loading ? (
          <div className="text-center py-16 text-[var(--color-text-tertiary)] text-sm">Loading...</div>
        ) : error ? (
          <div className="text-center py-16 text-[var(--color-error)] text-sm">{error}</div>
        ) : visibleFeedback.length === 0 ? (
          <div className="text-center py-16 text-[var(--color-text-tertiary)] text-sm">
            No feedback matches the filters.
          </div>
        ) : (
          <table className="min-w-full divide-y divide-[var(--color-border-secondary)] text-sm">
            <thead className="bg-[var(--color-bg-secondary)]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase">From</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase">Priority</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase">Category</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase">Feedback</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase">Page</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase">Date</th>
              </tr>
            </thead>
            <tbody className="bg-[var(--color-bg-primary)] divide-y divide-[var(--color-border-secondary)]">
              {visibleFeedback.map((f) => (
                <Fragment key={f.id}>
                  <tr
                    className="hover:bg-[var(--color-surface-hover)] cursor-pointer"
                    onClick={() => {
                      const next = expandedId === f.id ? null : f.id;
                      setExpandedId(next);
                      if (next && !comments[next]) loadComments(next);
                    }}
                  >
                    <td className="px-4 py-2.5 text-[var(--color-text-primary)] whitespace-nowrap">
                      <span className="flex items-center gap-1.5">
                        <span className={`text-[var(--color-text-tertiary)] text-[10px] transition-transform ${expandedId === f.id ? "rotate-90" : ""}`}>&#9654;</span>
                        {f.profiles ? `${f.profiles.first_name} ${f.profiles.last_name}` : "Unknown"}
                        {f.merged_into_id && (
                          <span className="text-[10px] text-[var(--color-text-tertiary)] italic" title="Merged duplicate">merged</span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${PRIORITY_COLORS[f.priority] ?? PRIORITY_COLORS.medium}`}>
                        {f.priority}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="inline-block rounded bg-[var(--color-bg-tertiary)] px-2 py-0.5 text-xs text-[var(--color-text-primary)]">
                        {CATEGORY_LABELS[f.category] ?? f.category}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-[var(--color-text-primary)] max-w-xs truncate">{f.body}</td>
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
                      {f.created_at ? format(parseISO(f.created_at), "d MMM HH:mm") : "-"}
                    </td>
                  </tr>

                  {expandedId === f.id && (
                    <tr className="bg-[var(--color-bg-secondary)]/80">
                      <td colSpan={7} className="px-4 py-4">
                        <div className="space-y-4">

                          {/* Merged banner */}
                          {f.merged_into_id && (
                            <div className="bg-[var(--color-bg-tertiary)] border border-[var(--color-border-primary)] rounded px-3 py-2 flex items-center justify-between gap-3">
                              <span className="text-xs text-[var(--color-text-secondary)]">
                                Merged into ticket <span className="font-mono">{f.merged_into_id.slice(0, 8)}…</span>
                                {f.merged_into?.body && <span className="ml-1">— &ldquo;{f.merged_into.body.slice(0, 60)}&rdquo;</span>}
                              </span>
                              <button
                                onClick={(e) => { e.stopPropagation(); mergeInto(f.id, null); }}
                                className="text-xs text-[var(--color-accent)] hover:underline"
                              >
                                Unlink
                              </button>
                            </div>
                          )}

                          {/* Full feedback body */}
                          <div>
                            <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-1">Full Feedback</p>
                            <p className="text-sm text-[var(--color-text-primary)] whitespace-pre-wrap leading-relaxed">{f.body}</p>
                          </div>

                          {/* Priority selector */}
                          <div onClick={(e) => e.stopPropagation()}>
                            <p className="text-[10px] text-[var(--color-text-tertiary)] uppercase tracking-wide mb-1">Priority</p>
                            <div className="flex gap-1">
                              {(["low", "medium", "high", "urgent"] as Priority[]).map((p) => (
                                <button
                                  key={p}
                                  onClick={() => setPriority(f.id, p)}
                                  disabled={updating === f.id}
                                  className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize transition-colors ${
                                    f.priority === p
                                      ? PRIORITY_COLORS[p]
                                      : "bg-[var(--color-bg-tertiary)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]"
                                  }`}
                                >
                                  {p}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Internal notes */}
                          <div onClick={(e) => e.stopPropagation()}>
                            <p className="text-[10px] text-[var(--color-text-tertiary)] uppercase tracking-wide mb-1">Internal notes (OPS only)</p>
                            <textarea
                              value={f.notes ?? ""}
                              onChange={(e) => saveNotesDebounced(f.id, e.target.value)}
                              placeholder="Private triage notes — visible only to OPS"
                              rows={2}
                              className="w-full rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-2 py-1.5 text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                            />
                          </div>

                          {/* Merge into duplicate */}
                          {!f.merged_into_id && (
                            <div onClick={(e) => e.stopPropagation()}>
                              <p className="text-[10px] text-[var(--color-text-tertiary)] uppercase tracking-wide mb-1">Mark as duplicate of…</p>
                              <div className="flex gap-1.5">
                                <input
                                  value={mergeSearch[f.id] ?? ""}
                                  onChange={(e) => setMergeSearch((m) => ({ ...m, [f.id]: e.target.value }))}
                                  placeholder="Search other tickets by text…"
                                  className="flex-1 rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-2 py-1 text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                                />
                              </div>
                              {(mergeSearch[f.id] ?? "").length >= 2 && (
                                <div className="mt-1 max-h-40 overflow-y-auto border border-[var(--color-border-primary)] rounded bg-[var(--color-bg-primary)]">
                                  {feedback
                                    .filter((o) =>
                                      o.id !== f.id &&
                                      !o.merged_into_id &&
                                      o.body.toLowerCase().includes((mergeSearch[f.id] ?? "").toLowerCase()),
                                    )
                                    .slice(0, 8)
                                    .map((o) => (
                                      <button
                                        key={o.id}
                                        onClick={() => mergeInto(f.id, o.id)}
                                        className="block w-full text-left px-2 py-1.5 text-xs hover:bg-[var(--color-surface-hover)] truncate"
                                      >
                                        <span className="font-mono text-[var(--color-text-tertiary)]">{o.id.slice(0, 6)}</span>
                                        {" — "}
                                        {o.body.slice(0, 80)}
                                      </button>
                                    ))}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Comment thread */}
                          <div onClick={(e) => e.stopPropagation()} className="pt-3 border-t border-[var(--color-border-primary)]">
                            <p className="text-[10px] text-[var(--color-text-tertiary)] uppercase tracking-wide mb-2">
                              Replies <span className="ml-1 normal-case">(visible to the reporter)</span>
                            </p>
                            <div className="space-y-2 mb-2">
                              {(comments[f.id] ?? []).length === 0 && (
                                <p className="text-xs text-[var(--color-text-tertiary)] italic">No replies yet.</p>
                              )}
                              {(comments[f.id] ?? []).map((c) => (
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
                            <div className="flex gap-1.5">
                              <textarea
                                value={commentDraft[f.id] ?? ""}
                                onChange={(e) => setCommentDraft((d) => ({ ...d, [f.id]: e.target.value }))}
                                placeholder="Reply to the reporter…"
                                rows={2}
                                className="flex-1 rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-2 py-1.5 text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                              />
                              <button
                                onClick={() => postComment(f.id)}
                                disabled={!(commentDraft[f.id] ?? "").trim()}
                                className="px-2.5 py-1 text-xs font-medium rounded bg-[var(--color-text-primary)] text-[var(--color-bg-primary)] disabled:opacity-50 hover:opacity-90"
                              >
                                Reply
                              </button>
                            </div>
                          </div>

                          {/* Metadata grid — 2 rows of details */}
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
                              <p className="text-[10px] text-[var(--color-text-tertiary)] uppercase tracking-wide">Department</p>
                              <p className="text-sm text-[var(--color-text-primary)] mt-0.5">
                                {f.department?.name ?? <span className="text-[var(--color-text-tertiary)]">—</span>}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] text-[var(--color-text-tertiary)] uppercase tracking-wide">Page</p>
                              <p className="text-sm font-mono text-[var(--color-text-secondary)] break-all mt-0.5">{f.page_url ?? "—"}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-[var(--color-text-tertiary)] uppercase tracking-wide">Submitted</p>
                              <p className="text-sm text-[var(--color-text-primary)] mt-0.5">
                                {f.created_at ? format(parseISO(f.created_at), "d MMM yyyy 'at' HH:mm") : "—"}
                              </p>
                            </div>
                          </div>

                          {/* Device / browser row */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-3 border-t border-[var(--color-border-primary)]">
                            {f.user_agent ? (() => {
                              const { browser, os } = parseDeviceInfo(f.user_agent);
                              return (
                                <>
                                  <div>
                                    <p className="text-[10px] text-[var(--color-text-tertiary)] uppercase tracking-wide">Browser</p>
                                    <p className="text-sm text-[var(--color-text-primary)] mt-0.5">{browser}</p>
                                  </div>
                                  <div>
                                    <p className="text-[10px] text-[var(--color-text-tertiary)] uppercase tracking-wide">Device / OS</p>
                                    <p className="text-sm text-[var(--color-text-primary)] mt-0.5">{os}</p>
                                  </div>
                                  <div className="sm:col-span-2">
                                    <p className="text-[10px] text-[var(--color-text-tertiary)] uppercase tracking-wide">User Agent</p>
                                    <p
                                      className="text-xs font-mono text-[var(--color-text-tertiary)] mt-0.5 truncate"
                                      title={f.user_agent}
                                    >
                                      {f.user_agent}
                                    </p>
                                  </div>
                                </>
                              );
                            })() : (
                              <div className="sm:col-span-4">
                                <p className="text-[10px] text-[var(--color-text-tertiary)] uppercase tracking-wide">Device</p>
                                <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5 italic">Not captured (submitted before this feature)</p>
                              </div>
                            )}
                          </div>

                          {/* Footer row: category, ID, status action */}
                          <div className="flex items-center gap-4 pt-3 border-t border-[var(--color-border-primary)]">
                            <div>
                              <span className="text-[10px] text-[var(--color-text-tertiary)] uppercase tracking-wide">Category: </span>
                              <span className="text-xs text-[var(--color-text-secondary)]">{CATEGORY_LABELS[f.category] ?? f.category}</span>
                            </div>
                            <div title={f.id}>
                              <span className="text-[10px] text-[var(--color-text-tertiary)] uppercase tracking-wide">ID: </span>
                              <span className="text-xs font-mono text-[var(--color-text-tertiary)]">{f.id.slice(0, 8)}…</span>
                            </div>
                            <div className="ml-auto">
                              <select
                                value={f.status}
                                onChange={(e) => { e.stopPropagation(); updateStatus(f.id, e.target.value); }}
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

                          {/* Link to Feature Goal */}
                          <div className="mt-4 pt-3 border-t border-[var(--color-border)]">
                            <div className="flex items-center gap-2 flex-wrap">
                              {/* Linked goal badges */}
                              {(linkedMap[f.id] ?? []).map(goalId => {
                                const g = goals.find(g => g.id === goalId);
                                return g ? (
                                  <span
                                    key={goalId}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-[var(--color-accent-light)] text-[var(--color-accent)]"
                                  >
                                    {g.title}
                                  </span>
                                ) : null;
                              })}
                              {linkingId === f.id ? (
                                <div className="flex items-center gap-2">
                                  <select
                                    value={linkGoalId}
                                    onChange={e => setLinkGoalId(e.target.value)}
                                    className="rounded border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-2 py-1 text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                                  >
                                    <option value="">Select a goal…</option>
                                    {goals.map(g => (
                                      <option key={g.id} value={g.id}>{g.title}</option>
                                    ))}
                                  </select>
                                  <button
                                    onClick={() => handleLink(f.id)}
                                    disabled={linking || !linkGoalId}
                                    className="px-2 py-1 text-xs font-medium rounded bg-[var(--color-accent)] text-white disabled:opacity-50 hover:opacity-90 transition-opacity"
                                  >
                                    {linking ? "Linking…" : "Link"}
                                  </button>
                                  <button
                                    onClick={() => { setLinkingId(null); setLinkGoalId(""); }}
                                    className="px-2 py-1 text-xs rounded border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => { setLinkingId(f.id); setLinkGoalId(""); }}
                                  className="px-2 py-1 text-xs rounded border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
                                >
                                  + Link to Feature Goal
                                </button>
                              )}
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
