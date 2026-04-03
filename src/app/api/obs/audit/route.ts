import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";

// GET /api/obs/audit?table=&actor_id=&action=&limit=100&offset=0
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser || !isOps(currentUser)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const table = searchParams.get("table");
  const actorId = searchParams.get("actor_id");
  const action = searchParams.get("action");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "100"), 500);
  const offset = parseInt(searchParams.get("offset") ?? "0");

  let query = supabase
    .from("obs_audit_logs")
    .select("*, actor:profiles(first_name, last_name, email)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (table) query = query.eq("table_name", table);
  if (actorId) query = query.eq("actor_id", actorId);
  if (action) query = query.eq("action", action);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ rows: data ?? [], total: count ?? 0 });
}
