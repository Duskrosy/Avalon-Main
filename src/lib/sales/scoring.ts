import { VOLUME_TIERS, BUFFER_TIERS, QA_TIERS, QA_FAIL_CAP } from "./constants";
import type { DailyVolume, QaLog, DailyFpsRow } from "./types";

// ============================================================
// VOLUME SCORING
// ============================================================

export function computeStdVolPts(followUps: number): number | null {
  for (const tier of VOLUME_TIERS) {
    if (followUps >= tier.minFollowUps) return tier.points;
  }
  return null;
}

export function computeBufferPts(confirmedTotal: number): number {
  for (const tier of BUFFER_TIERS) {
    if (confirmedTotal >= tier.minConfirmed) return tier.points;
  }
  return 0;
}

export function isNoDataDay(vol: DailyVolume): boolean {
  return !vol.on_leave && vol.follow_ups === 0 && vol.confirmed_total === 0;
}

export function computeFinalVolPts(vol: DailyVolume): number | null {
  if (vol.on_leave) return null;
  if (isNoDataDay(vol)) return null;

  const std = computeStdVolPts(vol.follow_ups);
  if (std !== null) return std;

  return vol.buffer_approved ? computeBufferPts(vol.confirmed_total) : 0;
}

// ============================================================
// QA SCORING
// ============================================================

export function resolveQaPoints(qaTier: string | null | undefined): number {
  if (!qaTier) return 0;
  return QA_TIERS[qaTier as keyof typeof QA_TIERS]?.points ?? 0;
}

export function resolveQaFail(qaTier: string | null | undefined): boolean {
  if (!qaTier) return false;
  return qaTier === "Fail";
}

// ============================================================
// DAILY FPS COMPUTATION
// ============================================================

export function computeDailyFps(
  vol: DailyVolume | null,
  qa: QaLog | null
): DailyFpsRow {
  const base = {
    agentId: vol?.agent_id || qa?.agent_id || "",
    date: vol?.date || qa?.qa_date || "",
  };

  if (!vol) {
    return {
      ...base,
      dayStatus: "NO DATA",
      volPts: null, qaPts: null, qaFail: false, qaMissing: true,
      qaTier: null, baseFps: null, finalFps: null,
      isLeave: false, isNoData: true, capApplied: false,
    };
  }

  if (vol.on_leave) {
    return {
      ...base,
      dayStatus: "LEAVE",
      volPts: null, qaPts: null, qaFail: false, qaMissing: !qa,
      qaTier: qa?.qa_tier || null, baseFps: null, finalFps: null,
      isLeave: true, isNoData: false, capApplied: false,
    };
  }

  if (isNoDataDay(vol)) {
    return {
      ...base,
      dayStatus: "NO DATA",
      volPts: null, qaPts: null, qaFail: false, qaMissing: !qa,
      qaTier: qa?.qa_tier || null, baseFps: null, finalFps: null,
      isLeave: false, isNoData: true, capApplied: false,
    };
  }

  const volPts = computeFinalVolPts(vol) || 0;
  const qaPts = resolveQaPoints(qa?.qa_tier);
  const qaFail = resolveQaFail(qa?.qa_tier);
  const baseFps = volPts + qaPts;
  const capApplied = qaFail && baseFps > QA_FAIL_CAP;
  const finalFps = qaFail ? Math.min(baseFps, QA_FAIL_CAP) : baseFps;

  return {
    ...base,
    dayStatus: qaFail ? "QA CAPPED" : "SCORED",
    volPts, qaPts, qaFail, qaMissing: !qa,
    qaTier: qa?.qa_tier || null, baseFps, finalFps,
    isLeave: false, isNoData: false, capApplied,
  };
}

// ============================================================
// MONTHLY AGGREGATION
// ============================================================

export function computeMonthlyFps(
  dailyRows: DailyFpsRow[]
): { avg: number | null; scoredDays: number; totalFps: number } {
  const scored = dailyRows.filter(r => r.finalFps !== null);
  if (scored.length === 0) return { avg: null, scoredDays: 0, totalFps: 0 };

  const totalFps = scored.reduce((s, r) => s + (r.finalFps || 0), 0);
  return {
    avg: Math.round((totalFps / scored.length) * 10) / 10,
    scoredDays: scored.length,
    totalFps,
  };
}

