import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isOps } from "@/lib/permissions";

// GET /api/operations/dispatch
// ?status=pending          → filter by dispatch_status enum
// ?assigned_to=uuid        → filter by assigned profile
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const status = searchParams.get("status");
  const assignedTo = searchParams.get("assigned_to");

  const admin = createAdminClient();

  let query = admin
    .from("dispatch_queue")
    .select(`
      *,
      order:ops_orders!order_id(id, order_number, customer_name, total_price),
      assigned:profiles!assigned_to(id, first_name, last_name)
    `)
    .order("created_at", { ascending: false })
    .limit(200);

  if (status) {
    query = query.eq("status", status);
  }
  if (assignedTo) {
    query = query.eq("assigned_to", assignedTo);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: data ?? [] });
}

// POST /api/operations/dispatch — create dispatch entry
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { order_id, is_preorder, assigned_to, remarks } = body;

  if (!order_id) {
    return NextResponse.json({ error: "order_id is required" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: item, error } = await admin
    .from("dispatch_queue")
    .insert({
      order_id,
      is_preorder: is_preorder ?? false,
      assigned_to: assigned_to || null,
      remarks: remarks || null,
      status: "pending",
    })
    .select(`
      *,
      order:ops_orders!order_id(id, order_number, customer_name, total_price),
      assigned:profiles!assigned_to(id, first_name, last_name)
    `)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: item }, { status: 201 });
}

// PATCH /api/operations/dispatch — update dispatch entry by id
export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { id, status, assigned_to, courier_name, tracking_number, dispatch_date, remarks } = body;

  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (status !== undefined) updates.status = status;
  if (assigned_to !== undefined) updates.assigned_to = assigned_to || null;
  if (courier_name !== undefined) updates.courier_name = courier_name || null;
  if (tracking_number !== undefined) updates.tracking_number = tracking_number || null;
  if (dispatch_date !== undefined) updates.dispatch_date = dispatch_date || null;
  if (remarks !== undefined) updates.remarks = remarks || null;

  // Auto-set handoff_at when status is set to handed_off
  if (status === "handed_off") {
    updates.handoff_at = new Date().toISOString();
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("dispatch_queue")
    .update(updates)
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

// DELETE /api/operations/dispatch?id=xxx — OPS only
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isOps(user)) return NextResponse.json({ error: "Forbidden — OPS only" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id query param is required" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from("dispatch_queue").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
