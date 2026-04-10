import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isManagerOrAbove } from "@/lib/permissions";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getLastMonday(): string {
  const d = new Date();
  const day = d.getDay(); // 0=Sun, 1=Mon …
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// ─── KPI name → computation key mapping ───────────────────────────────────────
// Matches against kpi_definitions.name for the marketing dept.
// Multiple KPI names can map to the same computed value (e.g. "Click Through Rate"
// in Ad Content Performance and "CTR" in Traffic both = clicks/impressions).
const NAME_TO_KEY: Record<string, string> = {
  "Overall RoAS":              "roas",
  "Total Ad Spend":            "spend",
  "CPM":                       "cpm",
  "CPC":                       "cpc",
  "CTR":                       "ctr",
  "Click Through Rate":        "ctr",      // Ad Content Performance alias
  "Hook Rate":                 "hook_rate",
  "ThruPlay Rate":             "thruplay_rate",
  "Cost per 3-sec Play":       "cost_per_3sec",
  "Cost per 3-sec Video Play": "cost_per_3sec",
};

// ─── POST /api/kpis/marketing/meta-sync ───────────────────────────────────────
//
// Aggregates meta_ad_stats for the requested week and auto-inserts KPI entries
// for all Marketing platform-tracked metrics that can be computed from the data.
//
// Body (optional JSON):
//   { "week_start": "YYYY-MM-DD" }   ← Monday of the desired week
//
// Returns:
//   { synced: number, week: string, values: Record<string, number> }

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManagerOrAbove(user)) {
    return NextResponse.json({ error: "Managers or above only" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({})) as { week_start?: string };
  const weekStart = body.week_start ?? getLastMonday();
  const weekEnd   = addDays(weekStart, 6);

  const admin = createAdminClient();

  // ── 1. Marketing dept ─────────────────────────────────────────────────────
  const { data: dept } = await admin
    .from("departments")
    .select("id")
    .eq("slug", "marketing")
    .single();

  if (!dept) return NextResponse.json({ error: "Marketing department not found" }, { status: 404 });

  // ── 2. Platform-tracked KPI definitions for Marketing ────────────────────
  const { data: defs } = await admin
    .from("kpi_definitions")
    .select("id, name, category, unit")
    .eq("department_id", dept.id)
    .eq("is_platform_tracked", true)
    .eq("is_active", true);

  if (!defs?.length) {
    return NextResponse.json({ synced: 0, message: "No platform-tracked KPIs found for Marketing" });
  }

  // ── 3. Aggregate meta_ad_stats for the week ───────────────────────────────
  const { data: stats, error: statsErr } = await admin
    .from("meta_ad_stats")
    .select("spend, impressions, clicks, conversion_value, video_plays, video_plays_25pct")
    .gte("metric_date", weekStart)
    .lte("metric_date", weekEnd);

  if (statsErr) return NextResponse.json({ error: statsErr.message }, { status: 500 });

  if (!stats?.length) {
    return NextResponse.json({
      synced: 0,
      message: `No Meta Ads data found for ${weekStart} → ${weekEnd}. Run a sync first.`,
    });
  }

  // ── 4. Compute aggregate values ───────────────────────────────────────────
  const agg = stats.reduce(
    (acc, s) => ({
      spend:             acc.spend             + (s.spend             ?? 0),
      impressions:       acc.impressions        + (s.impressions       ?? 0),
      clicks:            acc.clicks             + (s.clicks            ?? 0),
      conversion_value:  acc.conversion_value   + (s.conversion_value  ?? 0),
      video_plays:       acc.video_plays        + (s.video_plays       ?? 0),
      video_plays_25pct: acc.video_plays_25pct  + (s.video_plays_25pct ?? 0),
    }),
    { spend: 0, impressions: 0, clicks: 0, conversion_value: 0, video_plays: 0, video_plays_25pct: 0 },
  );

  // Computed values keyed by metric key
  const computed: Record<string, number | null> = {
    roas:          agg.spend > 0           ? agg.conversion_value / agg.spend            : null,
    spend:         agg.spend,
    cpm:           agg.impressions > 0     ? (agg.spend / agg.impressions) * 1000        : null,
    cpc:           agg.clicks > 0          ? agg.spend / agg.clicks                      : null,
    ctr:           agg.impressions > 0     ? (agg.clicks / agg.impressions) * 100        : null,
    hook_rate:     agg.impressions > 0     ? (agg.video_plays / agg.impressions) * 100   : null,
    thruplay_rate: agg.impressions > 0     ? (agg.video_plays_25pct / agg.impressions) * 100 : null,
    cost_per_3sec: agg.video_plays > 0     ? agg.spend / agg.video_plays                 : null,
  };

  // ── 5. Build entries for matching KPI defs ────────────────────────────────
  type EntryRow = {
    kpi_definition_id: string;
    period_date: string;
    value_numeric: number;
    notes: string;
    entered_by: string;
    profile_id: null;
  };

  const entries: EntryRow[] = [];

  for (const def of defs) {
    const key   = NAME_TO_KEY[def.name];
    if (!key) continue;                    // no auto-sync formula for this KPI
    const value = computed[key];
    if (value === null || value === undefined || isNaN(value)) continue;

    entries.push({
      kpi_definition_id: def.id,
      period_date:       weekStart,
      value_numeric:     Math.round(value * 10000) / 10000, // 4 dp max
      notes:             `Auto-synced from Meta Ads (${weekStart} → ${weekEnd})`,
      entered_by:        user.id,
      profile_id:        null,
    });
  }

  if (!entries.length) {
    return NextResponse.json({
      synced: 0,
      message: "Meta data found but no matching KPI definitions to populate.",
    });
  }

  // ── 6. Delete existing entries for this period then insert fresh ──────────
  // (Allows re-syncing a week after new data arrives)
  const defIds = entries.map((e) => e.kpi_definition_id);
  await admin
    .from("kpi_entries")
    .delete()
    .in("kpi_definition_id", defIds)
    .eq("period_date", weekStart)
    .is("profile_id", null);

  const { error: insertErr } = await admin.from("kpi_entries").insert(entries);
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  // ── 7. Return summary ─────────────────────────────────────────────────────
  const valueMap = Object.fromEntries(
    entries.map((e) => {
      const def = defs.find((d) => d.id === e.kpi_definition_id)!;
      return [def.name, e.value_numeric];
    }),
  );

  return NextResponse.json({
    synced: entries.length,
    week:   `${weekStart} → ${weekEnd}`,
    values: valueMap,
  });
}
