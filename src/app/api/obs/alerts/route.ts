import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isManagerOrAbove, isOps } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";

// GET /api/obs/alerts?acknowledged=false&limit=50
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser || !isManagerOrAbove(currentUser)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const acknowledged = searchParams.get("acknowledged");
  const limit = parseInt(searchParams.get("limit") ?? "100");

  let query = supabase
    .from("obs_alerts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (acknowledged !== null) query = query.eq("acknowledged", acknowledged === "true");

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data ?? []);
}

// PATCH /api/obs/alerts?id=... — acknowledge
export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser || !isManagerOrAbove(currentUser)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { data, error } = await supabase
    .from("obs_alerts")
    .update({
      acknowledged: true,
      acknowledged_by: currentUser.id,
      acknowledged_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST /api/obs/alerts — create manual alert (OPS only)
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser || !isOps(currentUser)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();

  const { data, error } = await supabase
    .from("obs_alerts")
    .insert({
      type: body.type,
      severity: body.severity ?? "info",
      message: body.message,
      source_table: body.source_table ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
