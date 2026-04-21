"use client";
import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";

// Organic post snapshot from smm_top_posts (posted-content parity).
// Linked on the content item via linked_external_url (post_url).
export type SmmPost = {
  id: string;
  platform: string;
  caption: string | null;
  thumbnail_url: string | null;
  post_url: string | null;
  published_at: string | null;
  post_type: string | null;
};

// Meta ad aggregated from meta_ad_stats + ad_deployments join.
// Links via linked_ad_asset_id when an ad_asset is resolvable, else via
// linked_external_url = "meta_ad://<meta_ad_id>" for attribution-only.
export type LiveAd = {
  id: string; // meta_ad_id
  asset_id: string | null; // ad_assets.id — null if ad_deployment not resolved
  title: string; // preferred display fallback (asset.title || ad_name || campaign_name || "(untitled ad)")
  ad_name: string | null;
  adset_name: string | null;
  campaign_name: string | null;
  thumbnail_url: string | null;
  launched_at: string | null;
};

export type GatherSelection =
  | { kind: "post"; url: string }
  | { kind: "ad"; assetId: string };

type PlatformFilter = "all" | "facebook" | "instagram" | "tiktok" | "youtube";

const PLATFORM_FILTERS: ReadonlyArray<{ value: PlatformFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
  { value: "youtube", label: "YouTube" },
];

type GatherRow =
  | {
      kind: "post";
      id: string;
      url: string;
      platform: string;
      title: string;
      thumbnail: string | null;
      timestamp: string | null;
    }
  | {
      kind: "ad";
      id: string; // meta_ad_id (dedup key)
      assetId: string | null; // null → fall back to meta_ad:// external url
      platform: string;
      title: string; // fallback display string — used when ad_name is null and for search
      adName: string | null;
      adsetName: string | null;
      campaignName: string | null;
      thumbnail: string | null;
      timestamp: string | null;
    };

// Stable string key for selection dedupe — faster and clearer than JSON.stringify.
const selectionKey = (s: GatherSelection) =>
  s.kind === "post" ? `post:${s.url}` : `ad:${s.assetId}`;

// Resolve the GatherSelection that clicking a row toggles.
// Ads with no resolvable ad_asset fall back to meta_ad:// external URL.
function rowToSelection(r: GatherRow): GatherSelection {
  if (r.kind === "post") return { kind: "post", url: r.url };
  if (r.assetId) return { kind: "ad", assetId: r.assetId };
  return { kind: "post", url: `meta_ad://${r.id}` };
}

