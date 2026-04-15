// src/lib/creatives/constants.ts

export const CREATIVE_GROUPS = [
  { slug: "local", label: "Local" },
  { slug: "international", label: "International" },
  { slug: "pcdlf", label: "PCDLF" },
] as const;

export type CreativeGroupSlug = (typeof CREATIVE_GROUPS)[number]["slug"];

export const GROUP_LABELS = CREATIVE_GROUPS.map((g) => g.label);
export const GROUP_SLUGS = CREATIVE_GROUPS.map((g) => g.slug);

/**
 * Default weekly targets per group.
 * Used as fallback when no creatives_campaign is set for the week.
 */
export const DEFAULT_TARGETS: Record<CreativeGroupSlug, { organic: number; ads: number }> = {
  local: { organic: 10, ads: 5 },
  international: { organic: 10, ads: 3 },
  pcdlf: { organic: 5, ads: 2 },
};
