"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { formatDistanceToNow } from "date-fns";

type Dept = { id: string; name: string; slug: string };
type ReactionMap = Record<string, { user_id: string; name: string }[]>;
type Announcement = {
  id: string;
  title: string;
  content: string;
  flair_text: string | null;
  flair_color: string | null;
  attachment_url: string | null;
  attachment_name: string | null;
  attachment_signed_url?: string | null;
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
  initialReactions: Record<string, ReactionMap>;
};

const REACTION_EMOJIS = ["👍", "❤️", "🎉", "😂", "🔥", "👀", "💯", "🙏"];

const FLAIR_COLORS = [
  { name: "Gray",    value: "#6b7280", bg: "bg-[var(--color-bg-tertiary)]",    text: "text-[var(--color-text-primary)]",    ring: "ring-[var(--color-border-primary)]" },
  { name: "Red",     value: "#ef4444", bg: "bg-[var(--color-error-light)]",      text: "text-[var(--color-error)]",     ring: "ring-red-200" },
  { name: "Orange",  value: "#f97316", bg: "bg-orange-50",   text: "text-orange-700",  ring: "ring-orange-200" },
  { name: "Amber",   value: "#f59e0b", bg: "bg-[var(--color-warning-light)]",    text: "text-[var(--color-warning-text)]",   ring: "ring-amber-200" },
  { name: "Green",   value: "#22c55e", bg: "bg-[var(--color-success-light)]",    text: "text-[var(--color-success)]",   ring: "ring-green-200" },
  { name: "Blue",    value: "#3b82f6", bg: "bg-[var(--color-accent-light)]",     text: "text-[var(--color-accent)]",    ring: "ring-blue-200" },
  { name: "Purple",  value: "#a855f7", bg: "bg-purple-50",   text: "text-purple-700",  ring: "ring-purple-200" },
  { name: "Pink",    value: "#ec4899", bg: "bg-pink-50",     text: "text-pink-700",    ring: "ring-pink-200" },
];

function getInitials(first: string, last: string) {
  return `${first[0]}${last[0]}`.toUpperCase();
}

function isImageFile(name: string | null) {
  if (!name) return false;
  return /\.(jpg|jpeg|png|webp|gif)$/i.test(name);
}

