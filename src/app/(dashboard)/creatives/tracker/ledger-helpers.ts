import type { PostedRow } from "../posted-content/posted-content-view";
import type { TrackerGroup, OrganicPlatform } from "@/types/tracker-feed";

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

export function normalizeGroup(raw: string | null | undefined): TrackerGroup {
  if (!raw) return null;
  const v = raw.trim();
  if (/^local$/i.test(v)) return "local";
  if (/^international$/i.test(v)) return "international";
  if (/^pcdlf$/i.test(v)) return "pcdlf";
  return null;
}

export function normalizeOrganicPlatform(raw: string | null | undefined): OrganicPlatform {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (v === "facebook" || v === "fb") return "facebook";
  if (v === "instagram" || v === "ig") return "instagram";
  if (v === "tiktok" || v === "tt") return "tiktok";
  if (v === "youtube" || v === "yt") return "youtube";
  return null;
}
