import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";

// ─── GET /api/sales/ad-creatives ────────────────────────────────────────────
//
// Returns the ad-creative pool for the Mark Complete modal's creative
// picker. There is no `meta_ads` table in this codebase — ad-level data
// is denormalised into `meta_ad_stats` (one row per ad per day). We
// therefore source distinct ads from `meta_ad_stats` (last 90 days) and
// stitch in parent campaign metadata via `meta_campaigns`.
//
// Wire shape per item:
//   { ad_id, ad_name, campaign_name, campaign_date, status }
//
// `campaign_date` is the DB-side first-seen timestamp (`meta_campaigns.created_at`)
// — Meta's own campaign creation date isn't mirrored. status is "live" when the
// parent campaign's effective_status is in ACTIVE_STATUSES, otherwise the
// lowercased parent status. Thumbnails are NOT fetched here — Task 12's UI
// hits `/api/ad-ops/live-ads/thumbnails` separately.
//
// Defaults to ads belonging to active campaigns. When `q` is provided,
// non-active campaigns are also searched so agents can find paused/archived
// ads if they need to.

const ACTIVE_STATUSES = [
  "ACTIVE",
  "IN_PROCESS",
  "WITH_ISSUES",
  "PENDING_REVIEW",
  "PREAPPROVED",
  "PENDING_BILLING_INFO",
];

const STATS_LOOKBACK_DAYS = 90;

type CampaignRow = {
  id: string;
  campaign_id: string;
  campaign_name: string | null;
  effective_status: string | null;
  created_at: string | null;
};

type StatRow = {
  ad_id: string;
  ad_name: string | null;
  campaign_id: string;
  meta_account_id: string;
};

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const limit = Math.min(
    parseInt(req.nextUrl.searchParams.get("limit") ?? "50", 10) || 50,
    200,
  );

  const admin = createAdminClient();

  // 1. Pull candidate campaigns. Active by default; if a search query is
  //    supplied, also include non-active so paused/archived ads can be found.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let campaignQuery = (admin as any)
    .from("meta_campaigns")
    .select("id, campaign_id, campaign_name, effective_status, created_at")
    .is("hidden_at", null);

  if (!q) {
    campaignQuery = campaignQuery.in("effective_status", ACTIVE_STATUSES);
  }

  const { data: campaignRows, error: campaignErr } = await campaignQuery;
  if (campaignErr) {
    return NextResponse.json({ error: campaignErr.message }, { status: 500 });
  }

  const campaigns = (campaignRows ?? []) as CampaignRow[];
  if (campaigns.length === 0) {
    return NextResponse.json({ creatives: [] });
  }

  // Keyed by `${meta_account_id}__${campaign_id}` is overkill since the
  // meta_account is implicit in the campaign row; but stats rows carry both
  // and we want the lookup to match what stats expose, so we key on the
  // campaign-side `campaign_id` text directly. Same campaign_id under
  // different meta_account_ids would collide, but in practice that's rare
  // and the worst case is the wrong campaign_name on a duplicate.
  const campaignByCampaignId = new Map<string, CampaignRow>();
  for (const c of campaigns) {
    if (c.campaign_id) campaignByCampaignId.set(c.campaign_id, c);
  }
  const campaignIds = Array.from(campaignByCampaignId.keys());

  // 2. Pull recent ad rows from meta_ad_stats restricted to those campaigns.
  const cutoff = new Date(
    Date.now() - STATS_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  )
    .toISOString()
    .slice(0, 10);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let statQuery = (admin as any)
    .from("meta_ad_stats")
    .select("ad_id, ad_name, campaign_id, meta_account_id")
    .in("campaign_id", campaignIds)
    .gte("metric_date", cutoff)
    .not("ad_name", "is", null)
    .order("ad_name");

  if (q) statQuery = statQuery.ilike("ad_name", `%${q}%`);

  // We need many rows per ad (one per day) so the cap has to be generous.
  // Take 5000 rows max and dedupe in JS — the picker only ever shows `limit`.
  statQuery = statQuery.limit(5000);

  const { data: statRows, error: statErr } = await statQuery;
  if (statErr) {
    return NextResponse.json({ error: statErr.message }, { status: 500 });
  }

  // 3. Dedupe by ad_id (first row wins — ordered by ad_name).
  const seen = new Map<string, StatRow>();
  for (const s of (statRows ?? []) as StatRow[]) {
    if (!s.ad_id || seen.has(s.ad_id)) continue;
    seen.set(s.ad_id, s);
  }

  // 4. Shape the response. Live = parent campaign's effective_status is active.
  const creatives = Array.from(seen.values())
    .slice(0, limit)
    .map((s) => {
      const camp = campaignByCampaignId.get(s.campaign_id) ?? null;
      const isLive =
        camp?.effective_status != null &&
        ACTIVE_STATUSES.includes(camp.effective_status);
      return {
        ad_id: String(s.ad_id),
        ad_name: s.ad_name as string,
        campaign_name: camp?.campaign_name ?? null,
        campaign_date: camp?.created_at ?? null,
        status: isLive
          ? "live"
          : (camp?.effective_status ?? "").toLowerCase() || "unknown",
      };
    });

  return NextResponse.json({ creatives });
}
