import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";

// ─── GET /api/sales/ad-campaigns ────────────────────────────────────────────
//
// Returns the campaign-name pool for the "Ad campaign source" autocomplete
// in the order-completion modal. Two sources merged:
//
//   1. Active Meta campaigns from meta_campaigns — same filter the
//      ad-ops live-ads dashboard uses (effective_status ACTIVE-ish,
//      not hidden). Tagged source: "live".
//   2. Historical free-text values from completed orders — so agents
//      see what they (or others) have used before, including organic /
//      manual entries that aren't in Meta. Tagged source: "history".
//
// Each row is flat-shaped: { name, source }. Frontend renders source
// as a small badge so the agent knows whether they're picking a live
// campaign or just an old free-text label.

export async function GET(_req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // 1. Active Meta campaigns — match the ad-ops live-ads filter.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: liveRows } = await (admin as any)
    .from("meta_campaigns")
    .select("campaign_name")
    .or(
      [
        "effective_status.eq.ACTIVE",
        "effective_status.eq.IN_PROCESS",
        "effective_status.eq.WITH_ISSUES",
        "effective_status.eq.PENDING_REVIEW",
        "effective_status.eq.PREAPPROVED",
        "effective_status.eq.PENDING_BILLING_INFO",
        "auto_paused_at.not.is.null",
      ].join(","),
    )
    .is("hidden_at", null)
    .order("campaign_name");

  const liveNames = new Set<string>();
  for (const r of (liveRows ?? []) as Array<{ campaign_name: string | null }>) {
    if (r.campaign_name) liveNames.add(r.campaign_name);
  }

  // 2. Historical values agents have used on past completed orders.
  // Limited to the last 1k completed rows so the dropdown stays bounded.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: historyRows } = await (admin as any)
    .from("orders")
    .select("ad_campaign_source")
    .not("ad_campaign_source", "is", null)
    .order("completed_at", { ascending: false, nullsFirst: false })
    .limit(1000);

  const historyNames = new Set<string>();
  for (const r of (historyRows ?? []) as Array<{
    ad_campaign_source: string | null;
  }>) {
    if (r.ad_campaign_source && !liveNames.has(r.ad_campaign_source)) {
      historyNames.add(r.ad_campaign_source);
    }
  }

  const items: Array<{ name: string; source: "live" | "history" }> = [
    ...[...liveNames].sort().map((name) => ({ name, source: "live" as const })),
    ...[...historyNames]
      .sort()
      .map((name) => ({ name, source: "history" as const })),
  ];

  return NextResponse.json({ items });
}
