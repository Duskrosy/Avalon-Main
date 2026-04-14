"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { formatDistanceToNow } from "date-fns";

type Dept = { id: string; name: string; slug: string };
type ReactionMap = Record<string, { user_id: string; name: string }[]>;
type Announcement = {
  id: string;
  title: string;
  content: string;
  priority: "normal" | "important" | "urgent";
  expires_at: string | null;
  created_at: string;
  department: Dept | null;
  created_by_profile: { id: string; first_name: string; last_name: string; avatar_url?: string | null } | null;
};

type Props = {
  announcements: Announcement[];
  departments: Dept[];
  currentUserId: string;
  canPost: boolean;
  isOps: boolean;
  userDeptId: string | null;
  initialReactions: Record<string, ReactionMap>;
};

const REACTION_EMOJIS = ["👍", "❤️", "🎉", "😂", "🔥", "👀", "💯", "🙏"];

const PRIORITY_ACCENT = {
  normal: "border-gray-200",
  important: "border-amber-400",
  urgent: "border-red-500",
};

const PRIORITY_TAG = {
  normal: null,
  important: { bg: "bg-amber-50 text-amber-700 ring-1 ring-amber-200", label: "Important" },
  urgent: { bg: "bg-red-50 text-red-700 ring-1 ring-red-200", label: "Urgent" },
};

function getInitials(first: string, last: string) {
  return `${first[0]}${last[0]}`.toUpperCase();
}

