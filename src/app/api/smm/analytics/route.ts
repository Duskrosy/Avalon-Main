import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const upsertAnalyticsSchema = z.object({
  platform_id: z.string().uuid(),
  metric_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
  impressions: z.number().int().min(0).optional(),
  reach: z.number().int().min(0).optional(),
  engagements: z.number().int().min(0).optional(),
  follower_count: z.number().int().min(0).optional().nullable(),
  follower_growth: z.number().int().optional().nullable(),
  video_plays: z.number().int().min(0).optional(),
  video_plays_3s: z.number().int().min(0).optional(),
  avg_play_time_secs: z.number().min(0).optional(),
});

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

  const admin = createAdminClient();
  let query = admin
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

  const raw = await req.json().catch(() => ({}));
  const parsed = upsertAnalyticsSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const {
    platform_id, metric_date,
    impressions, reach, engagements,
    follower_count, follower_growth,
    video_plays, video_plays_3s, avg_play_time_secs,
  } = parsed.data;

  const row = {
    platform_id,
    metric_date,
    impressions:        impressions ?? 0,
    reach:              reach ?? 0,
    engagements:        engagements ?? 0,
    follower_count:     follower_count ?? null,
    follower_growth:    follower_growth ?? null,
    video_plays:        video_plays ?? 0,
    video_plays_3s:     video_plays_3s ?? 0,
    avg_play_time_secs: avg_play_time_secs ?? 0,
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
