import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isManagerOrAbove } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { CONSISTENCY_TIERS } from "@/lib/sales/constants";
import { validateBody } from "@/lib/api/validate";
import { salesConsistencyPostSchema, salesConsistencyPatchSchema } from "@/lib/api/schemas";

// GET /api/sales/consistency?month=YYYY-MM&agent_id=...
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month");
  const agentId = searchParams.get("agent_id");

  let query = supabase
    .from("sales_consistency")
    .select("*")
    .order("month", { ascending: false });

  if (month) query = query.eq("month", month);
  if (agentId) query = query.eq("agent_id", agentId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data ?? []);
}

// POST /api/sales/consistency — manager+ only
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser || !isManagerOrAbove(currentUser)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const raw = await req.json();
  const { data: body, error: validationError } = validateBody(salesConsistencyPostSchema, raw);
  if (validationError) return validationError;

  const { agent_id, month, ranges_hit, evaluator, notes } = body;

  const clampedRanges = Math.max(0, Math.min(3, ranges_hit ?? 0));
  const consistency_score = CONSISTENCY_TIERS[clampedRanges as keyof typeof CONSISTENCY_TIERS] ?? 0;

  const { data, error } = await supabase
    .from("sales_consistency")
    .upsert({
      agent_id,
      month,
      ranges_hit: clampedRanges,
      consistency_score,
      evaluator: evaluator ?? null,
      notes: notes ?? null,
    }, { onConflict: "agent_id,month" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

// PATCH /api/sales/consistency?id=... — manager+ only
export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser || !isManagerOrAbove(currentUser)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const raw = await req.json();
  const { data: body, error: validationError } = validateBody(salesConsistencyPatchSchema, raw);
  if (validationError) return validationError;

  const updatePayload: Record<string, unknown> = { ...body };
  if (body.ranges_hit !== undefined) {
    const clampedRanges = Math.max(0, Math.min(3, body.ranges_hit));
    updatePayload.ranges_hit = clampedRanges;
    updatePayload.consistency_score = CONSISTENCY_TIERS[clampedRanges as keyof typeof CONSISTENCY_TIERS] ?? 0;
  }

  const { data, error } = await supabase
    .from("sales_consistency")
    .update(updatePayload)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
