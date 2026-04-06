"use client";

import { useState, useMemo } from "react";
import { format } from "date-fns";
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

const PLATFORM_COLORS: Record<string, string> = {
  facebook:  "bg-blue-100 text-blue-800",
  instagram: "bg-pink-100 text-pink-800",
  tiktok:    "bg-gray-900 text-white",
  youtube:   "bg-red-100 text-red-800",
};

const STATUS_COLORS: Record<string, string> = {
  idea:      "bg-gray-100 text-gray-600",
  draft:     "bg-amber-100 text-amber-700",
  scheduled: "bg-blue-100 text-blue-700",
  published: "bg-green-100 text-green-700",
  backlog:   "bg-purple-100 text-purple-700",
};

const STATUSES = ["idea", "draft", "scheduled", "published", "backlog"] as const;
const POST_TYPES = ["organic", "ad", "trad_marketing", "offline_event"] as const;
const PLATFORMS = ["facebook", "instagram", "tiktok", "youtube"] as const;

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
      <div className="bg-white rounded-2xl p-6 w-full max-w-lg">
        <h2 className="text-base font-semibold text-gray-900 mb-4">
          {initial ? "Edit Post" : "New Post"}
        </h2>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Group</label>
              <select
                value={form.group_id}
                onChange={(e) => setForm((f) => ({ ...f, group_id: e.target.value, platform: "facebook" }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              >
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Platform</label>
              <select
                value={form.platform}
                onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              >
                {(activePlatforms.length > 0 ? activePlatforms.map((p) => p.platform) : [...PLATFORMS]).map((p) => (
                  <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Post type</label>
              <select
                value={form.post_type}
                onChange={(e) => setForm((f) => ({ ...f, post_type: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              >
                {POST_TYPES.map((t) => (
                  <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Scheduled date/time</label>
            <input
              type="datetime-local"
              value={form.scheduled_at}
              onChange={(e) => setForm((f) => ({ ...f, scheduled_at: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Caption</label>
            <textarea
              rows={4}
              placeholder="Post caption…"
              value={form.caption}
              onChange={(e) => setForm((f) => ({ ...f, caption: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="text-sm px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={() => onSave({
              ...form,
              caption: form.caption || null,
              scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null,
            })}
            className="text-sm px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-700 ml-auto"
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

  return (
    <div className="space-y-4">
      {/* Settings panel mode */}
      {showSettings ? (
        <SmmSettingsPanel onClose={() => setShowSettings(false)} />
      ) : (
      <>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Content</h1>
          <p className="text-sm text-gray-500 mt-1">SMM content management</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettings(true)}
            className="text-sm px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-500"
            title="Manage Groups & Platforms"
          >
            ⚙ Groups
          </button>
          <button
            onClick={() => setModal("new")}
            className="text-sm px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-700"
          >
            + New Post
          </button>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center">
          <p className="text-sm text-gray-500">No SMM groups configured yet.</p>
          <a href="/ad-ops/settings" className="text-sm text-blue-600 hover:text-blue-800 mt-2 inline-block">
            Go to Settings →
          </a>
        </div>
      ) : (
        <>
          {/* Group tabs */}
          <div className="flex items-center gap-1 border-b border-gray-200">
            {groups.map((g) => (
              <button
                key={g.id}
                onClick={() => { setActiveGroup(g.id); setActivePlatform("all"); }}
                className={`text-sm px-4 py-2 font-medium border-b-2 transition-colors ${
                  activeGroup === g.id
                    ? "border-gray-900 text-gray-900"
                    : "border-transparent text-gray-400 hover:text-gray-600"
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
                    ? "bg-gray-900 text-white border-transparent"
                    : "border-gray-200 text-gray-500 hover:text-gray-700"
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
                      ? "bg-gray-900 text-white border-transparent"
                      : "border-gray-200 text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {p.platform.charAt(0).toUpperCase() + p.platform.slice(1)}
                  {p.page_name && <span className="ml-1 opacity-60 text-[10px]">{p.page_name}</span>}
                </button>
              ))}
            </div>
          )}

          {/* Status filter */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-400">Status:</span>
            {["all", ...STATUSES].map((s) => (
              <button
                key={s}
                onClick={() => setActiveStatus(s)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  activeStatus === s
                    ? "bg-gray-900 text-white border-transparent"
                    : "border-gray-200 text-gray-500 hover:text-gray-700"
                }`}
              >
                {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
            <span className="ml-auto text-xs text-gray-400">{filteredPosts.length} post{filteredPosts.length !== 1 ? "s" : ""}</span>
          </div>

          {/* Posts grid */}
          {filteredPosts.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center">
              <p className="text-sm text-gray-400">No posts found. Create one to get started.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredPosts.map((post) => (
                <div
                  key={post.id}
                  className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col gap-3 hover:shadow-sm transition-shadow"
                >
                  {/* Platform + status badges */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PLATFORM_COLORS[post.platform] ?? "bg-gray-100 text-gray-600"}`}>
                      {post.platform.charAt(0).toUpperCase() + post.platform.slice(1)}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[post.status] ?? "bg-gray-100 text-gray-600"}`}>
                      {post.status.charAt(0).toUpperCase() + post.status.slice(1)}
                    </span>
                    <span className="text-xs text-gray-400 ml-auto">
                      {post.post_type.replace(/_/g, " ")}
                    </span>
                  </div>

                  {/* Caption */}
                  <p className="text-sm text-gray-700 line-clamp-3 flex-1">
                    {post.caption || <span className="text-gray-300 italic">No caption</span>}
                  </p>

                  {/* Scheduled date */}
                  {post.scheduled_at && (
                    <p className="text-xs text-gray-400">
                      📅 {format(new Date(post.scheduled_at), "d MMM yyyy · HH:mm")}
                    </p>
                  )}

                  {/* Author */}
                  {post.created_by_profile && (
                    <p className="text-xs text-gray-400">
                      {post.created_by_profile.first_name} {post.created_by_profile.last_name}
                    </p>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-1 border-t border-gray-50">
                    <button
                      onClick={() => setModal(post)}
                      className="text-xs text-gray-500 hover:text-gray-900"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(post.id)}
                      className="text-xs text-gray-300 hover:text-red-500 ml-auto"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
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
        <div className="fixed bottom-4 right-4 bg-gray-900 text-white text-xs px-4 py-2 rounded-lg">
          Saving…
        </div>
      )}
    </div>
  );
}
