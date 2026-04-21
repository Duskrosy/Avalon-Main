import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/permissions";
import {
  shapePlanned,
  shapeOrganic,
  shapeAds,
  normalizeGroup,
  normalizePlatform,
  type TrackerGroup,
  type TrackerPlatform,
} from "@/app/(dashboard)/creatives/tracker/ledger-helpers";
import type { TrackerFeedRow } from "@/types/tracker-feed";

export const runtime = "nodejs";

// GET /api/creatives/tracker-feed?month=YYYY-MM&group=&platform=
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const monthRaw = searchParams.get("month"); // YYYY-MM
  const groupRaw = searchParams.get("group");
  const platformRaw = searchParams.get("platform");

  // ── Month window (UTC) ─────────────────────────────────────────────────────
  const now = new Date();
  let year: number;
  let monthIdx: number; // 0-based
  if (monthRaw && /^\d{4}-\d{2}$/.test(monthRaw)) {
    const [y, m] = monthRaw.split("-").map((x) => parseInt(x, 10));
    year = y;
    monthIdx = m - 1;
  } else {
    year = now.getUTCFullYear();
    monthIdx = now.getUTCMonth();
  }
  const monthStart = new Date(Date.UTC(year, monthIdx, 1, 0, 0, 0));
  const monthEnd = new Date(Date.UTC(year, monthIdx + 1, 1, 0, 0, 0));
  const startISO = monthStart.toISOString();
  const endISO = monthEnd.toISOString();
  const startDate = startISO.slice(0, 10); // YYYY-MM-DD
  const endDate = endISO.slice(0, 10);

  const groupFilter: TrackerGroup | null = groupRaw ? normalizeGroup(groupRaw) : null;
  const platformFilter: TrackerPlatform | null = platformRaw ? normalizePlatform(platformRaw) : null;

  const admin = createAdminClient();

  // ── Fetch three sources in parallel ───────────────────────────────────────
  const [plannedRes, organicRes, adStatsRes] = await Promise.all([
    supabase
      .from("creative_content_items")
      .select("id, title, planned_week_start, group_label")
      .gte("planned_week_start", startDate)
      .lt("planned_week_start", endDate),
    admin
      .from("smm_top_posts")
      .select(`
        id, post_url, thumbnail_url, caption_preview, published_at,
        smm_group_platforms!inner (
          platform,
          smm_groups ( name )
        )
      `)
      .gte("published_at", startISO)
      .lt("published_at", endISO),
    admin
      .from("meta_ad_stats")
      .select("ad_id, ad_name, campaign_name, metric_date")
      .gte("metric_date", startDate)
      .lt("metric_date", endDate),
  ]);

  const plannedRows = shapePlanned(plannedRes.data ?? []);
  const organicRows = shapeOrganic(
    (organicRes.data ?? []) as unknown as Parameters<typeof shapeOrganic>[0],
  );

  // Resolve ad assets (title + thumbnail) via ad_deployments → ad_assets
  const statRows = (adStatsRes.data ?? []) as Parameters<typeof shapeAds>[0];
  const adIds = Array.from(new Set(statRows.map((r) => r.ad_id).filter((x): x is string => !!x)));
  const assetByAdId = new Map<string, { title: string | null; thumbnail_url: string | null }>();
  if (adIds.length > 0) {
    const { data: deployments } = await admin
      .from("ad_deployments")
      .select(`meta_ad_id, ad_assets ( title, thumbnail_url )`)
      .in("meta_ad_id", adIds);
    for (const d of deployments ?? []) {
      const meta_ad_id = (d as { meta_ad_id?: string | null }).meta_ad_id;
      if (!meta_ad_id) continue;
      const raw = (d as { ad_assets?: unknown }).ad_assets;
      const asset = (Array.isArray(raw) ? raw[0] : raw) as
        | { title?: string | null; thumbnail_url?: string | null }
        | null;
      assetByAdId.set(meta_ad_id, {
        title: asset?.title ?? null,
        thumbnail_url: asset?.thumbnail_url ?? null,
      });
    }
  }
  const adRows = shapeAds(statRows, assetByAdId);

  // ── Filter + sort ─────────────────────────────────────────────────────────
  let rows: TrackerFeedRow[] = [...plannedRows, ...organicRows, ...adRows];

  if (groupFilter) {
    // When a group is selected, null-group rows (e.g. Meta ads) are excluded.
    rows = rows.filter((r) => r.group === groupFilter);
  }
  if (platformFilter) {
    rows = rows.filter((r) => r.platform === platformFilter);
  }

  rows.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : 0));

  return NextResponse.json({ data: rows });
}
