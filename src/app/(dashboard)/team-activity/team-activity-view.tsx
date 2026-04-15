"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { format, parseISO, isToday, isYesterday } from "date-fns";

// ── Types ─────────────────────────────────────────────────────────────────────

type AppEvent = {
  id: string;
  event_name: string;
  category: string;
  actor_id: string;
  module: string;
  properties: Record<string, unknown> | null;
  success: boolean;
  created_at: string;
};

type AuditEntry = {
  id: string;
  actor_id: string;
  action: string;
  table_name: string;
  record_id: string | null;
  created_at: string;
};

type UserProfile = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  department_id: string | null;
  departments: { name: string } | null;
};

type ActivityData = {
  events: AppEvent[];
  audit: AuditEntry[];
  users: UserProfile[];
};

type TimelineItem =
  | { kind: "event"; data: AppEvent; created_at: string }
  | { kind: "audit"; data: AuditEntry; created_at: string };

// ── Style maps ────────────────────────────────────────────────────────────────

const CATEGORY_DOT: Record<string, string> = {
  product: "bg-[var(--color-accent)]",
  audit: "bg-gray-400",
  error: "bg-[var(--color-error)]",
  performance: "bg-purple-500",
};

const ACTION_DOT: Record<string, string> = {
  INSERT: "bg-[var(--color-success)]",
  UPDATE: "bg-[var(--color-accent)]",
  DELETE: "bg-[var(--color-error)]",
};

const DAYS_OPTIONS = [7, 14, 30] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function userName(users: UserProfile[], id: string): string {
  const u = users.find((p) => p.id === id);
  return u ? `${u.first_name} ${u.last_name}` : "Unknown";
}

function dateGroupLabel(dateStr: string): string {
  const d = parseISO(dateStr);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "EEEE, d MMMM yyyy");
}

function dateKey(dateStr: string): string {
  return format(parseISO(dateStr), "yyyy-MM-dd");
}

function lastEventTime(
  events: AppEvent[],
  audit: AuditEntry[],
  userId: string
): string | null {
  const timestamps = [
    ...events.filter((e) => e.actor_id === userId).map((e) => e.created_at),
    ...audit.filter((a) => a.actor_id === userId).map((a) => a.created_at),
  ];
  if (timestamps.length === 0) return null;
  timestamps.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  return timestamps[0];
}

// ── Props ─────────────────────────────────────────────────────────────────────

