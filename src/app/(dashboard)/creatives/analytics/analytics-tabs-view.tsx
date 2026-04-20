"use client";

import { useState } from "react";
import { AnalyticsView, type SmmGroup } from "./analytics-view";

export interface LivePost {
  id: string;
  post_type: "organic" | "ad" | "trad_marketing" | "offline_event";
  status: string;
  scheduled_at: string | null;
  published_at: string | null;
  caption: string | null;
  platform: string;
}

export interface LiveAd {
  ad_id: string;
  ad_name: string | null;
  campaign_name: string | null;
  spend: number;
  impressions: number;
  conversions: number;
  messages: number;
}

export interface RecentPost {
  id: string;
  thumbnail_url: string | null;
  caption_preview: string | null;
  post_url: string | null;
  post_type: string | null;
  published_at: string | null;
  impressions: number | null;
  reach: number | null;
  engagements: number | null;
  video_plays: number | null;
  platform: string;
}

type Tab = "live" | "recent" | "historical";

function fmtNum(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function fmtCurrency(n: number): string {
  if (n >= 1_000_000) return `₱${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `₱${(n / 1_000).toFixed(1)}K`;
  return `₱${n.toFixed(0)}`;
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

interface Props {
  groups: SmmGroup[];
  livePublished: LivePost[];
  liveScheduled: LivePost[];
  liveAds: LiveAd[];
  recentPosts: RecentPost[];
}

export function AnalyticsTabsView({ groups, livePublished, liveScheduled, liveAds, recentPosts }: Props) {
  const [tab, setTab] = useState<Tab>("live");

  const totalLive = livePublished.length + liveScheduled.length + liveAds.length;

  return (
    <div className="space-y-4">
      {/* Tab switcher */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">Analytics</h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-0.5">
            Real-time content performance across platforms.
          </p>
        </div>
        <div className="flex gap-1 p-1 rounded-lg bg-[var(--color-bg-secondary)] text-xs">
          {([
            { key: "live",       label: `Live ${totalLive ? `· ${totalLive}` : ""}` },
            { key: "recent",     label: `Recent ${recentPosts.length ? `· ${recentPosts.length}` : ""}` },
            { key: "historical", label: "Historical" },
          ] as const).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                tab === t.key
                  ? "bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] shadow-[var(--shadow-sm)]"
                  : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "live" && (
        <LivePanel published={livePublished} scheduled={liveScheduled} ads={liveAds} />
      )}
      {tab === "recent" && <RecentPanel posts={recentPosts} />}
      {tab === "historical" && <AnalyticsView groups={groups} />}
    </div>
  );
}

// ─── Live Panel ──────────────────────────────────────────────────────────────

function LivePanel({ published, scheduled, ads }: { published: LivePost[]; scheduled: LivePost[]; ads: LiveAd[] }) {
  const empty = published.length === 0 && scheduled.length === 0 && ads.length === 0;
  if (empty) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-[var(--color-text-tertiary)] bg-[var(--color-bg-primary)] rounded-[var(--radius-lg)] border border-[var(--color-border-primary)]">
        Nothing live in the last 24h or scheduled in the next 24h.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <LiveColumn title="Published · last 24h" subtitle="Collecting engagement now" count={published.length} tone="emerald">
        {published.length === 0 ? (
          <EmptyCell text="Nothing published in the last 24 hours." />
        ) : (
          published.map((p) => <LivePostRow key={p.id} post={p} showTime="published" />)
        )}
      </LiveColumn>
      <LiveColumn title="Scheduled · next 24h" subtitle="Going out soon" count={scheduled.length} tone="blue">
        {scheduled.length === 0 ? (
          <EmptyCell text="No posts scheduled for the next 24 hours." />
        ) : (
          scheduled.map((p) => <LivePostRow key={p.id} post={p} showTime="scheduled" />)
        )}
      </LiveColumn>
      <LiveColumn title="Ads spending · today" subtitle="Active budget right now" count={ads.length} tone="amber">
        {ads.length === 0 ? (
          <EmptyCell text="No ads with spend today yet." />
        ) : (
          ads.map((a) => <LiveAdRow key={a.ad_id} ad={a} />)
        )}
      </LiveColumn>
    </div>
  );
}

function LiveColumn({ title, subtitle, count, tone, children }: {
  title: string;
  subtitle: string;
  count: number;
  tone: "emerald" | "blue" | "amber";
  children: React.ReactNode;
}) {
  const dot = {
    emerald: "bg-emerald-500",
    blue:    "bg-blue-500",
    amber:   "bg-amber-500",
  }[tone];
  return (
    <div className="bg-[var(--color-bg-primary)] rounded-[var(--radius-lg)] border border-[var(--color-border-primary)] overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--color-border-primary)]">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${dot} animate-pulse`} />
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</h3>
          <span className="ml-auto text-xs text-[var(--color-text-tertiary)]">{count}</span>
        </div>
        <p className="text-[11px] text-[var(--color-text-tertiary)] mt-0.5">{subtitle}</p>
      </div>
      <div className="divide-y divide-[var(--color-border-primary)] max-h-[560px] overflow-y-auto">
        {children}
      </div>
    </div>
  );
}

