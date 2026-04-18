"use client";

import { useState, useMemo, useCallback } from "react";
import { format, parseISO, startOfWeek, endOfWeek, subWeeks, isWithinInterval } from "date-fns";
import { useToast, Toast } from "@/components/ui/toast";
import { CREATIVE_GROUPS } from "@/lib/creatives/constants";
import { PeoplePicker } from "@/components/ui/people-picker";

// ── Types ─────────────────────────────────────────────────────
type Profile = {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url?: string | null;
  department_id?: string | null;
};

type Assignee = {
  user_id: string;
  profile: { id: string; first_name: string; last_name: string; avatar_url: string | null } | null;
};

type ContentItem = {
  id: string;
  title: string;
  content_type: string;
  channel_type: string;
  creative_type: string | null;
  funnel_stage: string | null;
  creative_angle: string | null;
  product_or_collection: string | null;
  campaign_label: string | null;
  promo_code: string | null;
  transfer_link: string | null;
  planned_week_start: string | null;
  date_submitted: string | null;
  status: string;
  assigned_to: string | null;
  group_label: string | null;
  linked_card_id: string | null;
  linked_post_id: string | null;
  linked_ad_asset_id: string | null;
  linked_external_url: string | null;
  linked_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  assignees?: Assignee[];
  assigned_profile: { id: string; first_name: string; last_name: string } | null;
  creator_profile: { id: string; first_name: string; last_name: string } | null;
};

type SmmPost = {
  id: string;
  platform: string;
  caption: string | null;
  status: string;
  published_at: string | null;
  scheduled_at: string | null;
};

type PlatformConnection = {
  id: string;
  group_id: string;
  platform: string;
  page_name: string | null;
  is_active: boolean;
  token_expires_at: string | null;
};

type Props = {
  items: ContentItem[];
  profiles: Profile[];
  posts: SmmPost[];
  platforms: PlatformConnection[];
  currentUserId: string;
  isManager: boolean;
  currentDeptId: string | null;
};

// ── Constants ─────────────────────────────────────────────────
const PLANNED_STATUSES = ["idea", "in_production", "submitted", "approved", "scheduled"];
const PUBLISHED_STATUSES = ["published", "archived"];

const STATUS_STYLES: Record<string, string> = {
  idea: "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]",
  in_production: "bg-[var(--color-accent-light)] text-[var(--color-accent)]",
  submitted: "bg-[var(--color-warning-light)] text-[var(--color-warning-text)]",
  approved: "bg-[var(--color-success-light)] text-[var(--color-success)]",
  scheduled: "bg-purple-100 text-purple-700",
  published: "bg-emerald-100 text-emerald-700",
  archived: "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]",
};

const STATUS_OPTIONS = [
  "idea",
  "in_production",
  "submitted",
  "approved",
  "scheduled",
  "published",
  "archived",
] as const;

const CONTENT_TYPES = ["organic", "ads", "offline_other"] as const;

const CREATIVE_TYPES = ["video", "stills", "asset"] as const;

const CHANNEL_TYPES = ["conversion", "messenger", "organic", "other"] as const;

const FUNNEL_STAGES = ["TOF", "MOF", "BOF"] as const;

const PLATFORM_STYLES: Record<string, string> = {
  facebook: "bg-[var(--color-accent-light)] text-[var(--color-accent)]",
  instagram: "bg-pink-100 text-pink-800",
  tiktok: "bg-[var(--color-text-primary)] text-[var(--color-text-inverted)]",
  youtube: "bg-[var(--color-error-light)] text-red-800",
};

