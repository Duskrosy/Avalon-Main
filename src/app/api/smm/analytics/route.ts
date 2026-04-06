import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";

async function guard() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }), supabase: null };

  const ops = isOps(user);
  if (!ops && user.department_id) {
    const { data: dept } = await supabase
      .from("departments")
      .select("slug")
      .eq("id", user.department_id)
      .maybeSingle();
    if (!["creatives", "marketing", "ad-ops"].includes(dept?.slug ?? "")) {
      return { error: NextResponse.json({ error: "Unauthorized" }, { status: 403 }), supabase: null };
    }
  }

  return { error: null, supabase };
}

// GET /api/smm/analytics?platform_id=...&from=YYYY-MM-DD&to=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const { error, supabase } = await guard();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const platformId = searchParams.get("platform_id");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (!platformId) return NextResponse.json({ error: "platform_id required" }, { status: 400 });

  let query = supabase!
    .from("smm_analytics")
    .select("*")
    .eq("platform_id", platformId)
    .order("metric_date", { ascending: true });

  if (from) query = query.gte("metric_date", from);
  if (to) query = query.lte("metric_date", to);

  const { data, error: dbErr } = await query;
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST /api/smm/analytics — manual upsert for a single day
export async function POST(req: NextRequest) {
  const { error, supabase } = await guard();
  if (error) return error;

  const body = await req.json();
  const {
    platform_id, metric_date,
    impressions, reach, engagements,
    follower_count, follower_growth,
    video_plays, video_plays_3s, avg_play_time_secs,
  } = body;

  if (!platform_id) return NextResponse.json({ error: "platform_id required" }, { status: 400 });
  if (!metric_date) return NextResponse.json({ error: "metric_date required" }, { status: 400 });

  const row = {
    platform_id,
    metric_date,
    impressions:        Number(impressions ?? 0),
    reach:              Number(reach ?? 0),
    engagements:        Number(engagements ?? 0),
    follower_count:     follower_count != null && follower_count !== "" ? Number(follower_count) : null,
    follower_growth:    follower_growth != null && follower_growth !== "" ? Number(follower_growth) : null,
    video_plays:        Number(video_plays ?? 0),
    video_plays_3s:     Number(video_plays_3s ?? 0),
    avg_play_time_secs: Number(avg_play_time_secs ?? 0),
    data_source:        "manual",
  };

  const { data, error: dbErr } = await supabase!
    .from("smm_analytics")
    .upsert(row, { onConflict: "platform_id,metric_date" })
    .select("*")
    .single();

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json(data, { status: 200 });
}