export function computeMtdConfirmedRegular(volumes: DailyVolume[]): number {
  // CRITICAL: Leave days with confirmed values STILL count toward gate.
  // Leave only affects FPS exclusion, NOT gate calculation.
  return volumes.reduce((sum, v) => {
    return sum + Math.max(0, (v.confirmed_total - v.confirmed_abandoned));
  }, 0);
}

export function computeGateStatus(mtdConfirmedRegular: number, threshold = 180) {
  const remaining = Math.max(0, threshold - mtdConfirmedRegular);
  return {
    passed: remaining === 0,
    remaining,
    mtdConfirmedRegular,
    threshold,
  };
}

// ============================================================
// MONTHLY FPS (with consistency, capped at 100)
// ============================================================

export function computeMonthlyFpsWithConsistency(
  dailyAvg: number | null,
  consistencyScore: number
): { monthlyFps: number | null; bracket: string } {
  if (dailyAvg === null) return { monthlyFps: null, bracket: "Fail" };

  const raw = dailyAvg + consistencyScore;
  const monthlyFps = Math.min(raw, 100); // Cap at 100

  let bracket = "Fail";
  if (monthlyFps >= 90) bracket = "Elite";
  else if (monthlyFps >= 80) bracket = "Strong";
  else if (monthlyFps >= 70) bracket = "Pass";

  return { monthlyFps: Math.round(monthlyFps * 10) / 10, bracket };
}

// ============================================================
// INCENTIVE CALCULATIONS (stacked)
// ============================================================

export function computeMainTierPayout(
  bracket: string,
  paidPairs: number
): { rate: number; amount: number } {
  const rates: Record<string, number> = {
    "Elite": 50,
    "Strong": 40,
    "Pass": 30,
    "Fail": 0,
  };
  const rate = rates[bracket] ?? 0;
  return { rate, amount: rate * paidPairs };
}

export function computeAbandonedPayout(
  deliveredAbandonedPairs: number
): { rate: number; amount: number } {
  const rate = 100; // ₱100 per delivered abandoned pair
  return { rate, amount: rate * deliveredAbandonedPairs };
}

export function computeOnhandPayout(
  deliveredOnhandPairs: number,
  totalDeliveredPairs: number
): { rate: number; amount: number; utilization: number; eligible: boolean } {
  const utilization = totalDeliveredPairs > 0
    ? (deliveredOnhandPairs / totalDeliveredPairs) * 100
    : 0;
  const eligible = utilization >= 50;
  const rate = 20; // ₱20 per delivered onhand pair
  return {
    rate,
    amount: eligible ? rate * deliveredOnhandPairs : 0,
    utilization: Math.round(utilization * 10) / 10,
    eligible,
  };
}

export function computeTotalPayout(
  gatePassed: boolean,
  monthlyFps: number | null,
  bracket: string,
  paidPairs: number,
  deliveredAbandonedPairs: number,
  deliveredOnhandPairs: number,
  totalDeliveredPairs: number
) {
  // Gate must be passed for ALL incentives
  if (!gatePassed) {
    return {
      mainTier: { rate: 0, amount: 0 },
      abandoned: { rate: 0, amount: 0 },
      onhand: { rate: 0, amount: 0, utilization: 0, eligible: false },
      total: 0,
      eligible: false,
      reason: "Gate not passed (Confirmed Regular < 180)",
    };
  }

  // Main tier requires FPS > 70
  const mainTier = (monthlyFps !== null && monthlyFps > 70)
    ? computeMainTierPayout(bracket, paidPairs)
    : { rate: 0, amount: 0 };

  // Abandoned only requires gate
  const abandoned = computeAbandonedPayout(deliveredAbandonedPairs);

  // Onhand requires gate + utilization ≥ 50%
  const onhand = computeOnhandPayout(deliveredOnhandPairs, totalDeliveredPairs);

  return {
    mainTier,
    abandoned,
    onhand,
    total: mainTier.amount + abandoned.amount + onhand.amount,
    eligible: true,
    reason: null,
  };
}

// ============================================================
// SAFETY HELPERS
// ============================================================

export function safeNumber(n: unknown): number | null {
  return typeof n === "number" && !Number.isNaN(n) ? n : null;
}
