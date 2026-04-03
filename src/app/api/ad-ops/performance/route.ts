import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { validateBody } from "@/lib/api/validate";
import { adPerformancePostSchema } from "@/lib/api/schemas";

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

  const raw = await req.json();
  const { data: body, error: validationError } = validateBody(adPerformancePostSchema, raw);
  if (validationError) return validationError;

  const { data, error } = await supabase
    .from("ad_performance_snapshots")
    .upsert({
      deployment_id: body.deployment_id,
      metric_date: body.metric_date,
      spend: body.spend ?? null,
      impressions: body.impressions ?? null,
      clicks: body.clicks ?? null,
      purchases: body.purchases ?? null,
      revenue: body.revenue ?? null,
      video_views_3s: body.video_views_3s ?? null,
      video_views_thruplay: body.video_views_thruplay ?? null,
    }, { onConflict: "deployment_id,metric_date" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
