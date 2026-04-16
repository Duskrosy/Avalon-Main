import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isOps, isManagerOrAbove } from "@/lib/permissions";
import { notifyLeaveSubmitted } from "@/lib/leave-requests/notifications";

// GET /api/leave-requests?status=...
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (admin as any)
    .from("leave_requests")
    .select(`
      *,
      requester:profiles!requester_id(id, full_name, avatar_url, department_id),
      approver:profiles!approved_by(id, full_name),
      finalizer:profiles!finalized_by(id, full_name),
      attachments:leave_attachments(id, file_url, file_name, uploaded_by, created_at)
    `)
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);

  const userIsOps = isOps(currentUser);
  const userIsManager = isManagerOrAbove(currentUser);

  if (!userIsOps && !userIsManager) {
    // Regular employees see only their own requests
    query = query.eq("requester_id", currentUser.id);
  }
  // OPS and managers see all requests (managers could be further scoped if needed)

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ leave_requests: data });
}

// POST /api/leave-requests — submit a new leave request
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const body = raw as Record<string, unknown>;
  const { leave_type, start_date, end_date, reason } = body;

  if (!leave_type || typeof leave_type !== "string") {
    return NextResponse.json({ error: "leave_type is required" }, { status: 400 });
  }
  if (!start_date || typeof start_date !== "string") {
    return NextResponse.json({ error: "start_date is required" }, { status: 400 });
  }
  if (!end_date || typeof end_date !== "string") {
    return NextResponse.json({ error: "end_date is required" }, { status: 400 });
  }

  if (new Date(start_date) > new Date(end_date)) {
    return NextResponse.json({ error: "start_date must be before or equal to end_date" }, { status: 400 });
  }

  const admin = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("leave_requests")
    .insert({
      requester_id: currentUser.id,
      leave_type,
      start_date,
      end_date,
      reason: reason && typeof reason === "string" ? reason : null,
      status: "pending",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fire notification to OPS
  await notifyLeaveSubmitted(supabase, data, {
    id: currentUser.id,
    first_name: currentUser.first_name,
    last_name: currentUser.last_name,
  });

  return NextResponse.json({ leave_request: data }, { status: 201 });
}
