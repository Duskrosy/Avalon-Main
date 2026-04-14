import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isOps } from "@/lib/permissions";

// GET /api/operations/remittance
// Default:                       → fetch remittance_batches with created_by profile join
// ?status=pending                → filter by remittance_status enum
// ?courier_name=J&T              → filter by courier
// ?items=true&batch_id=xxx       → fetch remittance_items for a batch
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const items = searchParams.get("items");
  const batchId = searchParams.get("batch_id");

  const admin = createAdminClient();

  // Fetch remittance items for a specific batch
  if (items === "true" && batchId) {
    const { data, error } = await admin
      .from("remittance_items")
      .select(`
        *,
        order:ops_orders!order_id(id, order_number)
      `)
      .eq("batch_id", batchId)
      .order("created_at");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data ?? [] });
  }

  // Fetch batches with profile join
  const status = searchParams.get("status");
  const courierName = searchParams.get("courier_name");

  let query = admin
    .from("remittance_batches")
    .select(`
      *,
      creator:profiles!created_by(id, first_name, last_name)
    `)
    .order("created_at", { ascending: false });

  if (status) {
    query = query.eq("status", status);
  }
  if (courierName) {
    query = query.eq("courier_name", courierName);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: data ?? [] });
}

// POST /api/operations/remittance
// type: "batch" → create remittance_batch
// type: "item"  → create remittance_item
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { type } = body;

  const admin = createAdminClient();

  if (type === "batch") {
    const { batch_name, courier_name, total_expected, notes } = body;

    if (!batch_name || !courier_name) {
      return NextResponse.json(
        { error: "batch_name and courier_name are required" },
        { status: 400 }
      );
    }

    const { data, error } = await admin
      .from("remittance_batches")
      .insert({
        batch_name,
        courier_name,
        total_expected: total_expected ?? 0,
        notes: notes || null,
        created_by: user.id,
      })
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data }, { status: 201 });
  }

  if (type === "item") {
    const { batch_id, expected_amount, order_id, dispatch_id, received_amount, notes } = body;

    if (!batch_id || expected_amount === undefined) {
      return NextResponse.json(
        { error: "batch_id and expected_amount are required" },
        { status: 400 }
      );
    }

    const { data, error } = await admin
      .from("remittance_items")
      .insert({
        batch_id,
        expected_amount,
        order_id: order_id || null,
        dispatch_id: dispatch_id || null,
        received_amount: received_amount ?? null,
        notes: notes || null,
      })
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data }, { status: 201 });
  }

  return NextResponse.json({ error: "Invalid type — must be 'batch' or 'item'" }, { status: 400 });
}

// PATCH /api/operations/remittance — update batch or item by id
export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { id, type, ...rest } = body;

  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const admin = createAdminClient();

  if (type === "batch") {
    const updates: Record<string, unknown> = {};
    if (rest.status !== undefined) updates.status = rest.status;
    if (rest.total_expected !== undefined) updates.total_expected = rest.total_expected;
    if (rest.total_received !== undefined) updates.total_received = rest.total_received;
    if (rest.settlement_date !== undefined) updates.settlement_date = rest.settlement_date || null;
    if (rest.notes !== undefined) updates.notes = rest.notes || null;

    const { error } = await admin
      .from("remittance_batches")
      .update(updates)
      .eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (type === "item") {
    const updates: Record<string, unknown> = {};
    if (rest.received_amount !== undefined) updates.received_amount = rest.received_amount;
    if (rest.is_matched !== undefined) updates.is_matched = rest.is_matched;
    if (rest.notes !== undefined) updates.notes = rest.notes || null;

    const { error } = await admin
      .from("remittance_items")
      .update(updates)
      .eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid type — must be 'batch' or 'item'" }, { status: 400 });
}

// DELETE /api/operations/remittance?id=xxx&type=batch|item — OPS only
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isOps(user)) return NextResponse.json({ error: "Forbidden — OPS only" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  const type = req.nextUrl.searchParams.get("type");

  if (!id) return NextResponse.json({ error: "id query param is required" }, { status: 400 });
  if (!type || (type !== "batch" && type !== "item")) {
    return NextResponse.json({ error: "type query param must be 'batch' or 'item'" }, { status: 400 });
  }

  const table = type === "batch" ? "remittance_batches" : "remittance_items";

  const admin = createAdminClient();
  const { error } = await admin.from(table).delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
