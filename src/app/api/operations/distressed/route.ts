import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isOps } from "@/lib/permissions";

// GET /api/operations/distressed
// ?condition=stuck         → filter by parcel_condition enum
// ?resolved=false          → only unresolved (resolved_at IS NULL)
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const condition = searchParams.get("condition");
  const resolved = searchParams.get("resolved");

  const admin = createAdminClient();

  let query = admin
    .from("distressed_parcels")
    .select(`
      *,
      order:ops_orders!order_id(id, order_number, customer_name),
      creator:profiles!created_by(id, first_name, last_name)
    `)
    .order("created_at", { ascending: false });

  if (condition) {
    query = query.eq("condition", condition);
  }

  if (resolved === "false") {
    query = query.is("resolved_at", null);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: data ?? [] });
}

// POST /api/operations/distressed — create a distressed parcel
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const {
    condition,
    order_id,
    dispatch_id,
    tracking_number,
    issue_reason,
    courier_notes,
    action_needed,
  } = body;

  if (!condition) {
    return NextResponse.json({ error: "condition is required" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data, error } = await admin
    .from("distressed_parcels")
    .insert({
      condition,
      order_id: order_id || null,
      dispatch_id: dispatch_id || null,
      tracking_number: tracking_number || null,
      issue_reason: issue_reason || null,
      courier_notes: courier_notes || null,
      action_needed: action_needed || null,
      created_by: user.id,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data }, { status: 201 });
}

// PATCH /api/operations/distressed — update by id
export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { id, condition, issue_reason, courier_notes, action_needed } = body;

  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (condition !== undefined) updates.condition = condition;
  if (issue_reason !== undefined) updates.issue_reason = issue_reason;
  if (courier_notes !== undefined) updates.courier_notes = courier_notes;
  if (action_needed !== undefined) updates.action_needed = action_needed;

  // Auto-set resolved_at when condition is resolved
  if (condition === "resolved") {
    updates.resolved_at = new Date().toISOString();
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("distressed_parcels")
    .update(updates)
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

// DELETE /api/operations/distressed?id=xxx — OPS only
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isOps(user)) return NextResponse.json({ error: "Forbidden — OPS only" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id query param is required" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from("distressed_parcels").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
