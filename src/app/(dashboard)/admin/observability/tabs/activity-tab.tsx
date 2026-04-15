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

type TypeFilter = "all" | "events" | "audit";

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

// ── Component ─────────────────────────────────────────────────────────────────

export function ActivityTab() {
  const [data, setData] = useState<ActivityData>({ events: [], audit: [], users: [] });
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState<number>(30);
  const [selectedUser, setSelectedUser] = useState<string>("");
  const [moduleFilter, setModuleFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [displayLimit, setDisplayLimit] = useState(100);

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchActivity = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("scope", "all");
    params.set("days", String(days));
    if (selectedUser) params.set("user_id", selectedUser);
    if (moduleFilter) params.set("module", moduleFilter);

    const res = await fetch(`/api/obs/activity?${params}`);
    if (res.ok) {
      setData(await res.json());
    }
    setLoading(false);
  }, [days, selectedUser, moduleFilter]);

  useEffect(() => {
    fetchActivity();
  }, [fetchActivity]);

  // Reset display limit when filters change
  useEffect(() => {
    setDisplayLimit(100);
  }, [days, selectedUser, moduleFilter, typeFilter]);

  // ── Derived data ──────────────────────────────────────────────────────────

  const uniqueModules = useMemo(
    () => Array.from(new Set(data.events.map((e) => e.module).filter(Boolean))).sort(),
    [data.events]
  );

  const timeline = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [];

    if (typeFilter !== "audit") {
      data.events.forEach((e) => items.push({ kind: "event", data: e, created_at: e.created_at }));
    }
    if (typeFilter !== "events") {
      data.audit.forEach((a) => items.push({ kind: "audit", data: a, created_at: a.created_at }));
    }

    items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return items;
  }, [data.events, data.audit, typeFilter]);

  const groupedTimeline = useMemo(() => {
    const limited = timeline.slice(0, displayLimit);
    const groups: { label: string; key: string; items: TimelineItem[] }[] = [];

    for (const item of limited) {
      const dk = dateKey(item.created_at);
      const last = groups[groups.length - 1];
      if (last && last.key === dk) {
        last.items.push(item);
      } else {
        groups.push({ label: dateGroupLabel(item.created_at), key: dk, items: [item] });
      }
    }
    return groups;
  }, [timeline, displayLimit]);

  // ── Summary stats ─────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const uniqueActors = new Set([
      ...data.events.map((e) => e.actor_id),
      ...data.audit.map((a) => a.actor_id),
    ]);

    const moduleCounts: Record<string, number> = {};
    data.events.forEach((e) => {
      moduleCounts[e.module] = (moduleCounts[e.module] || 0) + 1;
    });
    const mostActive = Object.entries(moduleCounts).sort((a, b) => b[1] - a[1])[0];

    return {
      totalEvents: data.events.length,
      totalAudit: data.audit.length,
      uniqueUsers: uniqueActors.size,
      mostActiveModule: mostActive ? mostActive[0] : "—",
    };
  }, [data.events, data.audit]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* User selector */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <select
          value={selectedUser}
          onChange={(e) => setSelectedUser(e.target.value)}
          className="border border-[var(--color-border-primary)] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] min-w-[180px]"
        >
          <option value="">All users</option>
          {data.users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.first_name} {u.last_name}
            </option>
          ))}
        </select>

        {/* Days toggle */}
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

        {/* Module filter */}
        <select
          value={moduleFilter}
          onChange={(e) => setModuleFilter(e.target.value)}
          className="border border-[var(--color-border-primary)] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
        >
          <option value="">All modules</option>
          {uniqueModules.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>

        {/* Type toggle */}
        <div className="flex rounded-lg border border-[var(--color-border-primary)] overflow-hidden">
          {(["all", "events", "audit"] as TypeFilter[]).map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                typeFilter === t
                  ? "bg-[var(--color-text-primary)] text-[var(--color-text-inverted)]"
                  : "bg-[var(--color-bg-primary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      {!loading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <StatCard label="Total Events" value={stats.totalEvents} />
          <StatCard label="Total Audit Actions" value={stats.totalAudit} />
          <StatCard label="Unique Users Active" value={stats.uniqueUsers} />
          <StatCard label="Most Active Module" value={stats.mostActiveModule} />
        </div>
      )}

      {/* Timeline */}
      {loading ? (
        <div className="text-center py-16 text-[var(--color-text-tertiary)] text-sm">Loading...</div>
      ) : timeline.length === 0 ? (
        <div className="bg-[var(--color-bg-secondary)] rounded-[var(--radius-lg)] p-12 text-center">
          <p className="text-sm text-[var(--color-text-tertiary)]">
            {selectedUser
              ? "No activity found for this user in the selected period."
              : "Select a user or view all activity."}
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
                    key={`${item.kind}-${item.kind === "event" ? item.data.id : item.data.id}`}
                    item={item}
                    users={data.users}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* Load more */}
          {displayLimit < timeline.length && (
            <div className="text-center py-4">
              <button
                onClick={() => setDisplayLimit((l) => l * 2)}
                className="text-xs border border-[var(--color-border-primary)] px-4 py-2 rounded-lg hover:bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)]"
              >
                Load more ({timeline.length - displayLimit} remaining)
              </button>
            </div>
          )}

          <p className="text-xs text-[var(--color-text-tertiary)] text-center mt-2">
            Showing {Math.min(displayLimit, timeline.length)} of {timeline.length} entries
          </p>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] px-4 py-3">
      <p className="text-xs text-[var(--color-text-secondary)]">{label}</p>
      <p className="text-lg font-semibold text-[var(--color-text-primary)] mt-0.5">
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
    </div>
  );
}