// ── Helpers ───────────────────────────────────────────────────
function fmtLabel(s: string): string {
  return s
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtDate(d: string | null): string {
  if (!d) return "-";
  try {
    return format(parseISO(d), "MMM d, yyyy");
  } catch {
    return d;
  }
}

function profileName(p: { first_name: string; last_name: string } | null): string {
  if (!p) return "-";
  return `${p.first_name} ${p.last_name}`;
}

function fmtK(n: number | null | undefined): string {
  if (n == null) return "-";
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function getWeekGroup(plannedWeekStart: string | null): "this_week" | "last_week" | "older" | "unscheduled" {
  if (!plannedWeekStart) return "unscheduled";
  const d = parseISO(plannedWeekStart);
  const now = new Date();
  const thisMonday = startOfWeek(now, { weekStartsOn: 1 });
  const thisSunday = endOfWeek(now, { weekStartsOn: 1 });
  const lastMonday = subWeeks(thisMonday, 1);
  const lastSunday = subWeeks(thisSunday, 1);
  if (isWithinInterval(d, { start: thisMonday, end: thisSunday })) return "this_week";
  if (isWithinInterval(d, { start: lastMonday, end: lastSunday })) return "last_week";
  return "older";
}

const WEEK_LABELS: Record<string, string> = {
  this_week: "This Week",
  last_week: "Last Week",
  older: "Older",
  unscheduled: "Unscheduled",
};
const WEEK_ORDER = ["this_week", "last_week", "older", "unscheduled"];

// ── Component ─────────────────────────────────────────────────
export default function TrackerView({
  items: initialItems,
  profiles,
  posts,
  platforms,
  currentUserId,
  isManager,
  currentDeptId,
}: Props) {
  const { toast, setToast } = useToast();
  const [items, setItems] = useState<ContentItem[]>(initialItems);
  const [tab, setTab] = useState<"planned" | "published" | "live">("planned");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [editItem, setEditItem] = useState<ContentItem | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [linkItem, setLinkItem] = useState<ContentItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [livePosts, setLivePosts] = useState<any[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [linkingItemId, setLinkingItemId] = useState<string | null>(null);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/smm/social-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        setToast({ message: "Sync complete", type: "success" });
        // Refresh live data
        const topRes = await fetch("/api/smm/top-posts?from=2020-01-01&to=2099-01-01");
        if (topRes.ok) {
          const topData = await topRes.json();
          const allPosts: any[] = [];
          if (topData && typeof topData === "object") {
            for (const posts of Object.values(topData)) {
              if (Array.isArray(posts)) allPosts.push(...posts);
            }
          }
          setLivePosts(allPosts);
        }
      } else {
        setToast({ message: "Sync failed", type: "error" });
      }
    } catch {
      setToast({ message: "Sync failed", type: "error" });
    } finally {
      setSyncing(false);
    }
  }, [setToast]);

  // ── Filtered items ────────────────────────────────────────
  const planned = useMemo(
    () =>
      items
        .filter((i) => PLANNED_STATUSES.includes(i.status))
        .filter((i) => groupFilter === "all" || i.group_label === groupFilter)
        .filter(
          (i) =>
            !search ||
            i.title.toLowerCase().includes(search.toLowerCase()) ||
            (i.campaign_label ?? "").toLowerCase().includes(search.toLowerCase())
        )
        .filter((i) => !statusFilter || i.status === statusFilter),
    [items, search, statusFilter, groupFilter]
  );

  const published = useMemo(
    () =>
      items
        .filter((i) => PUBLISHED_STATUSES.includes(i.status))
        .filter((i) => groupFilter === "all" || i.group_label === groupFilter)
        .filter(
          (i) =>
            !search ||
            i.title.toLowerCase().includes(search.toLowerCase()) ||
            (i.campaign_label ?? "").toLowerCase().includes(search.toLowerCase())
        ),
    [items, search, groupFilter]
  );

  const active = tab === "planned" ? planned : published;

  const grouped = useMemo(() => {
    const q = search.toLowerCase();
    const base = items
      .filter((i) => tab === "planned" ? PLANNED_STATUSES.includes(i.status) : PUBLISHED_STATUSES.includes(i.status))
      .filter((i) => !statusFilter || i.status === statusFilter)
      .filter((i) => groupFilter === "all" || i.group_label === groupFilter)
      .filter((i) => {
        if (!q) return true;
        const assigneeName = i.assigned_profile ? `${i.assigned_profile.first_name} ${i.assigned_profile.last_name}` : "";
        return `${i.title} ${assigneeName} ${i.campaign_label ?? ""} ${i.product_or_collection ?? ""}`.toLowerCase().includes(q);
      });

    return WEEK_ORDER.map((key) => ({
      key,
      label: WEEK_LABELS[key],
      items: base.filter((i) => getWeekGroup(i.planned_week_start) === key),
    })).filter((g) => g.items.length > 0);
  }, [items, tab, statusFilter, groupFilter, search]);

  // ── Inline status change ──────────────────────────────────
  const changeStatus = useCallback(
    async (id: string, status: string) => {
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)));
      await fetch("/api/creatives/content-items", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      setToast({ message: "Status updated", type: "success" });
    },
    [setToast]
  );

  // ── Create / Edit submit ──────────────────────────────────
  const handleSave = useCallback(
    async (data: Record<string, unknown>, isEdit: boolean) => {
      setSaving(true);
      try {
        const res = await fetch("/api/creatives/content-items", {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        const saved = await res.json().catch(() => null);
        if (isEdit && saved) {
          setItems((prev) => prev.map((i) => (i.id === saved.id ? { ...i, ...saved } : i)));
        } else if (saved) {
          setItems((prev) => [saved, ...prev]);
        }
        setShowCreate(false);
        setEditItem(null);
        setToast({ message: isEdit ? "Item updated" : "Item created", type: "success" });
      } finally {
        setSaving(false);
      }
    },
    [setToast]
  );

  // ── Link submit ───────────────────────────────────────────
  const handleLink = useCallback(
    async (itemId: string, linkedPostId: string | null, externalUrl: string) => {
      setSaving(true);
      try {
        const body: Record<string, unknown> = { id: itemId };
        if (linkedPostId) body.linked_post_id = linkedPostId;
        if (externalUrl.trim()) body.linked_external_url = externalUrl.trim();
        const res = await fetch("/api/creatives/content-items", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const saved = await res.json().catch(() => null);
        if (saved) {
          setItems((prev) => prev.map((i) => (i.id === saved.id ? { ...i, ...saved } : i)));
        }
        setLinkItem(null);
        setToast({ message: "Link updated", type: "success" });
      } finally {
        setSaving(false);
      }
    },
    [setToast]
  );

  // ── Assign post ───────────────────────────────────────────
  const handleAssignPost = useCallback(async (postId: string) => {
    if (!linkingItemId) return;
    setItems((prev) => prev.map((i) =>
      i.id === linkingItemId ? { ...i, linked_post_id: postId, transfer_link: null } : i
    ));
    await fetch("/api/creatives/content-items", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: linkingItemId, linked_post_id: postId, transfer_link: null }),
    });
    setLinkingItemId(null);
    setToast({ message: "Post assigned", type: "success" });
  }, [linkingItemId, setToast]);

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Creatives Tracker</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
        >
          + New Item
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2">
        <TabPill
          label={`Planned (${planned.length})`}
          active={tab === "planned"}
          onClick={() => {
            setTab("planned");
            setStatusFilter("");
          }}
        />
        <TabPill
          label={`Published (${published.length})`}
          active={tab === "published"}
          onClick={() => {
            setTab("published");
            setStatusFilter("");
          }}
        />
        <TabPill
          label="Live Analytics"
          active={tab === "live"}
          onClick={() => {
            setTab("live");
            setStatusFilter("");
          }}
        />
      </div>

      {/* Group tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        <TabPill
          label="All Groups"
          active={groupFilter === "all"}
          onClick={() => setGroupFilter("all")}
        />
        {CREATIVE_GROUPS.map((g) => (
          <TabPill
            key={g.slug}
            label={g.label}
            active={groupFilter === g.slug}
            onClick={() => setGroupFilter(g.slug)}
          />
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="text"
          placeholder="Search by title, assignee, campaign..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-64 rounded-[var(--radius-md)] border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-3 py-1.5 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-border-focus)]"
        />
        {tab === "planned" && (
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          >
            <option value="">All statuses</option>
            {PLANNED_STATUSES.map((s) => (
              <option key={s} value={s}>
                {fmtLabel(s)}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Table (desktop) / Cards (mobile) */}
      {tab === "live" ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--color-text-secondary)]">
              Published content analytics from connected platforms
            </p>
            <button
              onClick={handleSync}
              disabled={syncing}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {syncing ? "Syncing..." : "Sync"}
            </button>
          </div>
          {livePosts.length === 0 ? (
            <div className="rounded-[var(--radius-lg)] border border-[var(--color-border-secondary)] bg-[var(--color-bg-primary)] p-12 text-center text-sm text-[var(--color-text-tertiary)]">
              No live data yet. Click Sync to pull from connected platforms.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {livePosts.map((p: any, idx: number) => (
                <div
                  key={p.id || p.post_external_id || idx}
                  className="rounded-[var(--radius-lg)] border border-[var(--color-border-secondary)] bg-[var(--color-bg-primary)] p-4 space-y-2"
                >
                  {p.thumbnail_url && (
                    <img src={p.thumbnail_url} alt="" className="w-full h-32 object-cover rounded-lg" />
                  )}
                  <p className="text-sm text-[var(--color-text-primary)] line-clamp-2">
                    {p.caption_preview ?? p.caption ?? "(no caption)"}
                  </p>
                  <div className="flex flex-wrap gap-3 text-xs text-[var(--color-text-secondary)]">
                    {p.impressions != null && <span>Impressions: {fmtK(p.impressions)}</span>}
                    {p.engagements != null && <span>Engagements: {fmtK(p.engagements)}</span>}
                    {p.video_plays != null && <span>Plays: {fmtK(p.video_plays)}</span>}
                  </div>
                  {p.published_at && (
                    <p className="text-xs text-[var(--color-text-tertiary)]">
                      {fmtDate(p.published_at)}
                    </p>
                  )}
                  {p.post_url && (
                    <a
                      href={p.post_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-indigo-600 hover:text-indigo-800"
                    >
                      View post
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          {grouped.length === 0 ? (
            <div className="rounded-[var(--radius-lg)] border border-[var(--color-border-secondary)] bg-[var(--color-bg-primary)] p-12 text-center text-sm text-[var(--color-text-tertiary)]">
              No items found.
            </div>
          ) : (
            <div className="space-y-6">
              {grouped.map((group) => (
                <div key={group.key}>
                  {/* Week group header */}
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <h3 className="text-sm font-semibold text-[var(--color-text-secondary)]">{group.label}</h3>
                    <span className="text-xs text-[var(--color-text-tertiary)]">({group.items.length})</span>
                  </div>

                  {/* Desktop table */}
                  <div className="hidden md:block overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-border-secondary)] bg-[var(--color-bg-primary)]">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-[var(--color-border-secondary)] text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
                          <th className="px-4 py-3">Title</th>
                          <th className="px-4 py-3">Group</th>
                          <th className="px-4 py-3">Content</th>
                          <th className="px-4 py-3">Format</th>
                          <th className="px-4 py-3">Funnel</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3">Campaign</th>
                          <th className="px-4 py-3">Assigned</th>
                          <th className="px-4 py-3">Planned Week</th>
                          {tab === "published" && (
                            <th className="px-4 py-3">Linked</th>
                          )}
                          <th className="px-4 py-3"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.items.map((item, idx) => (
                          <tr
                            key={item.id}
                            onClick={() => setEditItem(item)}
                            className={`cursor-pointer border-b border-[var(--color-border-secondary)] transition-colors hover:bg-indigo-50/40 ${
                              idx % 2 === 0 ? "bg-[var(--color-bg-primary)]" : "bg-[var(--color-bg-secondary)]/30"
                            }`}
                          >
                            <td className="px-4 py-3 font-medium text-[var(--color-text-primary)] max-w-[200px] truncate">
                              {item.title}
                            </td>
                            <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                              {item.group_label ? CREATIVE_GROUPS.find((g) => g.slug === item.group_label)?.label ?? item.group_label : "-"}
                            </td>
                            <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                              {fmtLabel(item.content_type)}
                            </td>
                            <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                              {item.creative_type ? fmtLabel(item.creative_type) : "-"}
                            </td>
                            <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                              {item.funnel_stage ?? "-"}
                            </td>
                            <td className="px-4 py-3">
                              <StatusDropdown
                                current={item.status}
                                onChange={(s) => {
                                  changeStatus(item.id, s);
                                }}
                              />
                            </td>
                            <td className="px-4 py-3 text-[var(--color-text-secondary)] max-w-[140px] truncate">
                              {item.campaign_label ?? "-"}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex -space-x-1.5">
                                {(item.assignees ?? []).slice(0, 3).map((a) => (
                                  <span key={a.user_id} title={a.profile ? `${a.profile.first_name} ${a.profile.last_name}` : ""} className="w-6 h-6 rounded-full border-2 border-[var(--color-bg-primary)] overflow-hidden inline-flex items-center justify-center flex-shrink-0">
                                    {a.profile?.avatar_url ? (
                                      <img src={a.profile.avatar_url} className="w-full h-full object-cover" alt="" />
                                    ) : (
                                      <span className="w-full h-full bg-[var(--color-accent)] text-white flex items-center justify-center text-[9px] font-bold">
                                        {a.profile?.first_name?.[0]}{a.profile?.last_name?.[0]}
                                      </span>
                                    )}
                                  </span>
                                ))}
                                {(item.assignees?.length ?? 0) > 3 && (
                                  <span className="w-6 h-6 rounded-full bg-[var(--color-bg-tertiary)] text-[var(--color-text-tertiary)] text-[9px] font-medium flex items-center justify-center border-2 border-[var(--color-bg-primary)]">
                                    +{(item.assignees?.length ?? 0) - 3}
                                  </span>
                                )}
                                {(!item.assignees || item.assignees.length === 0) && (
                                  <span className="text-xs text-[var(--color-text-tertiary)]">—</span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-[var(--color-text-secondary)] text-xs">
                              {fmtDate(item.planned_week_start)}
                            </td>
                            {tab === "published" && (
                              <td className="px-4 py-3">
                                {item.linked_post_id || item.linked_external_url ? (
                                  <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                                    Linked
                                  </span>
                                ) : (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setLinkItem(item);
                                    }}
                                    className="text-xs text-indigo-600 hover:text-indigo-800 underline"
                                  >
                                    Link
                                  </button>
                                )}
                              </td>
                            )}
                            <td className="px-4 py-3">
                              <button
                                onClick={(e) => { e.stopPropagation(); setLinkingItemId(item.id); }}
                                className="text-xs px-2 py-1 rounded-[var(--radius-md)] bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] whitespace-nowrap"
                              >
                                {item.linked_post_id ? "Reassign" : "Assign Post"}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile cards */}
                  <div className="md:hidden space-y-3">
                    {group.items.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => setEditItem(item)}
                        className="cursor-pointer rounded-[var(--radius-lg)] border border-[var(--color-border-secondary)] bg-[var(--color-bg-primary)] p-4 space-y-2 hover:border-indigo-200 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-medium text-[var(--color-text-primary)] text-sm leading-snug">
                            {item.title}
                          </p>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                              STATUS_STYLES[item.status] ?? "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]"
                            }`}
                          >
                            {fmtLabel(item.status)}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--color-text-secondary)]">
                          <span>{fmtLabel(item.content_type)}</span>
                          <span>{item.creative_type ? fmtLabel(item.creative_type) : "-"}</span>
                          {item.funnel_stage && <span>{item.funnel_stage}</span>}
                          {item.campaign_label && (
                            <span className="text-indigo-600">{item.campaign_label}</span>
                          )}
                          {item.group_label && (
                            <span className="text-indigo-600 font-medium">
                              {CREATIVE_GROUPS.find((g) => g.slug === item.group_label)?.label ?? item.group_label}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between text-xs text-[var(--color-text-tertiary)]">
                          <div className="flex -space-x-1.5">
                            {(item.assignees ?? []).slice(0, 3).map((a) => (
                              <span key={a.user_id} title={a.profile ? `${a.profile.first_name} ${a.profile.last_name}` : ""} className="w-5 h-5 rounded-full border-2 border-[var(--color-bg-primary)] overflow-hidden inline-flex items-center justify-center flex-shrink-0">
                                {a.profile?.avatar_url ? (
                                  <img src={a.profile.avatar_url} className="w-full h-full object-cover" alt="" />
                                ) : (
                                  <span className="w-full h-full bg-[var(--color-accent)] text-white flex items-center justify-center text-[8px] font-bold">
                                    {a.profile?.first_name?.[0]}{a.profile?.last_name?.[0]}
                                  </span>
                                )}
                              </span>
                            ))}
                            {(item.assignees?.length ?? 0) > 3 && (
                              <span className="w-5 h-5 rounded-full bg-[var(--color-bg-tertiary)] text-[var(--color-text-tertiary)] text-[8px] font-medium flex items-center justify-center border-2 border-[var(--color-bg-primary)]">
                                +{(item.assignees?.length ?? 0) - 3}
                              </span>
                            )}
                            {(!item.assignees || item.assignees.length === 0) && (
                              <span>—</span>
                            )}
                          </div>
                          <span>{fmtDate(item.planned_week_start)}</span>
                        </div>
                        {tab === "published" && (
                          <div className="pt-1">
                            {item.linked_post_id || item.linked_external_url ? (
                              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                                Linked
                              </span>
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setLinkItem(item);
                                }}
                                className="text-xs text-indigo-600 hover:text-indigo-800 underline"
                              >
                                Link to published content
                              </button>
                            )}
                          </div>
                        )}
                        <div className="pt-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); setLinkingItemId(item.id); }}
                            className="text-xs px-2 py-1 rounded-[var(--radius-md)] bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] whitespace-nowrap"
                          >
                            {item.linked_post_id ? "Reassign" : "Assign Post"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Create Modal */}
      {showCreate && (
        <ItemModal
          profiles={profiles}
          currentDeptId={currentDeptId}
          onSave={(data) => handleSave(data, false)}
          onClose={() => setShowCreate(false)}
          saving={saving}
        />
      )}

      {/* Edit Modal */}
      {editItem && (
        <ItemModal
          profiles={profiles}
          currentDeptId={currentDeptId}
          initial={editItem}
          onSave={(data) => handleSave({ ...data, id: editItem.id }, true)}
          onClose={() => setEditItem(null)}
          saving={saving}
        />
      )}

      {/* Link Modal */}
      {linkItem && (
        <LinkModal
          item={linkItem}
          posts={posts}
          onLink={(postId, url) => handleLink(linkItem.id, postId, url)}
          onClose={() => setLinkItem(null)}
          saving={saving}
        />
      )}
      {linkingItemId && (
        <AssignPostModal
          posts={posts}
          onSelect={handleAssignPost}
          onClose={() => setLinkingItemId(null)}
        />
      )}
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}

// ── AssignPostModal ───────────────────────────────────────────
function AssignPostModal({
  posts,
  onSelect,
  onClose,
}: {
  posts: SmmPost[];
  onSelect: (postId: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<string>("all");
  const [search, setSearch] = useState("");

  const platforms = useMemo(() => ["all", ...new Set(posts.map((p) => p.platform))], [posts]);
  const filtered = useMemo(() => posts.filter((p) => {
    if (tab !== "all" && p.platform !== tab) return false;
    if (search && !(p.caption ?? "").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [posts, tab, search]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-[var(--color-bg-primary)] rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] w-full max-w-lg max-h-[80vh] flex flex-col mx-4">
        <div className="p-4 border-b border-[var(--color-border-secondary)]">
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Assign to Live Post</h3>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by caption..."
            className="mt-2 w-full rounded-[var(--radius-md)] border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] px-3 py-1.5 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)]"
          />
          <div className="flex gap-1 mt-2 flex-wrap">
            {platforms.map((p) => (
              <button key={p} onClick={() => setTab(p)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize transition-colors ${
                  tab === p ? "bg-[var(--color-accent)] text-white" : "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
                }`}>
                {p}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {filtered.length === 0 && (
            <p className="text-sm text-[var(--color-text-tertiary)] text-center py-8">No posts found</p>
          )}
          {filtered.map((post) => (
            <button key={post.id} onClick={() => onSelect(post.id)}
              className="w-full text-left p-3 rounded-[var(--radius-md)] hover:bg-[var(--color-surface-hover)] flex items-start gap-3 transition-colors">
              <span className="text-xs font-medium capitalize px-1.5 py-0.5 rounded bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] flex-shrink-0">
                {post.platform}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[var(--color-text-primary)] line-clamp-2">{post.caption ?? "(no caption)"}</p>
                <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
                  {post.published_at ? format(parseISO(post.published_at), "MMM d, yyyy") : "Not published"}
                </p>
              </div>
            </button>
          ))}
        </div>
        <div className="p-3 border-t border-[var(--color-border-secondary)]">
          <button onClick={onClose} className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────

function TabPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "bg-indigo-600 text-white"
          : "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border-primary)]"
      }`}
    >
      {label}
    </button>
  );
}

function StatusDropdown({
  current,
  onChange,
}: {
  current: string;
  onChange: (s: string) => void;
}) {
  return (
    <select
      value={current}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onChange(e.target.value)}
      className={`rounded-full px-2 py-0.5 text-xs font-medium border-0 cursor-pointer focus:ring-1 focus:ring-indigo-400 ${
        STATUS_STYLES[current] ?? "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]"
      }`}
    >
      {STATUS_OPTIONS.map((s) => (
        <option key={s} value={s}>
          {fmtLabel(s)}
        </option>
      ))}
    </select>
  );
}

// ── Item Modal (Create / Edit) ────────────────────────────────
function ItemModal({
  profiles,
  currentDeptId,
  initial,
  onSave,
  onClose,
  saving,
}: {
  profiles: Profile[];
  currentDeptId: string | null;
  initial?: ContentItem;
  onSave: (data: Record<string, unknown>) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [contentType, setContentType] = useState(initial?.content_type ?? "ads");
  const [creativeType, setCreativeType] = useState(initial?.creative_type ?? (initial ? "" : "video"));
  const [channelType, setChannelType] = useState(initial?.channel_type ?? "conversion");
  const [funnelStage, setFunnelStage] = useState(initial?.funnel_stage ?? "");
  const [creativeAngle, setCreativeAngle] = useState(initial?.creative_angle ?? "");
  const [product, setProduct] = useState(initial?.product_or_collection ?? "");
  const [campaign, setCampaign] = useState(initial?.campaign_label ?? "");
  const [promoCode, setPromoCode] = useState(initial?.promo_code ?? "");
  const [plannedWeek, setPlannedWeek] = useState(initial?.planned_week_start ?? "");
  const [dateSubmitted, setDateSubmitted] = useState(initial?.date_submitted ?? "");
  const [assigneeIds, setAssigneeIds] = useState<string[]>(
    initial?.assignees?.map((a) => a.user_id) ?? (initial?.assigned_to ? [initial.assigned_to] : [])
  );
  const [status, setStatus] = useState(initial?.status ?? "idea");
  const [groupLabel, setGroupLabel] = useState(initial?.group_label ?? "local");

  const isEdit = !!initial;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({
      title: title.trim(),
      content_type: contentType,
      creative_type: creativeType,
      channel_type: channelType,
      funnel_stage: contentType === "ads" ? funnelStage || null : null,
      creative_angle: creativeAngle || null,
      product_or_collection: product || null,
      campaign_label: campaign || null,
      promo_code: promoCode || null,
      planned_week_start: plannedWeek || null,
      date_submitted: dateSubmitted || null,
      assignee_ids: assigneeIds,
      status,
      group_label: groupLabel,
    });
  }

  return (
    <Overlay onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <h2 className="text-lg font-bold text-[var(--color-text-primary)]">
          {isEdit ? "Edit Item" : "New Content Item"}
        </h2>

        <Field label="Title *">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="w-full rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            autoFocus
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Content Type">
            <select
              value={contentType}
              onChange={(e) => {
                setContentType(e.target.value);
                if (e.target.value !== "ads") setFunnelStage("");
              }}
              className="w-full rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            >
              {CONTENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {fmtLabel(t)}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Creative Type">
            <select
              value={creativeType}
              onChange={(e) => setCreativeType(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            >
              <option value="">Select…</option>
              {CREATIVE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {fmtLabel(t)}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Channel Type">
            <select
              value={channelType}
              onChange={(e) => setChannelType(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            >
              {CHANNEL_TYPES.map((t) => (
                <option key={t} value={t}>
                  {fmtLabel(t)}
                </option>
              ))}
            </select>
          </Field>

          {contentType === "ads" && (
            <Field label="Funnel Stage">
              <select
                value={funnelStage}
                onChange={(e) => setFunnelStage(e.target.value)}
                className="w-full rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              >
                <option value="">-</option>
                {FUNNEL_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <Field label="Status">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {fmtLabel(s)}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Group">
            <select
              value={groupLabel}
              onChange={(e) => setGroupLabel(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            >
              {CREATIVE_GROUPS.map((g) => (
                <option key={g.slug} value={g.slug}>
                  {g.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Campaign Label">
            <input
              type="text"
              value={campaign}
              onChange={(e) => setCampaign(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </Field>

          <Field label="Product / Collection">
            <input
              type="text"
              value={product}
              onChange={(e) => setProduct(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </Field>

          <Field label="Promo Code">
            <input
              type="text"
              value={promoCode}
              onChange={(e) => setPromoCode(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </Field>


          <Field label="Planned Week Start">
            <input
              type="date"
              value={plannedWeek}
              onChange={(e) => setPlannedWeek(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </Field>

          <Field label="Date Submitted">
            <input
              type="date"
              value={dateSubmitted}
              onChange={(e) => setDateSubmitted(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </Field>

        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-[var(--color-text-primary)]">Assignees</label>
          <PeoplePicker
            value={assigneeIds}
            onChange={setAssigneeIds}
            allUsers={profiles}
            currentDeptId={currentDeptId}
            placeholder="Search and assign people..."
          />
        </div>

        <Field label="Creative Angle / Hook">
          <textarea
            value={creativeAngle}
            onChange={(e) => setCreativeAngle(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400 resize-y"
            placeholder="POV, hook, concept..."
          />
        </Field>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !title.trim()}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving..." : isEdit ? "Update" : "Create"}
          </button>
        </div>
      </form>
    </Overlay>
  );
}

// ── Link Modal ────────────────────────────────────────────────
function LinkModal({
  item,
  posts,
  onLink,
  onClose,
  saving,
}: {
  item: ContentItem;
  posts: SmmPost[];
  onLink: (postId: string | null, url: string) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [selectedPost, setSelectedPost] = useState<string | null>(null);
  const [externalUrl, setExternalUrl] = useState(item.linked_external_url ?? "");
  const [postSearch, setPostSearch] = useState("");

  const filtered = useMemo(
    () =>
      posts.filter(
        (p) =>
          !postSearch ||
          (p.caption ?? "").toLowerCase().includes(postSearch.toLowerCase()) ||
          p.platform.toLowerCase().includes(postSearch.toLowerCase())
      ),
    [posts, postSearch]
  );

  return (
    <Overlay onClose={onClose}>
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-[var(--color-text-primary)]">
          Link Published Content
        </h2>
        <p className="text-sm text-[var(--color-text-secondary)]">
          Link <span className="font-medium text-[var(--color-text-primary)]">{item.title}</span>{" "}
          to a published post or external URL.
        </p>

        {/* Post picker */}
        <div className="space-y-2">
          <label className="block text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
            Recent Published Posts
          </label>
          <input
            type="text"
            placeholder="Filter posts..."
            value={postSearch}
            onChange={(e) => setPostSearch(e.target.value)}
            className="w-full rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
          <div className="max-h-56 overflow-y-auto rounded-lg border border-[var(--color-border-secondary)]">
            {filtered.length === 0 ? (
              <p className="p-4 text-sm text-[var(--color-text-tertiary)] text-center">
                No published posts found.
              </p>
            ) : (
              filtered.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() =>
                    setSelectedPost((prev) => (prev === p.id ? null : p.id))
                  }
                  className={`w-full text-left px-4 py-3 border-b border-[var(--color-border-secondary)] transition-colors ${
                    selectedPost === p.id
                      ? "bg-indigo-50 border-indigo-100"
                      : "hover:bg-[var(--color-surface-hover)]"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                        PLATFORM_STYLES[p.platform] ?? "bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)]"
                      }`}
                    >
                      {p.platform}
                    </span>
                    <span className="text-xs text-[var(--color-text-tertiary)]">
                      {fmtDate(p.published_at)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-[var(--color-text-primary)] line-clamp-2">
                    {p.caption ? p.caption.slice(0, 120) : "(no caption)"}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>

        {/* External URL */}
        <Field label="Or External URL">
          <input
            type="url"
            value={externalUrl}
            onChange={(e) => setExternalUrl(e.target.value)}
            className="w-full rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            placeholder="https://..."
          />
        </Field>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onLink(selectedPost, externalUrl)}
            disabled={saving || (!selectedPost && !externalUrl.trim())}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "Linking..." : "Link"}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

// ── Shared primitives ─────────────────────────────────────────
function Overlay({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[10vh] overflow-y-auto">
      <div
        className="w-full max-w-xl rounded-2xl bg-[var(--color-bg-primary)] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
      {/* backdrop click closes */}
      <div className="fixed inset-0 -z-10" onClick={onClose} />
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
        {label}
      </span>
      {children}
    </label>
  );
}
