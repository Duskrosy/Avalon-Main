import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isManagerOrAbove } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { QA_TIERS } from "@/lib/sales/constants";
import { validateBody } from "@/lib/api/validate";
import { salesQaPostSchema, salesQaPatchSchema } from "@/lib/api/schemas";

// GET /api/sales/qa?month=YYYY-MM&agent_id=...
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month");
  const agentId = searchParams.get("agent_id");

  let query = supabase
    .from("sales_qa_log")
    .select("*")
    .order("qa_date", { ascending: false });

  if (month) {
    query = query.gte("qa_date", `${month}-01`).lte("qa_date", `${month}-31`);
  }
  if (agentId) {
    query = query.eq("agent_id", agentId);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data ?? []);
}

// POST /api/sales/qa — manager+ only
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser || !isManagerOrAbove(currentUser)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const raw = await req.json();
  const { data: body, error: validationError } = validateBody(salesQaPostSchema, raw);
  if (validationError) return validationError;

  const { agent_id, qa_date, message_link, qa_tier, qa_reason, evaluator, notes } = body;

  const tierDef = QA_TIERS[qa_tier as keyof typeof QA_TIERS];
  const qa_points = tierDef?.points ?? 0;
  const qa_fail = tierDef?.fail ?? false;

  const { data, error } = await supabase
    .from("sales_qa_log")
    .upsert({
      agent_id,
      qa_date,
      message_link,
      qa_tier,
      qa_points,
      qa_fail,
      qa_reason,
      evaluator,
      notes: notes ?? null,
      created_by: currentUser.id,
    }, { onConflict: "agent_id,qa_date" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

// PATCH /api/sales/qa?id=...  — manager+ only
export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser || !isManagerOrAbove(currentUser)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const raw = await req.json();
  const { data: body, error: validationError } = validateBody(salesQaPatchSchema, raw);
  if (validationError) return validationError;

  const updatePayload: Record<string, unknown> = { ...body };

  // Recalculate points/fail if tier is updated
  if (body.qa_tier) {
    const tierDef = QA_TIERS[body.qa_tier as keyof typeof QA_TIERS];
    updatePayload.qa_points = tierDef?.points ?? 0;
    updatePayload.qa_fail = tierDef?.fail ?? false;
  }

  const { data, error } = await supabase
    .from("sales_qa_log")
    .update(updatePayload)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE /api/sales/qa?id=... — manager+ only
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser || !isManagerOrAbove(currentUser)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from("sales_qa_log").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
