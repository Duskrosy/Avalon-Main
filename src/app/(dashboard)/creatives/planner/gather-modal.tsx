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

export function AssignPostModal({
  posts,
  ads,
  onSelect,
  onClose,
}: {
  posts: SmmPost[];
  ads: LiveAd[];
  onSelect: (selection: GatherSelection) => void;
  onClose: () => void;
}) {
  const [source, setSource] = useState<"all" | "organic" | "ads">("all");
  const [search, setSearch] = useState("");

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
    [rows, source, search]
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-[var(--color-bg-primary)] rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] w-full max-w-lg max-h-[80vh] flex flex-col mx-4">
        <div className="p-4 border-b border-[var(--color-border-secondary)]">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Gather post</h3>
            <p className="text-xs text-[var(--color-text-tertiary)]">Last 14 days</p>
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search posts & ads..."
            className="mt-2 w-full rounded-[var(--radius-md)] border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] px-3 py-1.5 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)]"
          />
          <div className="flex gap-1 flex-wrap mt-2">
            {(["all", "organic", "ads"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSource(s)}
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
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {filtered.length === 0 && (
            <p className="text-sm text-[var(--color-text-tertiary)] text-center py-8">Nothing found</p>
          )}
          {filtered.map((r) => (
            <button
              key={`${r.kind}-${r.id}`}
              onClick={() => {
                if (r.kind === "post") {
                  onSelect({ kind: "post", url: r.url });
                } else if (r.assetId) {
                  onSelect({ kind: "ad", assetId: r.assetId });
                } else {
                  // Ad has no resolvable ad_asset — attribute via external URL scheme.
                  onSelect({ kind: "post", url: `meta_ad://${r.id}` });
                }
              }}
              className="w-full text-left p-3 rounded-[var(--radius-md)] hover:bg-[var(--color-surface-hover)] flex items-start gap-3 transition-colors"
            >
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
            </button>
          ))}
        </div>
        <div className="p-3 border-t border-[var(--color-border-secondary)]">
          <button onClick={onClose} className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">Cancel</button>
        </div>
      </div>
    </div>
  );
}
