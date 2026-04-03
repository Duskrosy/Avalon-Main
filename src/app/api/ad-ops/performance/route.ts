import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";

// GET /api/ad-ops/performance?deployment_id=&from=YYYY-MM-DD&to=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const deploymentId = searchParams.get("deployment_id");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  let query = supabase
    .from("ad_performance_snapshots")
    .select("*")
    .order("metric_date", { ascending: true })
    .limit(500);

  if (deploymentId) query = query.eq("deployment_id", deploymentId);
  if (from) query = query.gte("metric_date", from);
  if (to) query = query.lte("metric_date", to);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data ?? []);
}

// POST /api/ad-ops/performance — upsert a snapshot
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  const { data, error } = await supabase
    .from("ad_performance_snapshots")
    .upsert({
      deployment_id: body.deployment_id,
      metric_date: body.metric_date,
      spend: body.spend ?? 0,
      impressions: body.impressions ?? 0,
      clicks: body.clicks ?? 0,
      outbound_clicks: body.outbound_clicks ?? 0,
      video_plays: body.video_plays ?? 0,
      video_plays_25pct: body.video_plays_25pct ?? 0,
      video_plays_50pct: body.video_plays_50pct ?? 0,
      video_plays_75pct: body.video_plays_75pct ?? 0,
      video_plays_100pct: body.video_plays_100pct ?? 0,
      avg_play_time_secs: body.avg_play_time_secs ?? 0,
      conversions: body.conversions ?? 0,
      conversion_value: body.conversion_value ?? 0,
    }, { onConflict: "deployment_id,metric_date" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
