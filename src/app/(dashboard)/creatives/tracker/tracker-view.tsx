"use client";

import { useState, useMemo, useCallback } from "react";
import { format, parseISO } from "date-fns";
import { useToast, Toast } from "@/components/ui/toast";

// ── Types ─────────────────────────────────────────────────────
type Profile = {
  id: string;
  first_name: string;
  last_name: string;
  department_id?: string | null;
};

type ContentItem = {
  id: string;
  title: string;
  content_type: string;
  channel_type: string;
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
  linked_card_id: string | null;
  linked_post_id: string | null;
  linked_ad_asset_id: string | null;
  linked_external_url: string | null;
  linked_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
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

type Props = {
  items: ContentItem[];
  profiles: Profile[];
  posts: SmmPost[];
  currentUserId: string;
  isManager: boolean;
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

const CONTENT_TYPES = [
  "video",
  "still",
  "ad_creative",
  "organic",
  "offline",
  "other",
] as const;

const CHANNEL_TYPES = ["conversion", "messenger", "organic", "other"] as const;

const FUNNEL_STAGES = ["TOF", "MOF", "BOF"] as const;

const PLATFORM_STYLES: Record<string, string> = {
  facebook: "bg-[var(--color-accent-light)] text-[var(--color-accent)]",
  instagram: "bg-pink-100 text-pink-800",
  tiktok: "bg-[var(--color-text-primary)] text-white",
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

// ── Component ─────────────────────────────────────────────────
export default function TrackerView({
  items: initialItems,
  profiles,
  posts,
  currentUserId,
  isManager,
}: Props) {
  const { toast, setToast } = useToast();
  const [items, setItems] = useState<ContentItem[]>(initialItems);
  const [tab, setTab] = useState<"planned" | "published">("planned");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [editItem, setEditItem] = useState<ContentItem | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [linkItem, setLinkItem] = useState<ContentItem | null>(null);
  const [saving, setSaving] = useState(false);

  // ── Filtered items ────────────────────────────────────────
  const planned = useMemo(
    () =>
      items
        .filter((i) => PLANNED_STATUSES.includes(i.status))
        .filter(
          (i) =>
            !search ||
            i.title.toLowerCase().includes(search.toLowerCase()) ||
            (i.campaign_label ?? "").toLowerCase().includes(search.toLowerCase())
        )
        .filter((i) => !statusFilter || i.status === statusFilter),
    [items, search, statusFilter]
  );

  const published = useMemo(
    () =>
      items
        .filter((i) => PUBLISHED_STATUSES.includes(i.status))
        .filter(
          (i) =>
            !search ||
            i.title.toLowerCase().includes(search.toLowerCase()) ||
            (i.campaign_label ?? "").toLowerCase().includes(search.toLowerCase())
        ),
    [items, search]
  );

  const active = tab === "planned" ? planned : published;

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
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="text"
          placeholder="Search title or campaign..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400 sm:w-64"
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
      {active.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-[var(--color-border-secondary)] bg-[var(--color-bg-primary)] p-12 text-center text-sm text-[var(--color-text-tertiary)]">
          No items found.
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-border-secondary)] bg-[var(--color-bg-primary)]">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border-secondary)] text-left text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Channel</th>
                  <th className="px-4 py-3">Funnel</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Campaign</th>
                  <th className="px-4 py-3">Assigned</th>
                  <th className="px-4 py-3">Planned Week</th>
                  {tab === "published" && (
                    <th className="px-4 py-3">Linked</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {active.map((item, idx) => (
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
                      {fmtLabel(item.content_type)}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                      {fmtLabel(item.channel_type)}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                      {item.funnel_stage ?? "-"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusDropdown
                        current={item.status}
                        onChange={(s) => {
                          // prevent row click
                          changeStatus(item.id, s);
                        }}
                      />
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text-secondary)] max-w-[140px] truncate">
                      {item.campaign_label ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                      {profileName(item.assigned_profile)}
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {active.map((item) => (
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
                  <span>{fmtLabel(item.channel_type)}</span>
                  {item.funnel_stage && <span>{item.funnel_stage}</span>}
                  {item.campaign_label && (
                    <span className="text-indigo-600">{item.campaign_label}</span>
                  )}
                </div>
                <div className="flex items-center justify-between text-xs text-[var(--color-text-tertiary)]">
                  <span>{profileName(item.assigned_profile)}</span>
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
              </div>
            ))}
          </div>
        </>
      )}

      {/* Create Modal */}
      {showCreate && (
        <ItemModal
          profiles={profiles}
          onSave={(data) => handleSave(data, false)}
          onClose={() => setShowCreate(false)}
          saving={saving}
        />
      )}

      {/* Edit Modal */}
      {editItem && (
        <ItemModal
          profiles={profiles}
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
      <Toast toast={toast} onDismiss={() => setToast(null)} />
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
  initial,
  onSave,
  onClose,
  saving,
}: {
  profiles: Profile[];
  initial?: ContentItem;
  onSave: (data: Record<string, unknown>) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [contentType, setContentType] = useState(initial?.content_type ?? "video");
  const [channelType, setChannelType] = useState(initial?.channel_type ?? "conversion");
  const [funnelStage, setFunnelStage] = useState(initial?.funnel_stage ?? "");
  const [creativeAngle, setCreativeAngle] = useState(initial?.creative_angle ?? "");
  const [product, setProduct] = useState(initial?.product_or_collection ?? "");
  const [campaign, setCampaign] = useState(initial?.campaign_label ?? "");
  const [promoCode, setPromoCode] = useState(initial?.promo_code ?? "");
  const [transferLink, setTransferLink] = useState(initial?.transfer_link ?? "");
  const [plannedWeek, setPlannedWeek] = useState(initial?.planned_week_start ?? "");
  const [dateSubmitted, setDateSubmitted] = useState(initial?.date_submitted ?? "");
  const [assignedTo, setAssignedTo] = useState(initial?.assigned_to ?? "");
  const [status, setStatus] = useState(initial?.status ?? "idea");

  const isEdit = !!initial;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({
      title: title.trim(),
      content_type: contentType,
      channel_type: channelType,
      funnel_stage: funnelStage || null,
      creative_angle: creativeAngle || null,
      product_or_collection: product || null,
      campaign_label: campaign || null,
      promo_code: promoCode || null,
      transfer_link: transferLink || null,
      planned_week_start: plannedWeek || null,
      date_submitted: dateSubmitted || null,
      assigned_to: assignedTo || null,
      status,
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
              onChange={(e) => setContentType(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            >
              {CONTENT_TYPES.map((t) => (
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

          <Field label="Transfer Link">
            <input
              type="text"
              value={transferLink}
              onChange={(e) => setTransferLink(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              placeholder="https://..."
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

          <Field label="Assigned To">
            <select
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            >
              <option value="">Unassigned</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.first_name} {p.last_name}
                </option>
              ))}
            </select>
          </Field>
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
