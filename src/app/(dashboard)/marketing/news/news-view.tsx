"use client";

import { useState, useEffect, useCallback } from "react";
import { SourceManagerModal } from "./source-manager-modal";

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
  shoes:   "bg-[var(--color-warning-light)] text-[var(--color-warning-text)]",
  height:  "bg-[var(--color-success-light)] text-[var(--color-success)]",
  viral_ph:"bg-rose-100 text-rose-700",
  general: "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]",
};

const CATEGORY_TABS = [
  { value: "",        label: "All" },
  { value: "viral_ph",label: "Viral PH" },
  { value: "shoes",   label: "Shoes" },
  { value: "height",  label: "Height Enhancement" },
  { value: "general", label: "General" },
];

const LIMIT = 20;

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
  const [showManager, setShowManager]   = useState(false);
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

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">News Feed</h1>
          {lastFetched && (
            <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
              Last fetched: {formatDate(lastFetched)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowManager(true)}
            className="text-sm px-3 py-2 rounded-lg border border-[var(--color-border-primary)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-primary)] transition-colors"
          >
            Manage Sources
          </button>
          <button
            onClick={handleRefresh}
            disabled={fetching}
            className="text-sm px-4 py-2 rounded-lg bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] hover:bg-[var(--color-text-secondary)] transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            <span className={fetching ? "animate-spin inline-block" : ""}>↻</span>
            {fetching ? "Fetching…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* Refresh result banner */}
      {refreshResult && (
        <div className="mb-4 px-4 py-2.5 bg-[var(--color-success-light)] border border-green-200 rounded-lg text-sm text-[var(--color-success)] flex items-center justify-between">
          <span>{refreshResult}</span>
          <button onClick={() => setRefreshResult(null)} className="text-green-500 hover:text-[var(--color-success)] ml-4">✕</button>
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
                ? "bg-[var(--color-text-primary)] text-[var(--color-text-inverted)] border-[var(--color-text-primary)]"
                : "bg-[var(--color-bg-primary)] text-[var(--color-text-secondary)] border-[var(--color-border-primary)] hover:border-[var(--color-border-primary)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* News list */}
      {loading ? (
        <div className="text-center py-16 text-[var(--color-text-tertiary)] text-sm">Loading…</div>
      ) : items.length === 0 ? (
        <div className="bg-[var(--color-bg-secondary)] rounded-[var(--radius-lg)] p-12 text-center">
          <p className="text-2xl mb-3">📰</p>
          <p className="text-sm text-[var(--color-text-secondary)]">
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
            className="text-sm px-5 py-2 rounded-lg border border-[var(--color-border-primary)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-primary)] transition-colors"
          >
            Load more
          </button>
        </div>
      )}

      <SourceManagerModal
        open={showManager}
        onClose={() => setShowManager(false)}
        onChanged={() => { setPage(1); fetchItems(category, 1, false); }}
        canEdit={canManage}
      />
    </div>
  );
}

// ── News Card ────────────────────────────────────────────────────────

function NewsCard({ item }: { item: NewsItem }) {
  const categoryLabel = CATEGORY_LABELS[item.source.category] ?? item.source.category;
  const categoryBadge = CATEGORY_BADGE[item.source.category] ?? "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]";

  return (
    <div className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg)] overflow-hidden hover:border-[var(--color-border-primary)] transition-colors">
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
              className="w-20 h-20 object-cover rounded-lg bg-[var(--color-bg-tertiary)]"
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
            className="font-semibold text-[var(--color-text-primary)] hover:text-[var(--color-text-secondary)] transition-colors text-sm leading-snug line-clamp-2"
          >
            {item.title}
          </a>

          {item.summary && (
            <p className="text-xs text-[var(--color-text-secondary)] mt-1 line-clamp-2 leading-relaxed">
              {item.summary}
            </p>
          )}

          {/* Meta row */}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="text-xs text-[var(--color-text-tertiary)]">{item.source.name}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${categoryBadge}`}>
              {categoryLabel}
            </span>
            {item.published_at && (
              <span className="text-xs text-[var(--color-text-tertiary)]">{formatDate(item.published_at)}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
