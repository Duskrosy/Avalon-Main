"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { format, parseISO } from "date-fns";
import { SmmSettingsPanel } from "./smm-settings-panel";

type Platform = { id: string; platform: string; page_name: string | null; is_active: boolean };
type Group = { id: string; name: string; weekly_target: number; smm_group_platforms: Platform[] };
type Post = {
  id: string;
  group_id: string;
  platform: string;
  post_type: string;
  status: string;
  caption: string | null;
  scheduled_at: string | null;
  published_at: string | null;
  linked_task_id: string | null;
  created_by_profile: { first_name: string; last_name: string } | null;
};

type TopPost = {
  id: string;
  post_external_id: string;
  post_url: string | null;
  thumbnail_url: string | null;
  caption_preview: string | null;
  post_type: string | null;
  published_at: string | null;
  impressions: number | null;
  reach: number | null;
  engagements: number | null;
  video_plays: number | null;
  metric_date: string;
};

const PLATFORM_COLORS: Record<string, string> = {
  facebook:  "bg-[var(--color-accent-light)] text-blue-800",
  instagram: "bg-pink-100 text-pink-800",
  tiktok:    "bg-[var(--color-text-primary)] text-white",
  youtube:   "bg-[var(--color-error-light)] text-red-800",
};

const PLATFORM_EMOJIS: Record<string, string> = {
  facebook:  "📘",
  instagram: "📸",
  tiktok:    "🎵",
  youtube:   "▶️",
};

const STATUS_COLORS: Record<string, string> = {
  idea:      "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]",
  draft:     "bg-[var(--color-warning-light)] text-[var(--color-warning-text)]",
  scheduled: "bg-[var(--color-accent-light)] text-[var(--color-accent)]",
  published: "bg-[var(--color-success-light)] text-[var(--color-success)]",
  backlog:   "bg-purple-100 text-purple-700",
};

const STATUSES = ["idea", "draft", "scheduled", "published", "backlog"] as const;
const POST_TYPES = ["organic", "ad", "trad_marketing", "offline_event"] as const;
const PLATFORMS = ["facebook", "instagram", "tiktok", "youtube"] as const;

