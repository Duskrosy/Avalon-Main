import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";

// GET /api/obs/errors?resolved=false&severity=&module=&limit=50
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser || !isOps(currentUser)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const resolved = searchParams.get("resolved");
  const severity = searchParams.get("severity");
  const module_ = searchParams.get("module");
  const limit = parseInt(searchParams.get("limit") ?? "100");

  let query = supabase
    .from("obs_error_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (resolved !== null) query = query.eq("resolved", resolved === "true");
  if (severity) query = query.eq("severity", severity);
  if (module_) query = query.eq("module", module_);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data ?? []);
}

// PATCH /api/obs/errors?id=... — resolve/unresolve
export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser || !isOps(currentUser)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const body = await req.json();
  const update: Record<string, unknown> = {};

  if (body.resolved !== undefined) {
    update.resolved = body.resolved;
    if (body.resolved === true) {
      update.resolved_at = new Date().toISOString();
      update.resolved_by = currentUser.id;
    } else {
      update.resolved_at = null;
      update.resolved_by = null;
    }
  }

  const { data, error } = await supabase
    .from("obs_error_logs")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
