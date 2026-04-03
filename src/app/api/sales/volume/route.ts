import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isManagerOrAbove } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { trackEventServer } from "@/lib/observability/track";
import { validateBody } from "@/lib/api/validate";
import { salesVolumePostSchema } from "@/lib/api/schemas";

// GET /api/sales/volume?month=YYYY-MM&agent_id=...
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month"); // e.g. "2025-01"
  const agentId = searchParams.get("agent_id");

  let query = supabase
    .from("sales_daily_volume")
    .select("*")
    .order("date", { ascending: false });

  if (month) {
    query = query.gte("date", `${month}-01`).lte("date", `${month}-31`);
  }
  if (agentId) {
    query = query.eq("agent_id", agentId);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data ?? []);
}

// POST /api/sales/volume
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = await req.json();
  const { data: body, error: validationError } = validateBody(salesVolumePostSchema, raw);
  if (validationError) return validationError;

  const {
    agent_id, date, follow_ups, confirmed_total, confirmed_abandoned,
    buffer_approved, buffer_reason, buffer_proof_link,
    on_leave, excluded_hours, notes,
  } = body;

  const { data, error } = await supabase
    .from("sales_daily_volume")
    .upsert({
      agent_id,
      date,
      follow_ups: follow_ups ?? 0,
      confirmed_total: confirmed_total ?? 0,
      confirmed_abandoned: confirmed_abandoned ?? 0,
      buffer_approved: buffer_approved ?? false,
      buffer_reason: buffer_reason ?? null,
      buffer_proof_link: buffer_proof_link ?? null,
      on_leave: on_leave ?? false,
      excluded_hours: excluded_hours ?? 0,
      notes: notes ?? null,
      created_by: currentUser.id,
    }, { onConflict: "agent_id,date" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  trackEventServer(supabase, currentUser.id, "sales.volume.logged", {
    module: "sales-ops",
    properties: { agent_id, date },
  });

  return NextResponse.json(data, { status: 201 });
}

// PATCH /api/sales/volume?id=...
export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const body = await req.json();

  // Buffer approval requires manager+
  if (body.buffer_approved !== undefined && !isManagerOrAbove(currentUser)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (body.buffer_approved === true) {
    body.buffer_approved_by = currentUser.id;
    body.buffer_approved_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("sales_daily_volume")
    .update(body)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE /api/sales/volume?id=...
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser || !isManagerOrAbove(currentUser)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from("sales_daily_volume").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