function EmptyCell({ text }: { text: string }) {
  return <div className="px-4 py-6 text-xs text-[var(--color-text-tertiary)]">{text}</div>;
}

function LivePostRow({ post, showTime }: { post: LivePost; showTime: "published" | "scheduled" }) {
  const when = showTime === "published" ? post.published_at : post.scheduled_at;
  const typeBadge = post.post_type === "ad"
    ? "bg-amber-500/10 text-amber-400"
    : "bg-emerald-500/10 text-emerald-400";
  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-2 mb-1">
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase ${typeBadge}`}>
          {post.post_type}
        </span>
        <span className="text-[10px] uppercase text-[var(--color-text-tertiary)] font-medium">{post.platform}</span>
        <span className="ml-auto text-[11px] text-[var(--color-text-secondary)] whitespace-nowrap">{fmtTime(when)}</span>
      </div>
      <p className="text-sm text-[var(--color-text-primary)] line-clamp-2">
        {post.caption ?? "(no caption)"}
      </p>
    </div>
  );
}

function LiveAdRow({ ad }: { ad: LiveAd }) {
  return (
    <div className="px-4 py-3">
      <p className="text-sm text-[var(--color-text-primary)] truncate">{ad.ad_name ?? "(unnamed ad)"}</p>
      {ad.campaign_name && (
        <p className="text-[11px] text-[var(--color-text-tertiary)] truncate">{ad.campaign_name}</p>
      )}
      <div className="flex items-center gap-3 mt-1.5 text-[11px] text-[var(--color-text-secondary)]">
        <span>💰 <span className="text-amber-400 font-medium">{fmtCurrency(ad.spend)}</span></span>
        <span>{fmtNum(ad.impressions)} impr</span>
        {ad.conversions > 0 && <span>{fmtNum(ad.conversions)} conv</span>}
        {ad.messages > 0 && <span>{fmtNum(ad.messages)} msg</span>}
      </div>
    </div>
  );
}

// ─── Recent Panel ────────────────────────────────────────────────────────────

function RecentPanel({ posts }: { posts: RecentPost[] }) {
  if (posts.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-[var(--color-text-tertiary)] bg-[var(--color-bg-primary)] rounded-[var(--radius-lg)] border border-[var(--color-border-primary)]">
        No posts published in the 2–7 day window.
      </div>
    );
  }
  return (
    <div className="bg-[var(--color-bg-primary)] rounded-[var(--radius-lg)] border border-[var(--color-border-primary)] overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--color-border-primary)]">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Published 2–7 days ago</h3>
        <p className="text-[11px] text-[var(--color-text-tertiary)] mt-0.5">Per-post engagement after the initial 24h burst.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-[var(--color-border-primary)]">
        {posts.map((p) => (
          <div key={p.id} className="bg-[var(--color-bg-primary)] p-3 hover:bg-[var(--color-bg-secondary)]/40">
            <div className="flex gap-3 min-w-0">
              {p.thumbnail_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.thumbnail_url} alt="" className="w-16 h-16 rounded object-cover shrink-0 bg-[var(--color-bg-tertiary)]" />
              ) : (
                <div className="w-16 h-16 rounded bg-[var(--color-bg-tertiary)] shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[10px] uppercase font-medium text-[var(--color-text-tertiary)]">{p.platform}</span>
                  <span className="text-[10px] text-[var(--color-text-tertiary)]">· {fmtDate(p.published_at)}</span>
                </div>
                <p className="text-xs text-[var(--color-text-primary)] line-clamp-2 mb-1.5">
                  {p.post_url ? (
                    <a href={p.post_url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      {p.caption_preview ?? "(no caption)"}
                    </a>
                  ) : (p.caption_preview ?? "(no caption)")}
                </p>
                <div className="flex items-center gap-3 text-[11px] tabular-nums text-[var(--color-text-secondary)]">
                  <span>{fmtNum(p.impressions)} impr</span>
                  <span>{fmtNum(p.reach)} reach</span>
                  <span>{fmtNum(p.engagements)} eng</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