function getFlairStyle(color: string | null) {
  if (!color) return null;
  const preset = FLAIR_COLORS.find((c) => c.value === color);
  if (preset) return preset;
  // Custom color fallback
  return { name: "", value: color, bg: "", text: "", ring: "" };
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
  const [reactionPopover, setReactionPopover] = useState<{ announcementId: string; emoji: string } | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [form, setForm] = useState({
    title: "",
    content: "",
    department_id: userDeptId ?? "",
    expires_at: "",
    flair_text: "",
    flair_color: "",
  });
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Clean up file preview URL
  useEffect(() => {
    return () => { if (filePreview) URL.revokeObjectURL(filePreview); };
  }, [filePreview]);

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    if (filePreview) URL.revokeObjectURL(filePreview);
    if (f && f.type.startsWith("image/")) {
      setFilePreview(URL.createObjectURL(f));
    } else {
      setFilePreview(null);
    }
  };

  const clearFile = () => {
    setFile(null);
    if (filePreview) URL.revokeObjectURL(filePreview);
    setFilePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handlePost = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setPosting(true);

    const fd = new FormData();
    fd.append("title", form.title);
    fd.append("content", form.content);
    if (form.department_id) fd.append("department_id", form.department_id);
    if (form.expires_at) fd.append("expires_at", form.expires_at);
    if (form.flair_text.trim()) fd.append("flair_text", form.flair_text.trim());
    if (form.flair_color) fd.append("flair_color", form.flair_color);
    if (file) fd.append("file", file);

    const res = await fetch("/api/announcements", { method: "POST", body: fd });
    if (res.ok) {
      const refreshed = await fetch("/api/announcements");
      setAnnouncements(await refreshed.json());
      setShowForm(false);
      setForm({ title: "", content: "", department_id: userDeptId ?? "", expires_at: "", flair_text: "", flair_color: "" });
      clearFile();
    }
    setPosting(false);
  }, [form, file, userDeptId]);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm("Delete this announcement?")) return;
    const res = await fetch(`/api/announcements?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      setAnnouncements((a) => a.filter((x) => x.id !== id));
      setReactions((r) => { const next = { ...r }; delete next[id]; return next; });
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
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">Announcements</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">Company and department notices</p>
        </div>
        {canPost && (
          <button
            onClick={() => setShowForm(true)}
            className="bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] text-sm px-4 py-2 rounded-lg hover:bg-[var(--color-text-secondary)] transition-colors flex items-center gap-1.5"
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
          <p className="text-sm text-[var(--color-text-tertiary)]">No announcements yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {announcements.map((a) => {
            const isExpanded = expanded.has(a.id);
            const canDelete = isOps || a.created_by_profile?.id === currentUserId;
            const flair = a.flair_text ? getFlairStyle(a.flair_color) : null;
            const annReactions = reactions[a.id] || {};
            const reactionEntries = Object.entries(annReactions);
            const hasImage = isImageFile(a.attachment_name);

            return (
              <div
                key={a.id}
                className="bg-[var(--color-bg-primary)] rounded-[var(--radius-lg)] border border-[var(--color-border-primary)] overflow-hidden shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] transition-shadow"
              >
                {/* Thread Header */}
                <div className="p-4 cursor-pointer" onClick={() => toggle(a.id)}>
                  <div className="flex items-start gap-3">
                    {/* Author Avatar */}
                    <div className="w-9 h-9 rounded-full bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] flex items-center justify-center text-xs font-medium shrink-0 mt-0.5">
                      {a.created_by_profile
                        ? getInitials(a.created_by_profile.first_name, a.created_by_profile.last_name)
                        : "?"}
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Author + Meta */}
                      <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)] mb-1 flex-wrap">
                        <span className="font-medium text-[var(--color-text-primary)]">
                          {a.created_by_profile
                            ? `${a.created_by_profile.first_name} ${a.created_by_profile.last_name}`
                            : "System"}
                        </span>
                        <span>·</span>
                        <span>{formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}</span>
                        {a.department ? (
                          <>
                            <span>·</span>
                            <span className="bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] px-1.5 py-0.5 rounded text-[10px] font-medium">
                              {a.department.name}
                            </span>
                          </>
                        ) : (
                          <>
                            <span>·</span>
                            <span className="bg-[var(--color-accent-light)] text-[var(--color-accent)] px-1.5 py-0.5 rounded text-[10px] font-medium">
                              Global
                            </span>
                          </>
                        )}
                        {/* Flair Tag */}
                        {a.flair_text && flair && (
                          flair.bg ? (
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ring-1 ${flair.bg} ${flair.text} ${flair.ring}`}>
                              {a.flair_text}
                            </span>
                          ) : (
                            <span
                              className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                              style={{ backgroundColor: flair.value + "18", color: flair.value, boxShadow: `inset 0 0 0 1px ${flair.value}30` }}
                            >
                              {a.flair_text}
                            </span>
                          )
                        )}
                        {/* Attachment indicator */}
                        {a.attachment_name && (
                          <span className="text-[var(--color-text-tertiary)] flex items-center gap-0.5">
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                              <path d="M10 6.5l-4.3 4.3a2.5 2.5 0 01-3.4-3.4L7.6 2a1.7 1.7 0 012.4 2.4L4.7 9.7a.8.8 0 01-1.2-1.2L8.2 3.8"/>
                            </svg>
                          </span>
                        )}
                      </div>

                      {/* Title */}
                      <h3 className="text-sm font-semibold text-[var(--color-text-primary)] leading-snug">{a.title}</h3>

                      {/* Preview (collapsed) */}
                      {!isExpanded && (
                        <p className="text-xs text-[var(--color-text-secondary)] mt-1.5 line-clamp-2 leading-relaxed">{a.content}</p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      {canDelete && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(a.id); }}
                          className="text-xs text-[var(--color-text-tertiary)] hover:text-red-400 transition-colors p-1"
                          title="Delete"
                        >
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                            <path d="M2 3.5h10M5 3.5V2.5a1 1 0 011-1h2a1 1 0 011 1v1M5.5 6v4M8.5 6v4M3 3.5l.5 8a1 1 0 001 1h5a1 1 0 001-1l.5-8"/>
                          </svg>
                        </button>
                      )}
                      <span className="text-[var(--color-text-tertiary)] text-xs">{isExpanded ? "▲" : "▼"}</span>
                    </div>
                  </div>

                  {/* Reactions Row (always visible) */}
                  {reactionEntries.length > 0 && (
                    <div className="flex items-center gap-1.5 mt-3 ml-12 flex-wrap" onClick={(e) => e.stopPropagation()}>
                      {reactionEntries.map(([emoji, users]) => {
                        const isMine = users.some((u) => u.user_id === currentUserId);
                        const isPopoverOpen = reactionPopover?.announcementId === a.id && reactionPopover?.emoji === emoji;
                        return (
                          <div key={emoji} className="relative">
                            <button
                              onClick={() => handleReaction(a.id, emoji)}
                              onMouseDown={() => {
                                longPressTimer.current = setTimeout(() => {
                                  setReactionPopover({ announcementId: a.id, emoji });
                                }, 400);
                              }}
                              onMouseUp={() => {
                                if (longPressTimer.current) clearTimeout(longPressTimer.current);
                              }}
                              onMouseLeave={() => {
                                if (longPressTimer.current) clearTimeout(longPressTimer.current);
                                if (isPopoverOpen) setReactionPopover(null);
                              }}
                              onTouchStart={() => {
                                longPressTimer.current = setTimeout(() => {
                                  setReactionPopover({ announcementId: a.id, emoji });
                                }, 400);
                              }}
                              onTouchEnd={() => {
                                if (longPressTimer.current) clearTimeout(longPressTimer.current);
                              }}
                              title={users.map((u) => u.name).join(", ")}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors ${
                                isMine
                                  ? "bg-[var(--color-accent-light)] border-[var(--color-accent)] text-[var(--color-accent)] hover:bg-[var(--color-accent-light)]"
                                  : "bg-[var(--color-bg-secondary)] border-[var(--color-border-primary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-active)]"
                              }`}
                            >
                              <span>{emoji}</span>
                              <span className="font-medium">{users.length}</span>
                            </button>
                            {isPopoverOpen && (
                              <div className="absolute bottom-full left-0 mb-1 p-2 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-md)] shadow-[var(--shadow-md)] z-50 min-w-[140px] max-h-[200px] overflow-y-auto">
                                <p className="text-xs font-medium text-[var(--color-text-primary)] mb-1">{emoji}</p>
                                {users.map((u, i) => (
                                  <div key={i} className="text-xs text-[var(--color-text-secondary)] py-0.5">{u.name}</div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      <div className="relative" ref={pickerOpen === a.id ? pickerRef : undefined}>
                        <button
                          onClick={() => setPickerOpen(pickerOpen === a.id ? null : a.id)}
                          className="inline-flex items-center justify-center w-7 h-7 rounded-full border border-dashed border-[var(--color-border-primary)] text-[var(--color-text-tertiary)] hover:border-[var(--color-border-primary)] hover:text-[var(--color-text-secondary)] transition-colors text-xs"
                          title="Add reaction"
                        >
                          +
                        </button>
                        {pickerOpen === a.id && (
                          <div className="absolute bottom-full mb-1 left-0 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-lg shadow-[var(--shadow-lg)] p-1.5 flex gap-1 z-20">
                            {REACTION_EMOJIS.map((emoji) => (
                              <button
                                key={emoji}
                                onClick={() => handleReaction(a.id, emoji)}
                                className="w-8 h-8 flex items-center justify-center rounded hover:bg-[var(--color-surface-active)] text-base transition-colors"
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
                  <div className="px-4 pb-4 border-t border-[var(--color-border-secondary)]">
                    <div className="ml-12 pt-3">
                      <p className="text-sm text-[var(--color-text-primary)] whitespace-pre-wrap leading-relaxed">{a.content}</p>

                      {/* Attachment Preview */}
                      {a.attachment_signed_url && (
                        <div className="mt-3">
                          {hasImage ? (
                            <a href={a.attachment_signed_url} target="_blank" rel="noopener noreferrer" className="block">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={a.attachment_signed_url}
                                alt={a.attachment_name ?? "Attachment"}
                                className="max-w-sm max-h-64 rounded-lg border border-[var(--color-border-primary)] object-cover hover:opacity-90 transition-opacity"
                              />
                            </a>
                          ) : (
                            <a
                              href={a.attachment_signed_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 px-3 py-2 bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)] rounded-lg text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-surface-active)] transition-colors"
                            >
                              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                                <path d="M4 14h8a1 1 0 001-1V5l-4-4H4a1 1 0 00-1 1v11a1 1 0 001 1z"/>
                                <path d="M9 1v4h4"/>
                              </svg>
                              <span className="truncate max-w-xs">{a.attachment_name}</span>
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                                <path d="M6 1v8M3 6l3 3 3-3"/>
                              </svg>
                            </a>
                          )}
                        </div>
                      )}

                      {a.expires_at && (
                        <p className="text-xs text-[var(--color-text-tertiary)] mt-3 flex items-center gap-1">
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="6" cy="6" r="5"/><path d="M6 3v3l2 1"/></svg>
                          Expires {formatDistanceToNow(new Date(a.expires_at), { addSuffix: true })}
                        </p>
                      )}

                      {/* Reaction bar (when no reactions yet) */}
                      {reactionEntries.length === 0 && (
                        <div className="mt-3 relative" ref={pickerOpen === a.id ? pickerRef : undefined}>
                          <button
                            onClick={() => setPickerOpen(pickerOpen === a.id ? null : a.id)}
                            className="inline-flex items-center gap-1.5 text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors px-2 py-1 rounded-lg hover:bg-[var(--color-surface-hover)]"
                          >
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="7" cy="7" r="6"/><path d="M4.5 8.5s1 1.5 2.5 1.5 2.5-1.5 2.5-1.5M5 5.5h.01M9 5.5h.01"/></svg>
                            React
                          </button>
                          {pickerOpen === a.id && (
                            <div className="absolute bottom-full mb-1 left-0 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-lg shadow-[var(--shadow-lg)] p-1.5 flex gap-1 z-20">
                              {REACTION_EMOJIS.map((emoji) => (
                                <button
                                  key={emoji}
                                  onClick={() => handleReaction(a.id, emoji)}
                                  className="w-8 h-8 flex items-center justify-center rounded hover:bg-[var(--color-surface-active)] text-base transition-colors"
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
          <div className="bg-[var(--color-bg-primary)] rounded-2xl p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4">New Announcement</h2>
            <form onSubmit={handlePost} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">Title *</label>
                <input
                  required
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="What's the announcement about?"
                  className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">Content *</label>
                <textarea
                  required
                  rows={4}
                  value={form.content}
                  onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                  placeholder="Write the full announcement details..."
                  className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                />
              </div>

              {/* Flair */}
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">Flair (optional)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={form.flair_text}
                    onChange={(e) => setForm((f) => ({ ...f, flair_text: e.target.value }))}
                    placeholder="e.g. Policy Update, Urgent, FYI"
                    maxLength={30}
                    className="flex-1 border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  />
                </div>
                {/* Color selector */}
                <div className="flex items-center gap-1.5 mt-2">
                  <span className="text-[10px] text-[var(--color-text-tertiary)] mr-1">Color:</span>
                  {FLAIR_COLORS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, flair_color: f.flair_color === c.value ? "" : c.value }))}
                      className={`w-6 h-6 rounded-full border-2 transition-all ${
                        form.flair_color === c.value ? "border-[var(--color-text-primary)] scale-110" : "border-transparent hover:scale-105"
                      }`}
                      style={{ backgroundColor: c.value }}
                      title={c.name}
                    />
                  ))}
                </div>
                {/* Flair preview */}
                {form.flair_text.trim() && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-[10px] text-[var(--color-text-tertiary)]">Preview:</span>
                    {form.flair_color ? (
                      (() => {
                        const preset = FLAIR_COLORS.find((c) => c.value === form.flair_color);
                        return preset ? (
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ring-1 ${preset.bg} ${preset.text} ${preset.ring}`}>
                            {form.flair_text.trim()}
                          </span>
                        ) : (
                          <span
                            className="px-2 py-0.5 rounded text-xs font-medium"
                            style={{ backgroundColor: form.flair_color + "18", color: form.flair_color }}
                          >
                            {form.flair_text.trim()}
                          </span>
                        );
                      })()
                    ) : (
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] ring-1 ring-[var(--color-border-primary)]">
                        {form.flair_text.trim()}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Department + Expires */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">Department</label>
                  <select
                    value={form.department_id}
                    onChange={(e) => setForm((f) => ({ ...f, department_id: e.target.value }))}
                    className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  >
                    {isOps && <option value="">Global (all staff)</option>}
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">Expires (optional)</label>
                  <input
                    type="date"
                    value={form.expires_at}
                    onChange={(e) => setForm((f) => ({ ...f, expires_at: e.target.value }))}
                    className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  />
                </div>
              </div>

              {/* Attachment */}
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-primary)] mb-1">Attachment (optional)</label>
                {!file ? (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full border-2 border-dashed border-[var(--color-border-primary)] rounded-lg py-4 text-center hover:border-[var(--color-border-primary)] hover:bg-[var(--color-surface-hover)] transition-colors"
                  >
                    <svg className="mx-auto mb-1" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round">
                      <path d="M10 4v8M6 8l4-4 4 4"/>
                      <path d="M3 14v2a1 1 0 001 1h12a1 1 0 001-1v-2"/>
                    </svg>
                    <p className="text-xs text-[var(--color-text-secondary)]">Click to upload</p>
                    <p className="text-[10px] text-[var(--color-text-tertiary)] mt-0.5">Images, PDF, Office docs up to 50MB</p>
                  </button>
                ) : (
                  <div className="border border-[var(--color-border-primary)] rounded-lg p-3">
                    {filePreview && (
                      <div className="mb-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={filePreview} alt="Preview" className="max-h-32 rounded-lg object-cover" />
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round">
                          <path d="M3.5 12h7a1 1 0 001-1V4.5l-3.5-3.5h-4.5a1 1 0 00-1 1v9a1 1 0 001 1z"/>
                          <path d="M8 1v3.5h3.5"/>
                        </svg>
                        <span className="text-xs text-[var(--color-text-primary)] truncate">{file.name}</span>
                        <span className="text-[10px] text-[var(--color-text-tertiary)] shrink-0">
                          {(file.size / 1024 / 1024).toFixed(1)}MB
                        </span>
                      </div>
                      <button type="button" onClick={clearFile} className="text-xs text-[var(--color-text-tertiary)] hover:text-red-400 ml-2 shrink-0">
                        Remove
                      </button>
                    </div>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileChange}
                  accept=".jpg,.jpeg,.png,.webp,.gif,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
                  className="hidden"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowForm(false); clearFile(); }}
                  className="flex-1 border border-[var(--color-border-primary)] text-[var(--color-text-primary)] text-sm py-2 rounded-lg hover:bg-[var(--color-surface-hover)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={posting}
                  className="flex-1 bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] text-sm py-2 rounded-lg hover:bg-[var(--color-text-secondary)] disabled:opacity-50"
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
