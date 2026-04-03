"use client";

import { useState, useCallback } from "react";
import { formatDistanceToNow } from "date-fns";

type Dept = { id: string; name: string; slug: string };
type Announcement = {
  id: string;
  title: string;
  content: string;
  priority: "normal" | "important" | "urgent";
  expires_at: string | null;
  created_at: string;
  department: Dept | null;
  created_by_profile: { id: string; first_name: string; last_name: string } | null;
};

type Props = {
  announcements: Announcement[];
  departments: Dept[];
  currentUserId: string;
  canPost: boolean;
  isOps: boolean;
  userDeptId: string | null;
};

const PRIORITY_STYLES = {
  normal:    { badge: "", label: "" },
  important: { badge: "bg-amber-100 text-amber-700 border border-amber-200", label: "Important" },
  urgent:    { badge: "bg-red-100 text-red-700 border border-red-200", label: "Urgent" },
};

const PRIORITY_BORDER = {
  normal: "border-l-gray-200",
  important: "border-l-amber-400",
  urgent: "border-l-red-500",
};

export function AnnouncementsView({
  announcements: initial,
  departments,
  currentUserId,
  canPost,
  isOps,
  userDeptId,
}: Props) {
  const [announcements, setAnnouncements] = useState<Announcement[]>(initial);
  const [showForm, setShowForm] = useState(false);
  const [posting, setPosting] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [form, setForm] = useState({
    title: "",
    content: "",
    priority: "normal",
    department_id: userDeptId ?? "",
    expires_at: "",
  });

  const toggle = (id: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const handlePost = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setPosting(true);
    const res = await fetch("/api/announcements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title,
        content: form.content,
        priority: form.priority,
        department_id: form.department_id || null,
        expires_at: form.expires_at || null,
      }),
    });
    if (res.ok) {
      const refreshed = await fetch("/api/announcements");
      setAnnouncements(await refreshed.json());
      setShowForm(false);
      setForm({ title: "", content: "", priority: "normal", department_id: userDeptId ?? "", expires_at: "" });
    }
    setPosting(false);
  }, [form, userDeptId]);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm("Delete this announcement?")) return;
    const res = await fetch(`/api/announcements?id=${id}`, { method: "DELETE" });
    if (res.ok) setAnnouncements((a) => a.filter((x) => x.id !== id));
  }, []);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Announcements</h1>
          <p className="text-sm text-gray-500 mt-1">Company and department notices</p>
        </div>
        {canPost && (
          <button
            onClick={() => setShowForm(true)}
            className="bg-gray-900 text-white text-sm px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
          >
            + Post
          </button>
        )}
      </div>

      {announcements.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">No announcements.</p>
      ) : (
        <div className="space-y-3">
          {announcements.map((a) => {
            const isExpanded = expanded.has(a.id);
            const canDelete = isOps || a.created_by_profile?.id === currentUserId;
            const pStyle = PRIORITY_STYLES[a.priority];

            return (
              <div
                key={a.id}
                className={`bg-white border border-l-4 border-gray-200 ${PRIORITY_BORDER[a.priority]} rounded-xl overflow-hidden`}
              >
                <div
                  className="p-4 cursor-pointer"
                  onClick={() => toggle(a.id)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="text-sm font-semibold text-gray-900">{a.title}</h3>
                        {a.priority !== "normal" && (
                          <span className={`text-xs px-1.5 py-0.5 rounded-full ${pStyle.badge}`}>
                            {pStyle.label}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-400 flex-wrap">
                        {a.department ? (
                          <span>{a.department.name}</span>
                        ) : (
                          <span className="text-blue-500">Global</span>
                        )}
                        <span>·</span>
                        <span>
                          {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                        </span>
                        {a.created_by_profile && (
                          <>
                            <span>·</span>
                            <span>{a.created_by_profile.first_name} {a.created_by_profile.last_name}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {canDelete && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(a.id); }}
                          className="text-xs text-gray-300 hover:text-red-400"
                        >
                          Delete
                        </button>
                      )}
                      <span className="text-gray-400 text-xs">{isExpanded ? "▲" : "▼"}</span>
                    </div>
                  </div>
                  {!isExpanded && (
                    <p className="text-xs text-gray-500 mt-2 line-clamp-2">{a.content}</p>
                  )}
                </div>
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-gray-100">
                    <p className="text-sm text-gray-700 whitespace-pre-wrap pt-3">{a.content}</p>
                    {a.expires_at && (
                      <p className="text-xs text-gray-400 mt-3">
                        Expires {formatDistanceToNow(new Date(a.expires_at), { addSuffix: true })}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Post Announcement</h2>
            <form onSubmit={handlePost} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Title *</label>
                <input
                  required
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Content *</label>
                <textarea
                  required
                  rows={5}
                  value={form.content}
                  onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Priority</label>
                  <select
                    value={form.priority}
                    onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  >
                    <option value="normal">Normal</option>
                    <option value="important">Important</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Department</label>
                  <select
                    value={form.department_id}
                    onChange={(e) => setForm((f) => ({ ...f, department_id: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  >
                    {isOps && <option value="">Global (all staff)</option>}
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Expires (optional)</label>
                <input
                  type="date"
                  value={form.expires_at}
                  onChange={(e) => setForm((f) => ({ ...f, expires_at: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 border border-gray-200 text-gray-700 text-sm py-2 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={posting}
                  className="flex-1 bg-gray-900 text-white text-sm py-2 rounded-lg hover:bg-gray-700 disabled:opacity-50"
                >
                  {posting ? "Posting..." : "Post"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
