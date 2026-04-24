import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/permissions";
import { subDays, differenceInCalendarDays, parseISO, format } from "date-fns";

// Live Campaigns data for the /ad-ops/campaigns page.
// Fetches in paginated chunks via .range() to break Supabase's 1000-row default
// cap (the same class of silent truncation that hid Shopify orders previously).
// Aggregation is done by the meta_ad_stats_window RPC so the browser never sees
// day-by-day raw rows.

type WindowRow = {
  meta_account_id: string;
  campaign_id: string;
  ad_id: string;
  ad_name: string | null;
  adset_name: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  conversions: number;
  conversion_value: number;
  messaging_conversations: number;
  video_plays: number;
  video_plays_25pct: number;
  roas_weighted_sum: number;
};

type CampaignRow = {
  id: string;
  campaign_id: string;
  campaign_name: string;
  status: string;
  effective_status: string;
  objective: string | null;
  daily_budget: number | null;
  lifetime_budget: number | null;
  last_synced_at: string;
  meta_account_id: string;
};

const PAGE = 1000;

async function fetchAllCampaigns(admin: ReturnType<typeof createAdminClient>): Promise<CampaignRow[]> {
  const out: CampaignRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("meta_campaigns")
      .select("id, campaign_id, campaign_name, status, effective_status, objective, daily_budget, lifetime_budget, last_synced_at, meta_account_id")
      .order("last_synced_at", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as CampaignRow[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

async function fetchWindow(
  admin: ReturnType<typeof createAdminClient>,
  start: string,
  end: string,
): Promise<WindowRow[]> {
  const out: WindowRow[] = [];
  // RPCs also respect the row-count cap; paginate through with .range().
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .rpc("meta_ad_stats_window", { p_start: start, p_end: end })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as WindowRow[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

function resolveRange(
  preset: string | null,
  startParam: string | null,
  endParam: string | null,
): { start: string; end: string; prevStart: string | null; prevEnd: string | null } {
  const today = new Date();
  const todayStr = format(today, "yyyy-MM-dd");
  const yesterdayStr = format(subDays(today, 1), "yyyy-MM-dd");

  let start: string;
  let end: string;
  switch (preset) {
    case "today":
      start = end = todayStr;
      break;
    case "yesterday":
      start = end = yesterdayStr;
      break;
    case "custom":
      start = startParam || yesterdayStr;
      end = endParam || todayStr;
      break;
    case "7":
    case "14":
    case "30":
    default: {
      const days = parseInt(preset ?? "7", 10) || 7;
      start = format(subDays(today, days - 1), "yyyy-MM-dd");
      end = todayStr;
    }
  }

  // Previous period: same length, immediately preceding. Skip for 30d and today
  // (same logic the client used before) — both are windows where a prev
  // comparison is either unavailable in the DB or replaced by the live fetch.
  if (preset === "30" || preset === "today") {
    return { start, end, prevStart: null, prevEnd: null };
  }
  const dayCount = differenceInCalendarDays(parseISO(end), parseISO(start)) + 1;
  const prevEnd = subDays(parseISO(start), 1);
  const prevStart = subDays(prevEnd, dayCount - 1);
  return {
    start,
    end,
    prevStart: format(prevStart, "yyyy-MM-dd"),
    prevEnd: format(prevEnd, "yyyy-MM-dd"),
  };
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const preset = req.nextUrl.searchParams.get("preset");
  const startParam = req.nextUrl.searchParams.get("start");
  const endParam = req.nextUrl.searchParams.get("end");
  const { start, end, prevStart, prevEnd } = resolveRange(preset, startParam, endParam);

  const admin = createAdminClient();

  try {
    const [campaigns, stats, prevStats] = await Promise.all([
      fetchAllCampaigns(admin),
      fetchWindow(admin, start, end),
      prevStart && prevEnd ? fetchWindow(admin, prevStart, prevEnd) : Promise.resolve([] as WindowRow[]),
    ]);

    // Historical tab: any campaign with zero stats rows in the current window.
    const activeKeys = new Set(stats.map((s) => `${s.meta_account_id}__${s.campaign_id}`));
    const hasActivity: Record<string, boolean> = {};
    for (const c of campaigns) {
      hasActivity[`${c.meta_account_id}__${c.campaign_id}`] =
        activeKeys.has(`${c.meta_account_id}__${c.campaign_id}`);
    }

    return NextResponse.json({
      window: { start, end, prevStart, prevEnd },
      campaigns,
      stats,
      prevStats,
      hasActivity,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
