import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";

// GET /api/obs/jobs?job_name=&status=&limit=100
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser || !isOps(currentUser)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const jobName = searchParams.get("job_name");
  const status = searchParams.get("status");
  const limit = parseInt(searchParams.get("limit") ?? "100");

  let query = supabase
    .from("obs_job_runs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (jobName) query = query.eq("job_name", jobName);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data ?? []);
}
