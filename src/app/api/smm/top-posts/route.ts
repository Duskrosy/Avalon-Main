import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ops = isOps(user);
  if (!ops && user.department_id) {
    const { data: dept } = await supabase
      .from("departments")
      .select("slug")
      .eq("id", user.department_id)
      .maybeSingle();
    if (!["creatives", "marketing", "ad-ops"].includes(dept?.slug ?? "")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
  }

  const { searchParams } = new URL(req.url);
  const platformId = searchParams.get("platform_id");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (!platformId) return NextResponse.json({ error: "platform_id required" }, { status: 400 });

  let query = supabase
    .from("smm_top_posts")
    .select("*")
    .eq("platform_id", platformId)
    .order("impressions", { ascending: false, nullsFirst: false })
    .limit(10);

  if (from) query = query.gte("metric_date", from);
  if (to) query = query.lte("metric_date", to);

  const { data, error: dbErr } = await query;
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
