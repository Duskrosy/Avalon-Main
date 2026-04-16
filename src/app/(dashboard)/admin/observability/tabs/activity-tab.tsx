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
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
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

function getPage(item: TimelineItem): string {
  if (item.kind === "event") {
    const props = item.data.properties;
    if (props && typeof props === "object" && "page" in props) {
      return String(props.page);
    }
    return item.data.module || "-";
  }
  const TABLE_TO_PAGE: Record<string, string> = {
    profiles: "People", departments: "People", leaves: "Leaves",
    kanban_boards: "Kanban", kanban_columns: "Kanban", kanban_cards: "Kanban",
    kops: "KOP Library", learning_materials: "Learning", memos: "Memos",
    smm_posts: "Content", smm_groups: "Content", creative_content_items: "Tracker",
    ad_assets: "Ad Ops", ad_requests: "Ad Ops", meta_campaigns: "Ad Ops",
    feedback: "Pulse", inventory_records: "Inventory", inventory_movements: "Inventory",
    catalog_items: "Catalog", ops_orders: "Orders", dispatch_queue: "Dispatch",
    confirmed_sales: "Sales", daily_volumes: "Sales", room_bookings: "Rooms",
  };
  return TABLE_TO_PAGE[item.data.table_name] ?? item.data.table_name;
}

function getChangeSummary(item: TimelineItem): string {
  if (item.kind === "event") {
    return item.data.event_name;
  }
  const a = item.data;
  if (a.action === "INSERT") {
    const name = a.new_values?.title ?? a.new_values?.name ?? a.new_values?.product_name ?? a.new_values?.campaign_name ?? "";
    return name ? `Created "${name}"` : "Created record";
  }
  if (a.action === "DELETE") {
    const name = a.old_values?.title ?? a.old_values?.name ?? a.old_values?.product_name ?? "";
    return name ? `Deleted "${name}"` : "Deleted record";
  }
  if (a.old_values && a.new_values) {
    const changed = Object.keys(a.new_values).filter(
      (k) => !["updated_at", "created_at", "id"].includes(k) && JSON.stringify(a.old_values![k]) !== JSON.stringify(a.new_values![k])
    );
    if (changed.length === 0) return "No visible changes";
    if (changed.length <= 3) return `Updated ${changed.join(", ")}`;
    return `Updated ${changed.length} fields`;
  }
  return `${a.action} on ${a.table_name}`;
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
  const [sortCol, setSortCol] = useState<"time" | "user" | "page" | "module">("time");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

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

  function toggleSort(col: "time" | "user" | "page" | "module") {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("desc");
    }
  }

  // Reset display limit when filters change
  useEffect(() => {
    setDisplayLimit(100);
  }, [days, selectedUser, moduleFilter, typeFilter, sortCol, sortDir]);

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

    const dir = sortDir === "asc" ? 1 : -1;
    items.sort((a, b) => {
      if (sortCol === "time") {
        return dir * (new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      }
      if (sortCol === "user") {
        const aName = userName(data.users, a.kind === "event" ? a.data.actor_id : a.data.actor_id);
        const bName = userName(data.users, b.kind === "event" ? b.data.actor_id : b.data.actor_id);
        return dir * aName.localeCompare(bName);
      }
      if (sortCol === "page") {
        return dir * getPage(a).localeCompare(getPage(b));
      }
      if (sortCol === "module") {
        const am = a.kind === "event" ? a.data.module : a.data.table_name;
        const bm = b.kind === "event" ? b.data.module : b.data.table_name;
        return dir * am.localeCompare(bm);
      }
      return 0;
    });

    return items;
  }, [data.events, data.audit, typeFilter, sortCol, sortDir]);

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

      {/* Sortable headers */}
      {!loading && timeline.length > 0 && (
        <div className="flex items-center gap-3 py-2 px-1 mb-2 border-b border-[var(--color-border-primary)]">
          <button onClick={() => toggleSort("time")} className={`text-xs font-medium uppercase tracking-wider flex items-center gap-1 w-24 shrink-0 ${sortCol === "time" ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-tertiary)]"}`}>
            Time {sortCol === "time" && <span className="text-[10px]">{sortDir === "asc" ? "▲" : "▼"}</span>}
          </button>
          <button onClick={() => toggleSort("module")} className={`text-xs font-medium uppercase tracking-wider flex items-center gap-1 flex-1 ${sortCol === "module" ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-tertiary)]"}`}>
            Action {sortCol === "module" && <span className="text-[10px]">{sortDir === "asc" ? "▲" : "▼"}</span>}
          </button>
          <button onClick={() => toggleSort("page")} className={`text-xs font-medium uppercase tracking-wider flex items-center gap-1 w-28 shrink-0 ${sortCol === "page" ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-tertiary)]"}`}>
            Page {sortCol === "page" && <span className="text-[10px]">{sortDir === "asc" ? "▲" : "▼"}</span>}
          </button>
          <button onClick={() => toggleSort("user")} className={`text-xs font-medium uppercase tracking-wider flex items-center gap-1 w-36 shrink-0 ${sortCol === "user" ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-tertiary)]"}`}>
            User {sortCol === "user" && <span className="text-[10px]">{sortDir === "asc" ? "▲" : "▼"}</span>}
          </button>
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
  const actorId = item.kind === "event" ? item.data.actor_id : item.data.actor_id;
  const user = users.find((p) => p.id === actorId);
  const page = getPage(item);

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
          <span className="text-[10px] bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] px-1.5 py-0.5 rounded font-medium shrink-0">
            {e.module}
          </span>
          {!e.success && (
            <span className="text-[10px] bg-[var(--color-error-light)] text-[var(--color-error)] px-1.5 py-0.5 rounded font-semibold shrink-0">
              Failed
            </span>
          )}
        </div>
        <span className="text-[10px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded font-medium shrink-0 w-28 text-center truncate">
          {page}
        </span>
        <span className="text-xs text-[var(--color-text-tertiary)] shrink-0 w-36 truncate text-right">
          {userName(users, actorId)}
          {user?.departments?.name ? ` (${user.departments.name})` : ""}
        </span>
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
          {getChangeSummary(item)}
        </span>
        <span className="text-[10px] bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] px-1.5 py-0.5 rounded font-medium shrink-0">
          {a.table_name}
        </span>
      </div>
      <span className="text-[10px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded font-medium shrink-0 w-28 text-center truncate">
        {page}
      </span>
      <span className="text-xs text-[var(--color-text-tertiary)] shrink-0 w-36 truncate text-right">
        {userName(users, actorId)}
        {user?.departments?.name ? ` (${user.departments.name})` : ""}
      </span>
    </div>
  );
}