export function AnnouncementsView({
  announcements: initial,
  departments,
  currentUserId,
  canPost,
  isOps,
  userDeptId,
  initialReactions,
}: Props) {
  const [announcements, setAnnouncements] = useState<Announcement[]>(initial);
  const [reactions, setReactions] = useState<Record<string, ReactionMap>>(initialReactions);
  const [showForm, setShowForm] = useState(false);
  const [posting, setPosting] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pickerOpen, setPickerOpen] = useState<string | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const [form, setForm] = useState({
    title: "",
    content: "",
    priority: "normal",
    department_id: userDeptId ?? "",
    expires_at: "",
  });

  // Close emoji picker on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(null);
      }
    }
    if (pickerOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [pickerOpen]);

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
    if (res.ok) {
      setAnnouncements((a) => a.filter((x) => x.id !== id));
      setReactions((r) => {
        const next = { ...r };
        delete next[id];
        return next;
      });
    }
  }, []);

  const handleReaction = useCallback(async (announcementId: string, emoji: string) => {
    setPickerOpen(null);
    const res = await fetch(`/api/announcements/${announcementId}/reactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emoji }),
    });
    if (res.ok) {
      const updated: ReactionMap = await res.json();
      setReactions((r) => ({ ...r, [announcementId]: updated }));
    }
  }, []);

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Announcements</h1>
          <p className="text-sm text-gray-500 mt-1">Company and department notices</p>
        </div>
        {canPost && (
          <button
            onClick={() => setShowForm(true)}
            className="bg-gray-900 text-white text-sm px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors flex items-center gap-1.5"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M7 1v12M1 7h12"/></svg>
            New Announcement
          </button>
        )}
      </div>

      {/* Announcements List */}
      {announcements.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">📢</div>
          <p className="text-sm text-gray-400">No announcements yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {announcements.map((a) => {
            const isExpanded = expanded.has(a.id);
            const canDelete = isOps || a.created_by_profile?.id === currentUserId;
            const tag = PRIORITY_TAG[a.priority];
            const annReactions = reactions[a.id] || {};
            const reactionEntries = Object.entries(annReactions);

            return (
              <div
                key={a.id}
                className={`bg-white rounded-xl border-l-4 ${PRIORITY_ACCENT[a.priority]} border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow`}
              >
                {/* Thread Header */}
                <div className="p-4 cursor-pointer" onClick={() => toggle(a.id)}>
                  <div className="flex items-start gap-3">
                    {/* Author Avatar */}
                    <div className="w-9 h-9 rounded-full bg-gray-900 text-white flex items-center justify-center text-xs font-medium shrink-0 mt-0.5">
                      {a.created_by_profile
                        ? getInitials(a.created_by_profile.first_name, a.created_by_profile.last_name)
                        : "?"}
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Author + Meta */}
                      <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                        <span className="font-medium text-gray-700">
                          {a.created_by_profile
                            ? `${a.created_by_profile.first_name} ${a.created_by_profile.last_name}`
                            : "System"}
                        </span>
                        <span>·</span>
                        <span>{formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}</span>
                        {a.department ? (
                          <>
                            <span>·</span>
                            <span className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded text-[10px] font-medium">
                              {a.department.name}
                            </span>
                          </>
                        ) : (
                          <>
                            <span>·</span>
                            <span className="bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded text-[10px] font-medium">
                              Global
                            </span>
                          </>
                        )}
                        {tag && (
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${tag.bg}`}>
                            {tag.label}
                          </span>
                        )}
                      </div>

                      {/* Title */}
                      <h3 className="text-sm font-semibold text-gray-900 leading-snug">{a.title}</h3>

                      {/* Preview (collapsed) */}
                      {!isExpanded && (
                        <p className="text-xs text-gray-500 mt-1.5 line-clamp-2 leading-relaxed">{a.content}</p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      {canDelete && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(a.id); }}
                          className="text-xs text-gray-300 hover:text-red-400 transition-colors p-1"
                          title="Delete"
                        >
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                            <path d="M2 3.5h10M5 3.5V2.5a1 1 0 011-1h2a1 1 0 011 1v1M5.5 6v4M8.5 6v4M3 3.5l.5 8a1 1 0 001 1h5a1 1 0 001-1l.5-8"/>
                          </svg>
                        </button>
                      )}
                      <span className="text-gray-300 text-xs">{isExpanded ? "▲" : "▼"}</span>
                    </div>
                  </div>

                  {/* Reactions Row (always visible) */}
                  {reactionEntries.length > 0 && (
                    <div className="flex items-center gap-1.5 mt-3 ml-12 flex-wrap" onClick={(e) => e.stopPropagation()}>
                      {reactionEntries.map(([emoji, users]) => {
                        const isMine = users.some((u) => u.user_id === currentUserId);
                        return (
                          <button
                            key={emoji}
                            onClick={() => handleReaction(a.id, emoji)}
                            title={users.map((u) => u.name).join(", ")}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors ${
                              isMine
                                ? "bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100"
                                : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                            }`}
                          >
                            <span>{emoji}</span>
                            <span className="font-medium">{users.length}</span>
                          </button>
                        );
                      })}
                      {/* Add reaction button */}
                      <div className="relative" ref={pickerOpen === a.id ? pickerRef : undefined}>
                        <button
                          onClick={() => setPickerOpen(pickerOpen === a.id ? null : a.id)}
                          className="inline-flex items-center justify-center w-7 h-7 rounded-full border border-dashed border-gray-300 text-gray-400 hover:border-gray-400 hover:text-gray-500 transition-colors text-xs"
                          title="Add reaction"
                        >
                          +
                        </button>
                        {pickerOpen === a.id && (
                          <div className="absolute bottom-full mb-1 left-0 bg-white border border-gray-200 rounded-lg shadow-lg p-1.5 flex gap-1 z-20">
                            {REACTION_EMOJIS.map((emoji) => (
                              <button
                                key={emoji}
                                onClick={() => handleReaction(a.id, emoji)}
                                className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 text-base transition-colors"
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-gray-100">
                    <div className="ml-12 pt-3">
                      <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{a.content}</p>
                      {a.expires_at && (
                        <p className="text-xs text-gray-400 mt-3 flex items-center gap-1">
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="6" cy="6" r="5"/><path d="M6 3v3l2 1"/></svg>
                          Expires {formatDistanceToNow(new Date(a.expires_at), { addSuffix: true })}
                        </p>
                      )}

                      {/* Reaction bar in expanded view (when no reactions yet) */}
                      {reactionEntries.length === 0 && (
                        <div className="mt-3 relative" ref={pickerOpen === a.id ? pickerRef : undefined}>
                          <button
                            onClick={() => setPickerOpen(pickerOpen === a.id ? null : a.id)}
                            className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors px-2 py-1 rounded-lg hover:bg-gray-50"
                          >
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="7" cy="7" r="6"/><path d="M4.5 8.5s1 1.5 2.5 1.5 2.5-1.5 2.5-1.5M5 5.5h.01M9 5.5h.01"/></svg>
                            React
                          </button>
                          {pickerOpen === a.id && (
                            <div className="absolute bottom-full mb-1 left-0 bg-white border border-gray-200 rounded-lg shadow-lg p-1.5 flex gap-1 z-20">
                              {REACTION_EMOJIS.map((emoji) => (
                                <button
                                  key={emoji}
                                  onClick={() => handleReaction(a.id, emoji)}
                                  className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 text-base transition-colors"
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Post Announcement Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">New Announcement</h2>
            <form onSubmit={handlePost} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Title *</label>
                <input
                  required
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="What's the announcement about?"
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
                  placeholder="Write the full announcement details..."
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
                  {posting ? "Posting..." : "Post Announcement"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