type Props = {
  currentUser: {
    id: string;
    department_id: string | null;
    department_name: string;
  };
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function TeamActivityView({ currentUser }: Props) {
  const [data, setData] = useState<ActivityData>({ events: [], audit: [], users: [] });
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState<number>(14);
  const [selectedUserId, setSelectedUserId] = useState<string>("");

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchActivity = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ scope: "department", days: String(days) });
    if (selectedUserId) params.set("user_id", selectedUserId);

    const res = await fetch(`/api/obs/activity?${params}`);
    if (res.ok) {
      setData(await res.json());
    }
    setLoading(false);
  }, [days, selectedUserId]);

  useEffect(() => {
    fetchActivity();
  }, [fetchActivity]);

  // ── Derived data ──────────────────────────────────────────────────────────

  const timeline = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [];
    data.events.forEach((e) =>
      items.push({ kind: "event", data: e, created_at: e.created_at })
    );
    data.audit.forEach((a) =>
      items.push({ kind: "audit", data: a, created_at: a.created_at })
    );
    items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return items;
  }, [data.events, data.audit]);

  const groupedTimeline = useMemo(() => {
    const groups: { label: string; key: string; items: TimelineItem[] }[] = [];
    for (const item of timeline) {
      const dk = dateKey(item.created_at);
      const last = groups[groups.length - 1];
      if (last && last.key === dk) {
        last.items.push(item);
      } else {
        groups.push({ label: dateGroupLabel(item.created_at), key: dk, items: [item] });
      }
    }
    return groups;
  }, [timeline]);

  // Module usage aggregation
  const moduleUsage = useMemo(() => {
    const relevantEvents = selectedUserId
      ? data.events.filter((e) => e.actor_id === selectedUserId)
      : data.events;

    const counts: Record<string, number> = {};
    relevantEvents.forEach((e) => {
      if (e.module) {
        counts[e.module] = (counts[e.module] || 0) + 1;
      }
    });

    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1]);
  }, [data.events, selectedUserId]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">Team Activity</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          Activity within {currentUser.department_name}
        </p>
      </div>

      {/* Team member grid */}
      <div className="mb-6">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setSelectedUserId("")}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors border ${
              !selectedUserId
                ? "bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] border-[var(--color-text-primary)]"
                : "bg-[var(--color-bg-primary)] text-[var(--color-text-secondary)] border-[var(--color-border-primary)] hover:bg-[var(--color-surface-hover)]"
            }`}
          >
            All members
          </button>

          {data.users.map((u) => {
            const isSelected = selectedUserId === u.id;
            const last = lastEventTime(data.events, data.audit, u.id);
            return (
              <button
                key={u.id}
                onClick={() => setSelectedUserId(isSelected ? "" : u.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                  isSelected
                    ? "bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] border-[var(--color-text-primary)]"
                    : "bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] border-[var(--color-border-primary)] hover:bg-[var(--color-surface-hover)]"
                }`}
              >
                <span>{u.first_name} {u.last_name}</span>
                {last && (
                  <span className={`${isSelected ? "text-[var(--color-text-tertiary)]" : "text-[var(--color-text-tertiary)]"} text-[10px]`}>
                    {format(parseISO(last), "d MMM HH:mm")}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Days filter */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex rounded-lg border border-[var(--color-border-primary)] overflow-hidden">
          {DAYS_OPTIONS.map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                days === d
                  ? "bg-[var(--color-text-primary)] text-[var(--color-text-inverted)]"
                  : "bg-[var(--color-bg-primary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>

        <span className="text-xs text-[var(--color-text-tertiary)]">
          {timeline.length} {timeline.length === 1 ? "entry" : "entries"}
        </span>
      </div>

      {/* Main content: feed + sidebar */}
      <div className="flex gap-6 items-start">
        {/* Activity feed */}
        <div className="flex-1 min-w-0">
          {loading ? (
            <div className="text-center py-16 text-[var(--color-text-tertiary)] text-sm">Loading...</div>
          ) : timeline.length === 0 ? (
            <div className="bg-[var(--color-bg-secondary)] rounded-[var(--radius-lg)] p-12 text-center">
              <p className="text-sm text-[var(--color-text-tertiary)]">
                No activity found for the selected period.
              </p>
            </div>
          ) : (
            <div>
              {groupedTimeline.map((group) => (
                <div key={group.key} className="mb-6">
                  <h3 className="text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-3">
                    {group.label}
                  </h3>
                  <div className="space-y-0">
                    {group.items.map((item) => (
                      <TimelineRow
                        key={`${item.kind}-${item.data.id}`}
                        item={item}
                        users={data.users}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Module usage sidebar */}
        {!loading && moduleUsage.length > 0 && (
          <div className="w-64 shrink-0 hidden lg:block">
            <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4 sticky top-4">
              <h3 className="text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-3">
                Module Usage
              </h3>
              <div className="space-y-2">
                {moduleUsage.map(([mod, count]) => (
                  <div key={mod} className="flex items-center justify-between">
                    <span className="text-sm text-[var(--color-text-primary)] truncate">{mod}</span>
                    <span className="text-xs font-medium text-[var(--color-text-secondary)] bg-[var(--color-bg-tertiary)] px-2 py-0.5 rounded-full">
                      {count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TimelineRow({ item, users }: { item: TimelineItem; users: UserProfile[] }) {
  if (item.kind === "event") {
    const e = item.data;
    const dotColor = CATEGORY_DOT[e.category] ?? "bg-gray-400";
    return (
      <div className="flex items-start gap-3 py-2.5 border-b border-[var(--color-border-secondary)] last:border-b-0">
        <span className="text-xs text-[var(--color-text-tertiary)] w-24 shrink-0 pt-0.5">
          {format(parseISO(e.created_at), "d MMM HH:mm")}
        </span>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
          <span className="text-sm text-[var(--color-text-primary)] truncate">{e.event_name}</span>
          {e.module && (
            <span className="text-[10px] bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] px-1.5 py-0.5 rounded font-medium shrink-0">
              {e.module}
            </span>
          )}
        </div>
        <span className="text-xs text-[var(--color-text-tertiary)] shrink-0">{userName(users, e.actor_id)}</span>
      </div>
    );
  }

  const a = item.data;
  const dotColor = ACTION_DOT[a.action] ?? "bg-gray-400";
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-[var(--color-border-secondary)] last:border-b-0">
      <span className="text-xs text-[var(--color-text-tertiary)] w-24 shrink-0 pt-0.5">
        {format(parseISO(a.created_at), "d MMM HH:mm")}
      </span>
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
        <span className="text-sm text-[var(--color-text-primary)] truncate">
          {a.action} on {a.table_name}
        </span>
      </div>
      <span className="text-xs text-[var(--color-text-tertiary)] shrink-0">{userName(users, a.actor_id)}</span>
    </div>
  );
}
