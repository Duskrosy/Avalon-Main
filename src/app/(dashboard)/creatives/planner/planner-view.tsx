"use client";

import { useState, useMemo, useCallback } from "react";
import { format, parseISO, startOfWeek, endOfWeek, subWeeks, isWithinInterval } from "date-fns";
import { AssignPostModal, type GatherSelection, type SmmPost, type LiveAd } from "./gather-modal";
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
  linked_post_gathered_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  assignees?: Assignee[];
  assigned_profile: { id: string; first_name: string; last_name: string } | null;
  creator_profile: { id: string; first_name: string; last_name: string } | null;
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
  ads: LiveAd[];
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
export default function PlannerView({
  items: initialItems,
  profiles,
  posts,
  ads,
  platforms,
  currentUserId,
  isManager,
  currentDeptId,
}: Props) {
  const { toast, setToast } = useToast();
  const [items, setItems] = useState<ContentItem[]>(initialItems);
  const [tab, setTab] = useState<"planned" | "published">("planned");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [editItem, setEditItem] = useState<ContentItem | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [linkingItemId, setLinkingItemId] = useState<string | null>(null);

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

  // ── Delete item ───────────────────────────────────────────
  const handleDelete = useCallback(
    async (id: string) => {
      if (!confirm("Delete this item? This cannot be undone.")) return;
      setSaving(true);
      try {
        const res = await fetch(`/api/creatives/content-items?id=${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          setToast({ message: "Delete failed", type: "error" });
          return;
        }
        setItems((prev) => prev.filter((i) => i.id !== id));
        setEditItem(null);
        setToast({ message: "Item deleted", type: "success" });
      } finally {
        setSaving(false);
      }
    },
    [setToast]
  );

  // ── Assign post or ad ─────────────────────────────────────
  // Unified Gather picker (posted-content parity):
  //   organic post → linked_external_url = post_url
  //   Meta ad      → linked_ad_asset_id  = ad_assets.id
  //
  // assignOne applies a single selection to a target content item. Task 9
  // (multiselect): the Gather picker now returns an array of selections and
  // we fan out sequentially so a single failure surfaces cleanly.
  const assignOne = useCallback(
    async (selection: GatherSelection, itemId: string) => {
      const now = new Date().toISOString();
      const patch =
        selection.kind === "post"
          ? { id: itemId, linked_external_url: selection.url, linked_post_id: null, linked_ad_asset_id: null, transfer_link: null }
          : { id: itemId, linked_ad_asset_id: selection.assetId, linked_post_id: null, linked_external_url: null, transfer_link: null };
      setItems((prev) =>
        prev.map((i) =>
          i.id === itemId
            ? {
                ...i,
                linked_post_id: null,
                linked_external_url: selection.kind === "post" ? selection.url : null,
                linked_ad_asset_id: selection.kind === "ad" ? selection.assetId : null,
                linked_post_gathered_at: now,
                transfer_link: null,
              }
            : i
        )
      );
      const res = await fetch("/api/creatives/content-items", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        throw new Error(`assign failed (${res.status})`);
      }
    },
    []
  );

  const handleGatherConfirm = useCallback(
    async (selections: GatherSelection[]) => {
      if (!linkingItemId || selections.length === 0) return;
      const targetId = linkingItemId;
      const total = selections.length;
      let succeeded = 0;
      try {
        for (const sel of selections) {
          await assignOne(sel, targetId);
          succeeded += 1;
        }
        const hasPost = selections.some((s) => s.kind === "post");
        const hasAd = selections.some((s) => s.kind === "ad");
        const message =
          total === 1
            ? selections[0].kind === "post"
              ? "Post assigned"
              : "Ad assigned"
            : hasPost && hasAd
              ? `${total} items assigned`
              : hasAd
                ? `${total} ads assigned`
                : `${total} posts assigned`;
        setToast({ message, type: "success" });
      } catch {
        const failed = total - succeeded;
        setToast({
          message:
            succeeded === 0
              ? `Assign failed (${failed} of ${total})`
              : `${succeeded} of ${total} assigned, ${failed} failed`,
          type: "error",
        });
      } finally {
        setLinkingItemId(null);
      }
    },
    [linkingItemId, assignOne, setToast]
  );

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Creatives Planner</h1>
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
                          <th className="px-4 py-3">Post</th>
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
                            <td className="px-4 py-3">
                              <GatherAction
                                item={item}
                                onOpen={() => setLinkingItemId(item.id)}
                              />
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
                        <div className="pt-1">
                          <GatherAction
                            item={item}
                            onOpen={() => setLinkingItemId(item.id)}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>

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
          onDelete={() => handleDelete(editItem.id)}
          onClose={() => setEditItem(null)}
          saving={saving}
        />
      )}

      {linkingItemId && (
        <AssignPostModal
          posts={posts}
          ads={ads}
          onConfirm={handleGatherConfirm}
          onClose={() => setLinkingItemId(null)}
        />
      )}
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}

// ── Gather-post action (Planner row button / status pill) ─────
// Sprint G Phase 4 Task 9/10: combined "Gather post" trigger + post-status pill.
// Gated to scheduled/published stages — other stages have no reason to gather.
function GatherAction({
  item,
  onOpen,
}: {
  item: ContentItem;
  onOpen: () => void;
}) {
  const gatherable = item.status === "scheduled" || item.status === "published";
  const linked = !!(item.linked_post_id || item.linked_external_url || item.linked_ad_asset_id);
  if (linked) {
    const justLinked =
      !!item.linked_post_gathered_at &&
      Date.now() - new Date(item.linked_post_gathered_at).getTime() < 10_000;
    return (
      <div className="flex items-center gap-1.5">
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
            justLinked
              ? "bg-emerald-100 text-emerald-800 ring-2 ring-emerald-300 animate-pulse"
              : "bg-emerald-50 text-emerald-700"
          }`}
        >
          Gathered ✓
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] underline"
        >
          Change
        </button>
      </div>
    );
  }
  if (!gatherable) {
    return <span className="text-xs text-[var(--color-text-tertiary)]">—</span>;
  }
  return (
    <div className="flex items-center gap-1.5">
      <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
        Unconfirmed
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onOpen();
        }}
        className="text-xs px-2 py-1 rounded-[var(--radius-md)] bg-indigo-50 text-indigo-700 hover:bg-indigo-100 whitespace-nowrap"
      >
        Gather post
      </button>
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
  onDelete,
  onClose,
  saving,
}: {
  profiles: Profile[];
  currentDeptId: string | null;
  initial?: ContentItem;
  onSave: (data: Record<string, unknown>) => void;
  onDelete?: () => void;
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
      creative_type: creativeType || null,
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

        <div className="flex items-center justify-between gap-3 pt-2">
          <div>
            {isEdit && onDelete && (
              <button
                type="button"
                onClick={onDelete}
                disabled={saving}
                className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
              >
                Delete
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
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
        </div>
      </form>
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
