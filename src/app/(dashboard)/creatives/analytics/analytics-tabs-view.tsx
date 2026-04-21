"use client";

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

function fmtNum(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

interface Props {
  recentPosts: RecentPost[];
}

export function AnalyticsRecentView({ recentPosts }: Props) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">Content Analytics</h1>
        <p className="text-sm text-[var(--color-text-tertiary)] mt-0.5">
          Per-post and per-ad performance 2–7 days after publishing. For platform and group trends, see Performance.
        </p>
      </div>

      <RecentPanel posts={recentPosts} />
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
        <p className="text-[11px] text-[var(--color-text-tertiary)] mt-0.5">Individual content performance after the initial 24h burst — the window where durable engagement is visible.</p>
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
