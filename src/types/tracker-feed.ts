export type TrackerFeedRow = {
  id: string;
  kind: "planned" | "posted_organic" | "posted_ad";
  occurredAt: string; // ISO
  platform: "facebook" | "instagram" | "tiktok" | "youtube" | "meta_ads" | null;
  group: "local" | "international" | "pcdlf" | null;
  title: string;
  thumbnailUrl: string | null;
  href: string | null;
};
