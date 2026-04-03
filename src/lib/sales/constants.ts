export const VOLUME_TIERS = [
  { minFollowUps: 480, points: 40 },
  { minFollowUps: 430, points: 35 },
  { minFollowUps: 380, points: 30 },
] as const;

export const BUFFER_TIERS = [
  { minConfirmed: 13, points: 20 },
  { minConfirmed: 9, points: 15 },
] as const;

export const QA_TIERS = {
  "Tier 3": { points: 30, fail: false },
  "Tier 2": { points: 20, fail: false },
  "Tier 1": { points: 10, fail: false },
  "Fail": { points: 0, fail: true },
} as const;

export const QA_TIER_KEYS = ["Tier 3", "Tier 2", "Tier 1", "Fail"] as const;

export const QA_FAIL_CAP = 60;

export const CONSISTENCY_TIERS = {
  3: 20,
  2: 12,
  1: 5,
  0: 0,
} as const;

export const GATE_THRESHOLD = 180;

export const QA_TIER_STYLES: Record<string, { color: string; bg: string }> = {
  "Tier 3": { color: "#2F7D32", bg: "rgba(47,125,50,0.1)" },
  "Tier 2": { color: "#4A4A4A", bg: "#F0F0F0" },
  "Tier 1": { color: "#D57B0E", bg: "rgba(213,123,14,0.1)" },
  "Fail": { color: "#C62828", bg: "rgba(198,40,40,0.1)" },
};
