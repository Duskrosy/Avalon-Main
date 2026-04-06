"use client";

import { useState, useEffect, useCallback } from "react";

type NewsItem = {
  id: string;
  title: string;
  url: string;
  summary: string | null;
  image_url: string | null;
  published_at: string | null;
  fetched_at: string;
  source: { name: string; category: string };
};

type Props = { canManage: boolean };

const CATEGORY_LABELS: Record<string, string> = {
  shoes:   "Shoes",
  height:  "Height Enhancement",
  viral_ph:"Viral PH",
  general: "General",
};

const CATEGORY_BADGE: Record<string, string> = {
  shoes:   "bg-amber-100 text-amber-800",
  height:  "bg-green-100 text-green-700",
  viral_ph:"bg-rose-100 text-rose-700",
  general: "bg-gray-100 text-gray-600",
};

const CATEGORY_TABS = [
  { value: "",        label: "All" },
  { value: "viral_ph",label: "Viral PH" },
  { value: "shoes",   label: "Shoes" },
  { value: "height",  label: "Height Enhancement" },
  { value: "general", label: "General" },
];

const LIMIT = 20;

type AddSourceForm = { name: string; url: string; category: string };
const EMPTY_SOURCE_FORM: AddSourceForm = { name: "", url: "", category: "general" };

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-PH", { day: "numeric", month: "short", year: "numeric" });
}

