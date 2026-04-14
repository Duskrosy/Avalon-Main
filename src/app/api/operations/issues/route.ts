import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isOps } from "@/lib/permissions";

// GET /api/operations/issues
// ?status=open           → eq filter
// ?issue_type=wrong_size → eq filter
// ?order_id=uuid         → eq filter
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const status = searchParams.get("status");
  const issueType = searchParams.get("issue_type");
  const orderId = searchParams.get("order_id");

  const admin = createAdminClient();

  let query = admin
    .from("order_issues")
    .select(`
      *,
      order:ops_orders!order_id(id, order_number, customer_name),
      follow_up_owner_profile:profiles!follow_up_owner(id, first_name, last_name),
      created_by_profile:profiles!created_by(id, first_name, last_name)
    `)
    .order("created_at", { ascending: false })
    .limit(200);

  if (status) {
    query = query.eq("status", status);
  }
  if (issueType) {
    query = query.eq("issue_type", issueType);
  }
  if (orderId) {
    query = query.eq("order_id", orderId);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: data ?? [] });
}

// POST /api/operations/issues — create a new issue
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const {
    order_id,
    issue_type,
    description,
    notes_after_call,
    agent_remarks,
    summary,
    follow_up_owner,
    follow_up_date,
  } = body;

  if (!order_id || !issue_type) {
    return NextResponse.json(
      { error: "order_id and issue_type are required" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const { data: issue, error } = await admin
    .from("order_issues")
    .insert({
      order_id,
      issue_type,
      description: description || null,
      notes_after_call: notes_after_call || null,
      agent_remarks: agent_remarks || null,
      summary: summary || null,
      follow_up_owner: follow_up_owner || null,
      follow_up_date: follow_up_date || null,
      created_by: user.id,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: issue }, { status: 201 });
}

// PATCH /api/operations/issues — update by id (from body)
export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { id, ...updates } = body;

  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  // Only allow known fields
  const allowed: Record<string, unknown> = {};
  const ALLOWED_FIELDS = [
    "status",
    "resolution",
    "description",
    "notes_after_call",
    "agent_remarks",
    "summary",
    "follow_up_owner",
    "follow_up_date",
  ];
  for (const key of ALLOWED_FIELDS) {
    if (key in updates) {
      allowed[key] = updates[key] ?? null;
    }
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("order_issues")
    .update(allowed)
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

// DELETE /api/operations/issues?id=xxx — OPS only
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isOps(user))
    return NextResponse.json({ error: "Forbidden — OPS only" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id query param is required" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from("order_issues").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
