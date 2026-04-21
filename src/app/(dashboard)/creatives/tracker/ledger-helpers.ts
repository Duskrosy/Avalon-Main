import type { PostedRow } from "../posted-content/posted-content-view";
import type { TrackerFeedRow } from "@/types/tracker-feed";

// ── Shared visual helpers (originally in posted-content-view.tsx) ────────────

// NOTE: `resolveThumb` was originally a closure over the view's fetchedThumbs
// state. Moving it to a pure module requires passing that map in. Call sites
// that previously did `resolveThumb(r)` now do `resolveThumb(r, fetchedThumbs)`.
export function resolveThumb(
  r: PostedRow,
  fetchedThumbs: Record<string, string> = {},
): string | null {
  return r.thumbnail_url ?? (r.ad_id ? fetchedThumbs[r.ad_id] ?? null : null);
}

export function platformBadge(platform: string): string {
  const styles: Record<string, string> = {
    facebook:  "bg-blue-500/10 text-blue-400",
    instagram: "bg-pink-500/10 text-pink-400",
    tiktok:    "bg-white/10 text-white",
    youtube:   "bg-red-500/10 text-red-400",
    meta:      "bg-purple-500/10 text-purple-400",
    meta_ads:  "bg-purple-500/10 text-purple-400",
  };
  return styles[platform.toLowerCase()] ?? "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]";
}

// ── Tracker-feed shapers ─────────────────────────────────────────────────────

export type TrackerGroup = TrackerFeedRow["group"];
export type TrackerPlatform = TrackerFeedRow["platform"];

/**
 * Normalize a free-form group name to one of the three canonical slugs, or null.
 * Applied to both planned `group_label` (already slugged) and organic `smm_groups.name`
 * (free text). Idempotent on already-slugged values.
 */
export function normalizeGroup(raw: string | null | undefined): TrackerGroup {
  if (!raw) return null;
  const v = raw.trim();
  if (/^local$/i.test(v)) return "local";
  if (/^international$/i.test(v)) return "international";
  if (/^pcdlf$/i.test(v)) return "pcdlf";
  return null;
}

/**
 * Normalize a platform string to the TrackerFeedRow platform union, or null.
 * `smm_group_platforms.platform` is expected to be one of fb/ig/tt/yt names.
 */
export function normalizePlatform(raw: string | null | undefined): TrackerPlatform {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (v === "facebook" || v === "fb") return "facebook";
  if (v === "instagram" || v === "ig") return "instagram";
  if (v === "tiktok" || v === "tt") return "tiktok";
  if (v === "youtube" || v === "yt") return "youtube";
  if (v === "meta_ads" || v === "meta") return "meta_ads";
  return null;
}

// ── Shaper row types (loose shapes from Supabase joined selects) ────────────

type PlannedRowIn = {
  id: string;
  title: string | null;
  planned_week_start: string | null;
  group_label: string | null;
};

type OrganicRowIn = {
  id: string;
  post_url: string | null;
  thumbnail_url: string | null;
  caption_preview: string | null;
  published_at: string | null;
  smm_group_platforms:
    | { platform?: string | null; smm_groups?: { name?: string | null } | { name?: string | null }[] | null }
    | { platform?: string | null; smm_groups?: { name?: string | null } | { name?: string | null }[] | null }[]
    | null;
};

type AdStatRowIn = {
  ad_id: string | null;
  ad_name: string | null;
  campaign_name: string | null;
  metric_date: string | null;
};

type AdAssetLookup = {
  title: string | null;
  thumbnail_url: string | null;
};

// ── Shapers ──────────────────────────────────────────────────────────────────

export function shapePlanned(rows: PlannedRowIn[]): TrackerFeedRow[] {
  return rows
    .filter((r) => !!r.planned_week_start)
    .map((r) => ({
      id: `planned-${r.id}`,
      kind: "planned" as const,
      occurredAt: `${r.planned_week_start}T00:00:00Z`,
      platform: null,
      group: normalizeGroup(r.group_label),
      title: r.title ?? "(untitled)",
      thumbnailUrl: null,
      href: "/creatives/planner",
    }));
}

export function shapeOrganic(rows: OrganicRowIn[]): TrackerFeedRow[] {
  return rows
    .filter((r) => !!r.published_at)
    .map((r) => {
      const platRaw = r.smm_group_platforms;
      const plat = (Array.isArray(platRaw) ? platRaw[0] : platRaw) as
        | { platform?: string | null; smm_groups?: { name?: string | null } | { name?: string | null }[] | null }
        | null;
      const grpRaw = plat?.smm_groups;
      const grp = (Array.isArray(grpRaw) ? grpRaw[0] : grpRaw) as { name?: string | null } | null;
      return {
        id: `organic-${r.id}`,
        kind: "posted_organic" as const,
        occurredAt: new Date(r.published_at as string).toISOString(),
        platform: normalizePlatform(plat?.platform ?? null),
        group: normalizeGroup(grp?.name ?? null),
        title: r.caption_preview ?? "(no caption)",
        thumbnailUrl: r.thumbnail_url ?? null,
        href: r.post_url ?? null,
      };
    });
}

/**
 * Aggregate meta_ad_stats by ad_id; use the earliest metric_date as occurredAt.
 * Titles and thumbnails come from a lookup keyed by ad_id (resolved via
 * ad_deployments → ad_assets).
 */
export function shapeAds(
  statRows: AdStatRowIn[],
  assetByAdId: Map<string, AdAssetLookup>,
): TrackerFeedRow[] {
  const earliest = new Map<string, { ad_name: string | null; campaign_name: string | null; metric_date: string }>();
  for (const r of statRows) {
    if (!r.ad_id || !r.metric_date) continue;
    const prev = earliest.get(r.ad_id);
    if (!prev || r.metric_date < prev.metric_date) {
      earliest.set(r.ad_id, {
        ad_name: r.ad_name ?? prev?.ad_name ?? null,
        campaign_name: r.campaign_name ?? prev?.campaign_name ?? null,
        metric_date: r.metric_date,
      });
    } else {
      // Preserve any non-null name we encounter
      if (!prev.ad_name && r.ad_name) prev.ad_name = r.ad_name;
      if (!prev.campaign_name && r.campaign_name) prev.campaign_name = r.campaign_name;
    }
  }

  const out: TrackerFeedRow[] = [];
  for (const [adId, info] of earliest) {
    const asset = assetByAdId.get(adId);
    out.push({
      id: `ad-${adId}`,
      kind: "posted_ad",
      occurredAt: `${info.metric_date}T00:00:00Z`,
      platform: "meta_ads",
      group: null,
      title: asset?.title ?? info.ad_name ?? info.campaign_name ?? "(untitled ad)",
      thumbnailUrl: asset?.thumbnail_url ?? null,
      href: null,
    });
  }
  return out;
}
