"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow, isToday, isYesterday } from "date-fns";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link_url: string | null;
  is_read: boolean;
  created_at: string;
};

function timeAgo(date: string) {
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}

function group(notifications: Notification[]) {
  const today: Notification[] = [];
  const yesterday: Notification[] = [];
  const earlier: Notification[] = [];
  for (const n of notifications) {
    const d = new Date(n.created_at);
    if (isToday(d)) today.push(n);
    else if (isYesterday(d)) yesterday.push(n);
    else earlier.push(n);
  }
  return { today, yesterday, earlier };
}

export function NotificationsList({ initialNotifications }: { initialNotifications: Notification[] }) {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>(initialNotifications);

  const markRead = useCallback(async (id: string) => {
    setNotifications((ns) => ns.map((n) => n.id === id ? { ...n, is_read: true } : n));
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
  }, []);

  const markAllRead = useCallback(async () => {
    setNotifications((ns) => ns.map((n) => ({ ...n, is_read: true })));
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mark_all: true }),
    });
  }, []);

  const handleClick = useCallback((n: Notification) => {
    if (!n.is_read) markRead(n.id);
    if (n.link_url) router.push(n.link_url);
  }, [markRead, router]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const { today, yesterday, earlier } = group(notifications);

  function Section({ title, items }: { title: string; items: Notification[] }) {
    if (!items.length) return null;
    return (
      <div>
        <h2 className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-2">{title}</h2>
        <div className="space-y-1.5">
          {items.map((n) => (
            <div
              key={n.id}
              onClick={() => handleClick(n)}
              className={`flex items-start gap-3 p-3 rounded-[var(--radius-lg)] cursor-pointer transition-colors ${
                n.is_read ? "bg-[var(--color-bg-primary)] border border-[var(--color-border-secondary)] hover:bg-[var(--color-surface-hover)]" : "bg-[var(--color-accent-light)] border border-blue-100 hover:bg-[var(--color-accent-light)]"
              }`}
            >
              <div className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${n.is_read ? "bg-[var(--color-border-primary)]" : "bg-[var(--color-accent-light)]0"}`} />
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${n.is_read ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-primary)] font-medium"}`}>
                  {n.title}
                </p>
                {n.body && (
                  <p className="text-xs text-[var(--color-text-secondary)] mt-0.5 line-clamp-2">{n.body}</p>
                )}
                <p className="text-xs text-[var(--color-text-tertiary)] mt-1">{timeAgo(n.created_at)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">Notifications</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] border border-[var(--color-border-primary)] px-3 py-1.5 rounded-lg hover:bg-[var(--color-surface-hover)]"
          >
            Mark all read
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <p className="text-sm text-[var(--color-text-tertiary)] py-8 text-center">No notifications yet.</p>
      ) : (
        <div className="space-y-6">
          <Section title="Today" items={today} />
          <Section title="Yesterday" items={yesterday} />
          <Section title="Earlier" items={earlier} />
        </div>
      )}
    </div>
  );
}
