"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

export type PostedSource = "organic" | "ad";

export interface PostedRow {
  id: string;
  source: PostedSource;
  title: string;
  thumbnail_url: string | null;
  platform: string;
  group_name: string | null;
  published_at: string | null;
  impressions: number | null;
  reach: number | null;
  engagements: number | null;
  spend: number | null;
  conversions: number | null;
  messages: number | null;
  url: string | null;
  video_plays: number | null;
  avg_play_time_secs: number | null;
  caption_preview: string | null;
  post_type: string | null;
}

type Filter = "all" | "organic" | "ad";

function fmtNum(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function fmtCurrency(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `₱${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `₱${(n / 1_000).toFixed(1)}K`;
  return `₱${n.toFixed(0)}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function platformBadge(platform: string): string {
  const styles: Record<string, string> = {
    facebook:  "bg-blue-500/10 text-blue-400",
    instagram: "bg-pink-500/10 text-pink-400",
    tiktok:    "bg-white/10 text-white",
    youtube:   "bg-red-500/10 text-red-400",
    meta:      "bg-purple-500/10 text-purple-400",
  };
  return styles[platform.toLowerCase()] ?? "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]";
}

export function PostedContentView({ rows, windowSel }: { rows: PostedRow[]; windowSel: "recent" | "historical" }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [active, setActive] = useState<PostedRow | null>(null);

  const filtered = useMemo(() => {
    if (filter === "all") return rows;
    return rows.filter((r) => r.source === filter);
  }, [rows, filter]);

  const organicCount = rows.filter((r) => r.source === "organic").length;
  const adCount = rows.filter((r) => r.source === "ad").length;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">Posted Content</h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-0.5">
            Per-post performance across organic posts and ad deployments. Windows group by metric activity, not publish date.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          {/* Window tabs */}
          <div className="flex gap-1 p-1 rounded-lg bg-[var(--color-bg-secondary)] text-xs">
            {([
              { key: "recent",     label: "Active · last 30d" },
              { key: "historical", label: "Archive · 30–180d" },
            ] as const).map((t) => (
              <Link
                key={t.key}
                href={`/creatives/posted-content${t.key === "recent" ? "" : "?window=historical"}`}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                  windowSel === t.key
                    ? "bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] shadow-[var(--shadow-sm)]"
                    : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                }`}
              >
                {t.label}
              </Link>
            ))}
          </div>
          {/* Source filter */}
          <div className="flex gap-1 p-1 rounded-lg bg-[var(--color-bg-secondary)] text-xs">
            {([
              { key: "all",     label: `All ${rows.length}` },
              { key: "organic", label: `Organic ${organicCount}` },
              { key: "ad",      label: `Ads ${adCount}` },
            ] as const).map((t) => (
              <button
                key={t.key}
                onClick={() => setFilter(t.key)}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                  filter === t.key
                    ? "bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] shadow-[var(--shadow-sm)]"
                    : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-sm text-[var(--color-text-tertiary)] bg-[var(--color-bg-primary)] rounded-[var(--radius-lg)] border border-[var(--color-border-primary)]">
          No posts in this window.
        </div>
      ) : (
        <div className="bg-[var(--color-bg-primary)] rounded-[var(--radius-lg)] border border-[var(--color-border-primary)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-bg-secondary)] text-[10px] uppercase tracking-wide text-[var(--color-text-tertiary)]">
                <tr>
                  <th className="text-left px-4 py-2.5 font-semibold">Post</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Platform</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Type</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Published</th>
                  <th className="text-right px-3 py-2.5 font-semibold">Impressions</th>
                  <th className="text-right px-3 py-2.5 font-semibold">Reach</th>
                  <th className="text-right px-3 py-2.5 font-semibold">Engagements</th>
                  <th className="text-right px-3 py-2.5 font-semibold">Spend</th>
                  <th className="text-right px-3 py-2.5 font-semibold">Conversions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-primary)]">
                {filtered.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setActive(r)}
                    className="hover:bg-[var(--color-bg-secondary)]/40 cursor-pointer"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {r.thumbnail_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={r.thumbnail_url}
                            alt=""
                            onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
                            className="w-10 h-10 rounded object-cover shrink-0 bg-[var(--color-bg-tertiary)]"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded bg-[var(--color-bg-tertiary)] shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[var(--color-text-primary)] font-medium text-sm">
                            {r.url ? (
                              <a href={r.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                                {r.title}
                              </a>
                            ) : r.title}
                          </p>
                          {r.group_name && (
                            <p className="truncate text-[11px] text-[var(--color-text-tertiary)]">{r.group_name}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase ${platformBadge(r.platform)}`}>
                        {r.platform}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase ${
                        r.source === "ad"
                          ? "bg-amber-500/10 text-amber-400"
                          : "bg-emerald-500/10 text-emerald-400"
                      }`}>
                        {r.source}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-[var(--color-text-secondary)] whitespace-nowrap">
                      {fmtDate(r.published_at)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-[var(--color-text-primary)]">{fmtNum(r.impressions)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-[var(--color-text-primary)]">{fmtNum(r.reach)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-[var(--color-text-primary)]">{fmtNum(r.engagements)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-[var(--color-text-primary)]">{fmtCurrency(r.spend)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-[var(--color-text-primary)]">{fmtNum(r.conversions)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {active && <PostDetailModal row={active} onClose={() => setActive(null)} />}
    </div>
  );
}

// ─── Detail Modal ────────────────────────────────────────────────────────────

function PostDetailModal({ row, onClose }: { row: PostedRow; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--color-bg-primary)] rounded-[var(--radius-lg)] border border-[var(--color-border-primary)] max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-[var(--color-border-primary)] flex items-start gap-3">
          {row.thumbnail_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={row.thumbnail_url} alt="" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} className="w-20 h-20 rounded object-cover bg-[var(--color-bg-tertiary)] shrink-0" />
          ) : (
            <div className="w-20 h-20 rounded bg-[var(--color-bg-tertiary)] shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 mb-1">
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase ${platformBadge(row.platform)}`}>
                {row.platform}
              </span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase ${
                row.source === "ad"
                  ? "bg-amber-500/10 text-amber-400"
                  : "bg-emerald-500/10 text-emerald-400"
              }`}>
                {row.source}
              </span>
              {row.post_type && (
                <span className="text-[10px] uppercase text-[var(--color-text-tertiary)] font-medium">· {row.post_type}</span>
              )}
            </div>
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">{row.title}</h3>
            {row.group_name && (
              <p className="text-[11px] text-[var(--color-text-tertiary)] mt-0.5">{row.group_name}</p>
            )}
            <p className="text-[11px] text-[var(--color-text-tertiary)] mt-0.5">Published {fmtDate(row.published_at)}</p>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {row.caption_preview && (
          <div className="px-5 py-3 border-b border-[var(--color-border-primary)]">
            <p className="text-xs text-[var(--color-text-tertiary)] uppercase tracking-wide font-medium mb-1">Caption</p>
            <p className="text-sm text-[var(--color-text-primary)] whitespace-pre-wrap">{row.caption_preview}</p>
          </div>
        )}

        <div className="px-5 py-4">
          <p className="text-xs text-[var(--color-text-tertiary)] uppercase tracking-wide font-medium mb-2">Performance</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Metric label="Impressions" value={fmtNum(row.impressions)} />
            <Metric label="Reach"       value={fmtNum(row.reach)} />
            <Metric label="Engagements" value={fmtNum(row.engagements)} />
            {row.source === "ad" && <Metric label="Spend"       value={fmtCurrency(row.spend)} />}
            {row.source === "ad" && <Metric label="Conversions" value={fmtNum(row.conversions)} />}
            {row.source === "ad" && <Metric label="Messages"    value={fmtNum(row.messages)} />}
            {row.video_plays != null && <Metric label="Video plays" value={fmtNum(row.video_plays)} />}
            {row.avg_play_time_secs != null && <Metric label="Avg watch" value={`${row.avg_play_time_secs.toFixed(1)}s`} />}
          </div>
        </div>

        {row.url && (
          <div className="px-5 py-4 border-t border-[var(--color-border-primary)]">
            <a
              href={row.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-[var(--color-accent)] hover:underline"
            >
              View on platform →
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase text-[var(--color-text-tertiary)] font-medium">{label}</p>
      <p className="text-lg font-semibold tabular-nums text-[var(--color-text-primary)]">{value}</p>
    </div>
  );
}
