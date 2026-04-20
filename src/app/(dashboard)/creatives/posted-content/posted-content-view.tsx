"use client";

import { useMemo, useState } from "react";

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

export function PostedContentView({ rows }: { rows: PostedRow[] }) {
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(() => {
    if (filter === "all") return rows;
    return rows.filter((r) => r.source === filter);
  }, [rows, filter]);

  const organicCount = rows.filter((r) => r.source === "organic").length;
  const adCount = rows.filter((r) => r.source === "ad").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">Posted Content</h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-0.5">
            Per-post performance across organic posts and ad deployments, last 30 days.
          </p>
        </div>
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
                  <tr key={r.id} className="hover:bg-[var(--color-bg-secondary)]/40">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {r.thumbnail_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={r.thumbnail_url}
                            alt=""
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
    </div>
  );
}