export function NewsView({ canManage }: Props) {
  const [items, setItems]               = useState<NewsItem[]>([]);
  const [category, setCategory]         = useState("");
  const [loading, setLoading]           = useState(true);
  const [fetching, setFetching]         = useState(false);
  const [page, setPage]                 = useState(1);
  const [hasMore, setHasMore]           = useState(false);
  const [showAddSource, setShowAddSource] = useState(false);
  const [addSourceForm, setAddSourceForm] = useState<AddSourceForm>(EMPTY_SOURCE_FORM);
  const [savingSource, setSavingSource] = useState(false);
  const [refreshResult, setRefreshResult] = useState<string | null>(null);
  const [lastFetched, setLastFetched]   = useState<string | null>(null);

  // ── Fetch news items ──────────────────────────────────────────────
  const fetchItems = useCallback(async (cat: string, pg: number, append: boolean) => {
    if (!append) setLoading(true);
    const params = new URLSearchParams({ page: String(pg), limit: String(LIMIT) });
    if (cat) params.set("category", cat);
    const res = await fetch(`/api/smm/news?${params}`);
    if (res.ok) {
      const json = await res.json();
      const newItems: NewsItem[] = json.items ?? [];
      setItems((prev) => append ? [...prev, ...newItems] : newItems);
      setHasMore(newItems.length === LIMIT);
      if (!append && newItems.length > 0) {
        setLastFetched(newItems[0].fetched_at);
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    setPage(1);
    fetchItems(category, 1, false);
  }, [category, fetchItems]);

  function handleLoadMore() {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchItems(category, nextPage, true);
  }

  // ── Refresh (POST /api/smm/news/fetch) ───────────────────────────
  async function handleRefresh() {
    setFetching(true);
    setRefreshResult(null);
    try {
      const res = await fetch("/api/smm/news/fetch", { method: "POST" });
      if (res.ok) {
        const json = await res.json();
        const msg = `Fetched ${json.fetched ?? 0} articles, ${json.new ?? 0} new`;
        setRefreshResult(msg);
      } else {
        setRefreshResult("Refresh failed. Try again.");
      }
    } catch {
      setRefreshResult("Network error during refresh.");
    }
    setFetching(false);
    // Refetch list
    setPage(1);
    fetchItems(category, 1, false);
  }

  // ── Add source ────────────────────────────────────────────────────
  async function handleAddSource(e: React.FormEvent) {
    e.preventDefault();
    if (!addSourceForm.name.trim() || !addSourceForm.url.trim()) return;
    setSavingSource(true);
    await fetch("/api/smm/news/sources", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(addSourceForm),
    });
    setSavingSource(false);
    setShowAddSource(false);
    setAddSourceForm(EMPTY_SOURCE_FORM);
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">News Feed</h1>
          {lastFetched && (
            <p className="text-xs text-gray-400 mt-0.5">
              Last fetched: {formatDate(lastFetched)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canManage && (
            <button
              onClick={() => setShowAddSource(true)}
              className="text-sm px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:border-gray-400 transition-colors"
            >
              + Add Source
            </button>
          )}
          <button
            onClick={handleRefresh}
            disabled={fetching}
            className="text-sm px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-700 transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            <span className={fetching ? "animate-spin inline-block" : ""}>↻</span>
            {fetching ? "Fetching…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* Refresh result banner */}
      {refreshResult && (
        <div className="mb-4 px-4 py-2.5 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 flex items-center justify-between">
          <span>{refreshResult}</span>
          <button onClick={() => setRefreshResult(null)} className="text-green-500 hover:text-green-700 ml-4">✕</button>
        </div>
      )}

      {/* Category filter tabs */}
      <div className="flex items-center gap-1 mb-5 flex-wrap">
        {CATEGORY_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => { if (category !== tab.value) { setCategory(tab.value); } }}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              category === tab.value
                ? "bg-gray-900 text-white border-gray-900"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* News list */}
      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Loading…</div>
      ) : items.length === 0 ? (
        <div className="bg-gray-50 rounded-xl p-12 text-center">
          <p className="text-2xl mb-3">📰</p>
          <p className="text-sm text-gray-500">
            No articles yet. Click <strong>Refresh</strong> to fetch the latest news.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <NewsCard key={item.id} item={item} />
          ))}
        </div>
      )}

      {/* Load more */}
      {!loading && hasMore && (
        <div className="mt-6 text-center">
          <button
            onClick={handleLoadMore}
            className="text-sm px-5 py-2 rounded-lg border border-gray-200 text-gray-600 hover:border-gray-400 transition-colors"
          >
            Load more
          </button>
        </div>
      )}

      {/* Add Source modal */}
      {showAddSource && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowAddSource(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Add RSS Source</h2>
            <form onSubmit={handleAddSource} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Source Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={addSourceForm.name}
                  onChange={(e) => setAddSourceForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Rappler"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  RSS URL <span className="text-red-400">*</span>
                </label>
                <input
                  type="url"
                  value={addSourceForm.url}
                  onChange={(e) => setAddSourceForm((f) => ({ ...f, url: e.target.value }))}
                  placeholder="https://example.com/feed"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
                <select
                  value={addSourceForm.category}
                  onChange={(e) => setAddSourceForm((f) => ({ ...f, category: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                >
                  {Object.entries(CATEGORY_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => { setShowAddSource(false); setAddSourceForm(EMPTY_SOURCE_FORM); }}
                  className="text-sm px-4 py-2 rounded-lg border border-gray-200 text-gray-600 hover:border-gray-400 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingSource || !addSourceForm.name.trim() || !addSourceForm.url.trim()}
                  className="text-sm px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-700 transition-colors disabled:opacity-50"
                >
                  {savingSource ? "Saving…" : "Add Source"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ── News Card ────────────────────────────────────────────────────────

function NewsCard({ item }: { item: NewsItem }) {
  const categoryLabel = CATEGORY_LABELS[item.source.category] ?? item.source.category;
  const categoryBadge = CATEGORY_BADGE[item.source.category] ?? "bg-gray-100 text-gray-600";

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:border-gray-300 transition-colors">
      <div className="flex gap-4 p-4">
        {/* Thumbnail */}
        {item.image_url && (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0"
            tabIndex={-1}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.image_url}
              alt=""
              className="w-20 h-20 object-cover rounded-lg bg-gray-100"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          </a>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-gray-900 hover:text-gray-600 transition-colors text-sm leading-snug line-clamp-2"
          >
            {item.title}
          </a>

          {item.summary && (
            <p className="text-xs text-gray-500 mt-1 line-clamp-2 leading-relaxed">
              {item.summary}
            </p>
          )}

          {/* Meta row */}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="text-xs text-gray-400">{item.source.name}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${categoryBadge}`}>
              {categoryLabel}
            </span>
            {item.published_at && (
              <span className="text-xs text-gray-400">{formatDate(item.published_at)}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