export function AssignPostModal({
  posts,
  ads,
  onConfirm,
  onClose,
}: {
  posts: SmmPost[];
  ads: LiveAd[];
  onConfirm: (selections: GatherSelection[]) => void;
  onClose: () => void;
}) {
  const [source, setSource] = useState<"all" | "organic" | "ads">("all");
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<GatherSelection[]>([]);

  const selectedKeys = useMemo(
    () => new Set(selected.map(selectionKey)),
    [selected]
  );
  const isSelected = (s: GatherSelection) => selectedKeys.has(selectionKey(s));
  const toggle = (s: GatherSelection) =>
    setSelected((prev) =>
      prev.some((x) => selectionKey(x) === selectionKey(s))
        ? prev.filter((x) => selectionKey(x) !== selectionKey(s))
        : [...prev, s]
    );

  const rows = useMemo<GatherRow[]>(() => {
    const safePosts = posts ?? [];
    const safeAds = ads ?? [];
    const organicRows: GatherRow[] = safePosts
      .filter((p) => !!p.post_url) // need post_url to link
      .map((p) => ({
        kind: "post",
        id: p.id,
        url: p.post_url!,
        platform: p.platform,
        title: p.caption ?? "(no caption)",
        thumbnail: p.thumbnail_url ?? null,
        timestamp: p.published_at,
      }));
    const adRows: GatherRow[] = safeAds.map((a) => ({
      kind: "ad",
      id: a.id,
      assetId: a.asset_id,
      platform: "meta",
      title: a.title,
      adName: a.ad_name,
      adsetName: a.adset_name,
      campaignName: a.campaign_name,
      thumbnail: a.thumbnail_url,
      timestamp: a.launched_at,
    }));
    const all = [...organicRows, ...adRows];
    all.sort((a, b) => {
      const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return tb - ta;
    });
    return all;
  }, [posts, ads]);

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (source === "organic" && r.kind !== "post") return false;
        if (source === "ads" && r.kind !== "ad") return false;
        // Platform filter applies to organic rows only — ads pass through.
        if (r.kind === "post" && platformFilter !== "all") {
          if ((r.platform ?? "").toLowerCase() !== platformFilter) return false;
        }
        if (search) {
          const q = search.toLowerCase();
          const haystack =
            r.kind === "ad"
              ? [r.title, r.adName, r.adsetName, r.campaignName].filter(Boolean).join(" ")
              : r.title;
          if (!haystack.toLowerCase().includes(q)) return false;
        }
        return true;
      }),
    [rows, source, platformFilter, search]
  );

  const handleConfirm = () => {
    if (selected.length === 0) return;
    onConfirm(selected);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-[var(--color-bg-primary)] rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] w-full max-w-lg max-h-[80vh] flex flex-col mx-4">
        <div className="p-4 border-b border-[var(--color-border-secondary)]">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Gather posts</h3>
            <p className="text-xs text-[var(--color-text-tertiary)]">Last 14 days</p>
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search posts & ads..."
            className="mt-2 w-full rounded-[var(--radius-md)] border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] px-3 py-1.5 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)]"
          />
          <div className="flex gap-1 flex-wrap mt-2" role="group" aria-label="Source filter">
            {(["all", "organic", "ads"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSource(s)}
                aria-pressed={source === s}
                className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize transition-colors ${
                  source === s
                    ? "bg-[var(--color-accent)] text-white"
                    : "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          {source !== "ads" && (
            <div
              className="flex gap-1 flex-wrap mt-2"
              role="group"
              aria-label="Filter organic posts by platform"
            >
              {PLATFORM_FILTERS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPlatformFilter(p.value)}
                  aria-pressed={platformFilter === p.value}
                  className={`px-2 py-0.5 rounded-full text-xs transition-colors ${
                    platformFilter === p.value
                      ? "bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] border border-[var(--color-border-primary)]"
                      : "text-[var(--color-text-secondary)] border border-transparent hover:bg-[var(--color-surface-hover)]"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {filtered.length === 0 && (
            <p className="text-sm text-[var(--color-text-tertiary)] text-center py-8">Nothing found</p>
          )}
          {filtered.map((r) => {
            const sel = rowToSelection(r);
            const checked = isSelected(sel);
            const displayTitle = r.kind === "ad" ? (r.adName ?? r.title) : r.title;
            return (
              <label
                key={`${r.kind}-${r.id}`}
                className={`w-full text-left p-3 rounded-[var(--radius-md)] flex items-start gap-3 transition-colors cursor-pointer ${
                  checked
                    ? "bg-[var(--color-surface-hover)] ring-1 ring-[var(--color-accent)]"
                    : "hover:bg-[var(--color-surface-hover)]"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(sel)}
                  aria-label={`Select ${displayTitle}`}
                  className="mt-1 h-4 w-4 flex-shrink-0 accent-[var(--color-accent)] cursor-pointer"
                />
                {r.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={r.thumbnail}
                    alt=""
                    className="h-10 w-10 rounded object-cover flex-shrink-0 bg-[var(--color-bg-tertiary)]"
                  />
                ) : (
                  <span className="text-xs font-medium capitalize px-1.5 py-0.5 rounded bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] flex-shrink-0">
                    {r.platform}
                  </span>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                        r.kind === "ad"
                          ? "bg-indigo-50 text-indigo-700"
                          : "bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      {r.kind === "ad" ? "Ad" : "Organic"}
                    </span>
                    <span className="text-[10px] font-medium capitalize text-[var(--color-text-tertiary)]">
                      {r.platform}
                    </span>
                  </div>
                  {r.kind === "ad" ? (
                    <div className="mt-0.5 min-w-0">
                      {r.campaignName && (
                        <p className="text-[11px] text-[var(--color-text-tertiary)] truncate">
                          {r.campaignName}
                        </p>
                      )}
                      {r.adsetName && (
                        <p className="text-[11px] text-[var(--color-text-secondary)] truncate">
                          {r.adsetName}
                        </p>
                      )}
                      <p className="text-sm font-medium text-[var(--color-text-primary)] line-clamp-1">
                        {r.adName ?? r.title}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-[var(--color-text-primary)] line-clamp-2 mt-0.5">
                      {r.title}
                    </p>
                  )}
                  <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
                    {r.timestamp ? format(parseISO(r.timestamp), "MMM d, yyyy") : "—"}
                  </p>
                </div>
              </label>
            );
          })}
        </div>
        <div className="sticky bottom-0 p-3 border-t border-[var(--color-border-secondary)] bg-[var(--color-bg-primary)] flex items-center justify-between gap-3 rounded-b-[var(--radius-lg)]">
          <p className="text-xs text-[var(--color-text-secondary)]">
            {selected.length} selected
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] px-3 py-1.5"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={selected.length === 0}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