function TimelineRow({ item, users }: { item: TimelineItem; users: UserProfile[] }) {
  if (item.kind === "event") {
    const e = item.data;
    const dotColor = CATEGORY_DOT[e.category] ?? "bg-gray-400";
    return (
      <div className="flex items-start gap-3 py-2.5 border-b border-[var(--color-border-secondary)] last:border-b-0">
        {/* Timestamp */}
        <span className="text-xs text-[var(--color-text-tertiary)] w-24 shrink-0 pt-0.5">
          {format(parseISO(e.created_at), "d MMM HH:mm")}
        </span>
        {/* Dot + description */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
          <span className="text-sm text-[var(--color-text-primary)] truncate">{e.event_name}</span>
          <span className="text-[10px] bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] px-1.5 py-0.5 rounded font-medium shrink-0">
            {e.module}
          </span>
          {!e.success && (
            <span className="text-[10px] bg-[var(--color-error-light)] text-[var(--color-error)] px-1.5 py-0.5 rounded font-semibold shrink-0">
              Failed
            </span>
          )}
        </div>
        {/* Actor */}
        <span className="text-xs text-[var(--color-text-tertiary)] shrink-0">{userName(users, e.actor_id)}</span>
      </div>
    );
  }

  // Audit entry
  const a = item.data;
  const dotColor = ACTION_DOT[a.action] ?? "bg-gray-400";
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-[var(--color-border-secondary)] last:border-b-0">
      {/* Timestamp */}
      <span className="text-xs text-[var(--color-text-tertiary)] w-24 shrink-0 pt-0.5">
        {format(parseISO(a.created_at), "d MMM HH:mm")}
      </span>
      {/* Dot + description */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
        <span className="text-sm text-[var(--color-text-primary)] truncate">
          {a.action} on {a.table_name}
        </span>
        {a.record_id && (
          <span className="text-[10px] font-mono bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] px-1.5 py-0.5 rounded shrink-0 truncate max-w-32">
            {a.record_id}
          </span>
        )}
      </div>
      {/* Actor */}
      <span className="text-xs text-[var(--color-text-tertiary)] shrink-0">{userName(users, a.actor_id)}</span>
    </div>
  );
}
