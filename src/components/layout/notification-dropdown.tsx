"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link_url: string | null;
  is_read: boolean;
  created_at: string;
};

const TYPE_ICONS: Record<string, string> = {
  announcement: "📢",
  kanban: "📋",
  kop: "📖",
  memo: "📝",
  leave_pre_approved: "✅",
  leave_approved: "✅",
  leave_rejected: "❌",
  leave_docs_requested: "📎",
  leave_docs_uploaded: "📎",
  kanban_due_soon: "⏰",
  kanban_overdue: "🔴",
  kanban_manager_overdue: "🔴",
};

export function NotificationDropdown({ unreadCount: initialCount }: { unreadCount: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"new" | "unread">("new");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(initialCount);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Fetch notifications when dropdown opens
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch("/api/notifications?unread=true")
      .then((r) => r.json())
      .then((data) => {
        const items = data.notifications ?? data ?? [];
        setNotifications(Array.isArray(items) ? items : []);
      })
      .finally(() => setLoading(false));
  }, [open]);

  const markRead = useCallback(async (id: string) => {
    setNotifications((ns) => ns.map((n) => n.id === id ? { ...n, is_read: true } : n));
    setUnreadCount((c) => Math.max(0, c - 1));
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
  }, []);

  const handleClick = useCallback((n: Notification) => {
    if (!n.is_read) markRead(n.id);
    setOpen(false);
    if (n.link_url) router.push(n.link_url);
  }, [markRead, router]);

  const markAllRead = useCallback(async () => {
    setNotifications((ns) => ns.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mark_all: true }),
    });
  }, []);

  // Filter notifications based on tab
  // "new" = recent unread (last 24h), "unread" = all unread
  const now = Date.now();
  const filtered = tab === "new"
    ? notifications.filter((n) => !n.is_read && now - new Date(n.created_at).getTime() < 24 * 60 * 60 * 1000)
    : notifications.filter((n) => !n.is_read);

  const displayList = filtered.slice(0, 8);

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-active)] rounded-[var(--radius-md)] transition-colors"
        aria-label="Notifications"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M15 6.667a5 5 0 0 0-10 0c0 5.833-2.5 7.5-2.5 7.5h15S15 12.5 15 6.667" />
          <path d="M11.442 16.667a1.667 1.667 0 0 1-2.884 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-[var(--color-error)] text-white text-[10px] font-medium rounded-full w-4 h-4 flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-96 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] shadow-xl z-50 overflow-hidden">
          {/* Header */}
          <div className="px-4 pt-3 pb-2 border-b border-[var(--color-border-secondary)]">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Notifications</h3>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-xs text-[var(--color-accent)] hover:text-[var(--color-accent-hover)]"
                >
                  Mark all read
                </button>
              )}
            </div>
            {/* Tabs */}
            <div className="flex gap-1">
              <button
                onClick={() => setTab("new")}
                className={`text-xs px-3 py-1.5 rounded-[var(--radius-md)] font-medium transition-colors ${
                  tab === "new"
                    ? "bg-[var(--color-text-primary)] text-white"
                    : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-active)]"
                }`}
              >
                New
              </button>
              <button
                onClick={() => setTab("unread")}
                className={`text-xs px-3 py-1.5 rounded-[var(--radius-md)] font-medium transition-colors ${
                  tab === "unread"
                    ? "bg-[var(--color-text-primary)] text-white"
                    : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-active)]"
                }`}
              >
                Unread{unreadCount > 0 && ` (${unreadCount})`}
              </button>
            </div>
          </div>

          {/* Notification List */}
          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <div className="py-8 text-center">
                <div className="inline-block w-5 h-5 border-2 border-[var(--color-border-primary)] border-t-[var(--color-text-secondary)] rounded-full animate-spin" />
              </div>
            ) : displayList.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-xs text-[var(--color-text-tertiary)]">
                  {tab === "new" ? "No new notifications in the last 24 hours" : "All caught up!"}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--color-border-secondary)]">
                {displayList.map((n) => (
                  <div
                    key={n.id}
                    onClick={() => handleClick(n)}
                    className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors ${
                      n.is_read ? "hover:bg-[var(--color-surface-hover)]" : "bg-[var(--color-accent-light)] hover:bg-[var(--color-accent-light)]"
                    }`}
                  >
                    <span className="text-sm mt-0.5 shrink-0">
                      {TYPE_ICONS[n.type] || "🔔"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs leading-snug ${n.is_read ? "text-[var(--color-text-secondary)]" : "text-[var(--color-text-primary)] font-medium"}`}>
                        {n.title}
                      </p>
                      {n.body && (
                        <p className="text-[11px] text-[var(--color-text-tertiary)] mt-0.5 line-clamp-1">{n.body}</p>
                      )}
                      <p className="text-[11px] text-[var(--color-text-tertiary)] mt-0.5">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                      </p>
                    </div>
                    {!n.is_read && (
                      <div className="w-2 h-2 rounded-full bg-[var(--color-accent)] shrink-0 mt-1.5" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-[var(--color-border-secondary)] p-2">
            <button
              onClick={() => { setOpen(false); router.push("/communications/notifications"); }}
              className="w-full text-xs text-center py-2 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] rounded-[var(--radius-md)] font-medium transition-colors"
            >
              See all notifications
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