function fmtK(n: number | null | undefined): string {
  if (n == null) return "—";
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function PostModal({
  groups,
  onSave,
  onClose,
  initial,
}: {
  groups: Group[];
  onSave: (data: Partial<Post>) => void;
  onClose: () => void;
  initial?: Post;
}) {
  const [form, setForm] = useState({
    group_id: initial?.group_id ?? groups[0]?.id ?? "",
    platform: initial?.platform ?? "facebook",
    post_type: initial?.post_type ?? "organic",
    status: initial?.status ?? "idea",
    caption: initial?.caption ?? "",
    scheduled_at: initial?.scheduled_at ? initial.scheduled_at.slice(0, 16) : "",
  });

  const selectedGroup = groups.find((g) => g.id === form.group_id);
  const activePlatforms = selectedGroup?.smm_group_platforms.filter((p) => p.is_active) ?? [];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--color-bg-primary)] rounded-2xl p-6 w-full max-w-lg">
        <h2 className="text-base font-semibold text-[var(--color-text-primary)] mb-4">
          {initial ? "Edit Post" : "New Post"}
        </h2>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Group</label>
              <select
                value={form.group_id}
                onChange={(e) => setForm((f) => ({ ...f, group_id: e.target.value, platform: "facebook" }))}
                className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              >
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Platform</label>
              <select
                value={form.platform}
                onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value }))}
                className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              >
                {(activePlatforms.length > 0 ? activePlatforms.map((p) => p.platform) : [...PLATFORMS]).map((p) => (
                  <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Post type</label>
              <select
                value={form.post_type}
                onChange={(e) => setForm((f) => ({ ...f, post_type: e.target.value }))}
                className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              >
                {POST_TYPES.map((t) => (
                  <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Scheduled date/time</label>
            <input
              type="datetime-local"
              value={form.scheduled_at}
              onChange={(e) => setForm((f) => ({ ...f, scheduled_at: e.target.value }))}
              className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Caption</label>
            <textarea
              rows={4}
              placeholder="Post caption…"
              value={form.caption}
              onChange={(e) => setForm((f) => ({ ...f, caption: e.target.value }))}
              className="w-full border border-[var(--color-border-primary)] rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            />
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="text-sm px-4 py-2 border border-[var(--color-border-primary)] rounded-lg hover:bg-[var(--color-surface-hover)]">
            Cancel
          </button>
          <button
            onClick={() => onSave({
              ...form,
              caption: form.caption || null,
              scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null,
            })}
            className="text-sm px-4 py-2 bg-[var(--color-text-primary)] text-white rounded-lg hover:bg-[var(--color-text-secondary)] ml-auto"
          >
            {initial ? "Save changes" : "Create post"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ContentManager({
  initialGroups,
  initialPosts,
  canManage,
}: {
  initialGroups: Group[];
  initialPosts: Post[];
  canManage: boolean;
}) {
  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const [groups, setGroups] = useState<Group[]>(initialGroups);
  const [activeGroup, setActiveGroup] = useState<string>(groups[0]?.id ?? "");
  const [activePlatform, setActivePlatform] = useState<string>("all");
  const [activeStatus, setActiveStatus] = useState<string>("all");
  const [modal, setModal] = useState<Post | "new" | null>(null);
  const [saving, setSaving] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"planned" | "published">("planned");
  const [livePostsMap, setLivePostsMap] = useState<Record<string, TopPost[]>>({});
  const [liveLoading, setLiveLoading] = useState(false);

  const group = groups.find((g) => g.id === activeGroup);
  const activePlatforms = group?.smm_group_platforms.filter((p) => p.is_active) ?? [];

  const filteredPosts = useMemo(() => {
    return posts.filter((p) => {
      if (p.group_id !== activeGroup) return false;
      if (activePlatform !== "all" && p.platform !== activePlatform) return false;
      if (activeStatus !== "all" && p.status !== activeStatus) return false;
      return true;
    });
  }, [posts, activeGroup, activePlatform, activeStatus]);

  const fetchLivePosts = useCallback(async () => {
    if (!group) return;
    const platforms = group.smm_group_platforms.filter((p) => p.is_active);
    const toFetch = activePlatform !== "all"
      ? platforms.filter((p) => p.platform === activePlatform)
      : platforms;

    if (toFetch.length === 0) return;

    setLiveLoading(true);
    try {
      const results = await Promise.all(
        toFetch.map(async (p) => {
          const res = await fetch(
            `/api/smm/top-posts?platform_id=${p.id}&from=2020-01-01&to=2099-01-01`
          );
          if (!res.ok) return { platformId: p.id, posts: [] as TopPost[] };
          const data = await res.json();
          const posts: TopPost[] = Array.isArray(data) ? data : (data.posts ?? []);
          return { platformId: p.id, posts };
        })
      );
      const map: Record<string, TopPost[]> = {};
      for (const { platformId, posts } of results) {
        map[platformId] = posts;
      }
      setLivePostsMap(map);
    } finally {
      setLiveLoading(false);
    }
  }, [group, activePlatform]);

  useEffect(() => {
    if (viewMode === "published") {
      fetchLivePosts();
    }
  }, [viewMode, activeGroup, activePlatform, fetchLivePosts]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncMsg(null);

    const platformsToSync =
      activePlatform === "all"
        ? activePlatforms
        : activePlatforms.filter((p) => p.platform === activePlatform);

    const results = await Promise.allSettled(
      platformsToSync.map(async (platform) => {
        const res = await fetch("/api/smm/social-sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ platform_id: platform.id }),
        });
        const json = await res.json().catch(() => ({}));
        return { platform: platform.platform, ...json };
      })
    );

    // Collect any errors from the sync responses
    const errors: string[] = [];
    for (const r of results) {
      if (r.status === "rejected") {
        errors.push(String(r.reason));
      } else if (!r.value.ok) {
        errors.push(`${r.value.platform}: ${r.value.error ?? "unknown error"}`);
      } else if (r.value.post_sync_error) {
        errors.push(`${r.value.platform} posts: ${r.value.post_sync_error}`);
      }
    }

    await fetchLivePosts();
    setSyncing(false);

    if (errors.length > 0) {
      setSyncMsg(`⚠ ${errors[0]}`);
    } else {
      setSyncMsg("✓ Synced");
    }
    setTimeout(() => setSyncMsg(null), 6000);
  };

  const handleSave = async (data: Partial<Post>) => {
    setSaving(true);
    if (modal && modal !== "new" && modal.id) {
      // Update
      const res = await fetch("/api/smm/posts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: modal.id, ...data }),
      });
      if (res.ok) {
        const updated = await res.json();
        setPosts((ps) => ps.map((p) => p.id === updated.id ? updated : p));
      }
    } else {
      // Create
      const res = await fetch("/api/smm/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const created = await res.json();
        setPosts((ps) => [created, ...ps]);
      }
    }
    setSaving(false);
    setModal(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this post?")) return;
    await fetch("/api/smm/posts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setPosts((ps) => ps.filter((p) => p.id !== id));
  };

  // Build flat list of published posts for the grid
  const livePosts: Array<TopPost & { _platformId: string; _platformName: string }> = useMemo(() => {
    if (!group) return [];
    const platforms = group.smm_group_platforms.filter((p) => p.is_active);
    const toShow = activePlatform !== "all"
      ? platforms.filter((p) => p.platform === activePlatform)
      : platforms;

    const flat: Array<TopPost & { _platformId: string; _platformName: string }> = [];
    for (const plat of toShow) {
      const posts = livePostsMap[plat.id] ?? [];
      for (const post of posts) {
        flat.push({ ...post, _platformId: plat.id, _platformName: plat.platform });
      }
    }
    flat.sort((a, b) => {
      const da = a.published_at ? new Date(a.published_at).getTime() : 0;
      const db = b.published_at ? new Date(b.published_at).getTime() : 0;
      return db - da;
    });
    return flat;
  }, [livePostsMap, group, activePlatform]);

  return (
    <div className="space-y-4">
      {/* Settings panel mode */}
      {showSettings ? (
        <SmmSettingsPanel onClose={() => setShowSettings(false)} />
      ) : (
      <>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">Content</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">SMM content management</p>
        </div>

        {/* View mode toggle */}
        <div className="flex items-center rounded-lg border border-[var(--color-border-primary)] overflow-hidden">
          <button
            onClick={() => setViewMode("planned")}
            className={`text-sm px-4 py-2 transition-colors ${
              viewMode === "planned"
                ? "bg-[var(--color-text-primary)] text-white"
                : "bg-[var(--color-bg-primary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
            }`}
          >
            Planned
          </button>
          <button
            onClick={() => setViewMode("published")}
            className={`text-sm px-4 py-2 transition-colors border-l border-[var(--color-border-primary)] ${
              viewMode === "published"
                ? "bg-[var(--color-text-primary)] text-white"
                : "bg-[var(--color-bg-primary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
            }`}
          >
            Published
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettings(true)}
            className="text-sm px-3 py-2 border border-[var(--color-border-primary)] rounded-lg hover:bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)]"
            title="Manage Groups & Platforms"
          >
            ⚙ Groups
          </button>
          {viewMode === "published" && (
            <div className="flex items-center gap-2">
              {syncMsg && !syncing && (
                <span className={`text-xs ${syncMsg.startsWith("⚠") ? "text-[var(--color-warning)]" : "text-emerald-600"}`}>
                  {syncMsg}
                </span>
              )}
              <button
                onClick={handleSync}
                disabled={syncing}
                className="text-sm px-3 py-2 border border-[var(--color-border-primary)] rounded-lg hover:bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)] disabled:opacity-50 transition-colors"
              >
                {syncing ? "Syncing…" : "↻ Sync"}
              </button>
            </div>
          )}
          {viewMode === "planned" && (
            <button
              onClick={() => setModal("new")}
              className="text-sm px-4 py-2 bg-[var(--color-text-primary)] text-white rounded-lg hover:bg-[var(--color-text-secondary)]"
            >
              + New Post
            </button>
          )}
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-2xl p-12 text-center">
          <p className="text-sm text-[var(--color-text-secondary)]">No SMM groups configured yet.</p>
          <a href="/ad-ops/settings" className="text-sm text-[var(--color-accent)] hover:text-blue-800 mt-2 inline-block">
            Go to Settings →
          </a>
        </div>
      ) : (
        <>
          {/* Group tabs */}
          <div className="flex items-center gap-1 border-b border-[var(--color-border-primary)]">
            {groups.map((g) => (
              <button
                key={g.id}
                onClick={() => { setActiveGroup(g.id); setActivePlatform("all"); }}
                className={`text-sm px-4 py-2 font-medium border-b-2 transition-colors ${
                  activeGroup === g.id
                    ? "border-gray-900 text-[var(--color-text-primary)]"
                    : "border-transparent text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
                }`}
              >
                {g.name}
              </button>
            ))}
          </div>

          {/* Platform sub-tabs */}
          {activePlatforms.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActivePlatform("all")}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  activePlatform === "all"
                    ? "bg-[var(--color-text-primary)] text-white border-transparent"
                    : "border-[var(--color-border-primary)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                }`}
              >
                All platforms
              </button>
              {activePlatforms.map((p) => (
                <button
                  key={p.platform}
                  onClick={() => setActivePlatform(p.platform)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    activePlatform === p.platform
                      ? "bg-[var(--color-text-primary)] text-white border-transparent"
                      : "border-[var(--color-border-primary)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                  }`}
                >
                  {p.platform.charAt(0).toUpperCase() + p.platform.slice(1)}
                  {p.page_name && <span className="ml-1 opacity-60 text-[10px]">{p.page_name}</span>}
                </button>
              ))}
            </div>
          )}

          {viewMode === "planned" ? (
            <>
              {/* Status filter */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-[var(--color-text-tertiary)]">Status:</span>
                {["all", ...STATUSES].map((s) => (
                  <button
                    key={s}
                    onClick={() => setActiveStatus(s)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      activeStatus === s
                        ? "bg-[var(--color-text-primary)] text-white border-transparent"
                        : "border-[var(--color-border-primary)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                    }`}
                  >
                    {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
                <span className="ml-auto text-xs text-[var(--color-text-tertiary)]">{filteredPosts.length} post{filteredPosts.length !== 1 ? "s" : ""}</span>
              </div>

              {/* Posts grid */}
              {filteredPosts.length === 0 ? (
                <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-2xl p-12 text-center">
                  <p className="text-sm text-[var(--color-text-tertiary)]">No posts found. Create one to get started.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredPosts.map((post) => (
                    <div
                      key={post.id}
                      className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] p-4 flex flex-col gap-3 hover:shadow-[var(--shadow-sm)] transition-shadow"
                    >
                      {/* Platform + status badges */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PLATFORM_COLORS[post.platform] ?? "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]"}`}>
                          {post.platform.charAt(0).toUpperCase() + post.platform.slice(1)}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[post.status] ?? "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]"}`}>
                          {post.status.charAt(0).toUpperCase() + post.status.slice(1)}
                        </span>
                        <span className="text-xs text-[var(--color-text-tertiary)] ml-auto">
                          {post.post_type.replace(/_/g, " ")}
                        </span>
                      </div>

                      {/* Caption */}
                      <p className="text-sm text-[var(--color-text-primary)] line-clamp-3 flex-1">
                        {post.caption || <span className="text-[var(--color-text-tertiary)] italic">No caption</span>}
                      </p>

                      {/* Scheduled date */}
                      {post.scheduled_at && (
                        <p className="text-xs text-[var(--color-text-tertiary)]">
                          📅 {format(new Date(post.scheduled_at), "d MMM yyyy · HH:mm")}
                        </p>
                      )}

                      {/* Author */}
                      {post.created_by_profile && (
                        <p className="text-xs text-[var(--color-text-tertiary)]">
                          {post.created_by_profile.first_name} {post.created_by_profile.last_name}
                        </p>
                      )}

                      {/* Actions */}
                      <div className="flex items-center gap-2 pt-1 border-t border-[var(--color-border-secondary)]">
                        <button
                          onClick={() => setModal(post)}
                          className="text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(post.id)}
                          className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-error)] ml-auto"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            /* Published view */
            <>
              {liveLoading ? (
                <p className="text-sm text-[var(--color-text-tertiary)] text-center py-8">Loading…</p>
              ) : livePosts.length === 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  <p className="text-sm text-[var(--color-text-tertiary)] col-span-full text-center py-8">
                    No published posts synced yet. Hit the ↻ Sync button above to pull from connected platforms.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {livePosts.map((post) => {
                    const platformColorClass = PLATFORM_COLORS[post._platformName] ?? "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]";
                    const platformEmoji = PLATFORM_EMOJIS[post._platformName] ?? "🌐";
                    const postTypeLabel = post.post_type
                      ? post.post_type.charAt(0).toUpperCase() + post.post_type.slice(1)
                      : null;
                    const impressionVal =
                      post.impressions && post.impressions > 0 ? post.impressions : post.reach;

                    return (
                      <div
                        key={`${post._platformId}-${post.id}`}
                        className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] overflow-hidden flex flex-col hover:shadow-[var(--shadow-sm)] transition-shadow"
                      >
                        {/* Thumbnail */}
                        <div className="relative aspect-video bg-[var(--color-bg-tertiary)] flex items-center justify-center">
                          {post.thumbnail_url ? (
                            <img
                              src={post.thumbnail_url}
                              alt={post.caption_preview ?? "Post thumbnail"}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span className="text-2xl">{platformEmoji}</span>
                          )}

                          {/* Post type badge — top left */}
                          {postTypeLabel && (
                            <span className="absolute top-1.5 left-1.5 text-[10px] px-1.5 py-0.5 bg-black/60 text-white rounded-full">
                              {postTypeLabel}
                            </span>
                          )}

                          {/* Platform badge — top right */}
                          <span className={`absolute top-1.5 right-1.5 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${platformColorClass}`}>
                            {post._platformName.charAt(0).toUpperCase() + post._platformName.slice(1)}
                          </span>
                        </div>

                        {/* Card body */}
                        <div className="p-2.5 flex flex-col gap-1.5 flex-1">
                          {/* Caption */}
                          {post.caption_preview && (
                            <p className="text-xs text-[var(--color-text-primary)] line-clamp-2">{post.caption_preview}</p>
                          )}

                          {/* Date */}
                          {post.published_at && (
                            <p className="text-[10px] text-[var(--color-text-tertiary)]">
                              {format(parseISO(post.published_at), "d MMM yyyy")}
                            </p>
                          )}

                          {/* Metrics row */}
                          <div className="flex items-center gap-3 text-[10px] text-[var(--color-text-secondary)] flex-wrap">
                            <span>👁 {fmtK(impressionVal)}</span>
                            <span>❤️ {fmtK(post.engagements)}</span>
                            {post.video_plays != null && post.video_plays > 0 && (
                              <span>▶️ {fmtK(post.video_plays)}</span>
                            )}
                          </div>

                          {/* View link */}
                          {post.post_url && (
                            <div className="mt-auto pt-1 flex justify-end">
                              <a
                                href={post.post_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]"
                              >
                                View →
                              </a>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </>
      )}

      </>)}

      {/* Modal — available in both modes */}
      {modal !== null && (
        <PostModal
          groups={groups}
          initial={modal === "new" ? undefined : modal}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
      {saving && (
        <div className="fixed bottom-4 right-4 bg-[var(--color-text-primary)] text-white text-xs px-4 py-2 rounded-lg">
          Saving…
        </div>
      )}
    </div>
  );
}
