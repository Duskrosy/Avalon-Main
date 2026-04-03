import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isOps, isManagerOrAbove } from "@/lib/permissions";
import { trackEventServer } from "@/lib/observability/track";
import { validateBody } from "@/lib/api/validate";
import { leavePostSchema, leavePatchSchema } from "@/lib/api/schemas";

// GET /api/leaves
export async function GET(request: Request) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);

  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const scope = searchParams.get("scope"); // "mine" | "department" | "all"

  const admin = createAdminClient();

  let query = admin
    .from("leaves")
    .select(`
      *,
      profile:profiles!leaves_user_id_fkey(id, first_name, last_name, department_id,
        department:departments(id, name)
      ),
      reviewer:profiles!leaves_reviewed_by_fkey(first_name, last_name)
    `)
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);

  const userIsOps = isOps(currentUser);
  const userIsManager = isManagerOrAbove(currentUser);

  if (scope === "mine" || (!userIsManager && !userIsOps)) {
    query = query.eq("user_id", currentUser.id);
  } else if (!userIsOps && userIsManager) {
    const { data: deptUsers } = await admin
      .from("profiles")
      .select("id")
      .eq("department_id", currentUser.department_id)
      .is("deleted_at", null);

    const userIds = deptUsers?.map((u) => u.id) ?? [];
    if (userIds.length > 0) {
      query = query.in("user_id", userIds);
    }
  }
  // OPS with scope "all" — no extra filter

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ leaves: data });
}

// POST /api/leaves — submit a leave request
export async function POST(request: Request) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);

  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = await request.json();
  const { data: body, error: validationError } = validateBody(leavePostSchema, raw);
  if (validationError) return validationError;

  const { leave_type, start_date, end_date, reason } = body;

  if (new Date(start_date) > new Date(end_date)) {
    return NextResponse.json({ error: "Start date must be before end date" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data, error } = await admin
    .from("leaves")
    .insert({
      user_id: currentUser.id,
      leave_type,
      start_date,
      end_date,
      reason: reason || null,
      status: "pending",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Notify managers and OPS in the same department
  const { data: managers } = await admin
    .from("profiles")
    .select("id, role:roles(tier)")
    .eq("department_id", currentUser.department_id)
    .eq("status", "active")
    .is("deleted_at", null)
    .neq("id", currentUser.id);

  const notifications = (managers ?? [])
    .filter((m) => {
      const role = m.role as unknown as { tier: number };
      return role.tier <= 2;
    })
    .map((m) => ({
      user_id: m.id,
      type: "leave_request",
      title: "New leave request",
      body: `${currentUser.first_name} ${currentUser.last_name} requested ${leave_type} leave from ${start_date} to ${end_date}`,
      link_url: "/people/leaves",
    }));

  if (notifications.length > 0) {
    await admin.from("notifications").insert(notifications);
  }

  trackEventServer(supabase, currentUser.id, "leave.submitted", {
    module: "people",
    properties: { leave_type, start_date, end_date },
  });

  return NextResponse.json({ leave: data });
}

// PATCH /api/leaves — approve or reject
export async function PATCH(request: Request) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);

  if (!currentUser || !isManagerOrAbove(currentUser)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = await request.json();
  const { data: body, error: validationError } = validateBody(leavePatchSchema, raw);
  if (validationError) return validationError;

  const { leave_id, action } = body;

  const admin = createAdminClient();

  const { data: leave } = await admin
    .from("leaves")
    .select(`
      *,
      profile:profiles!leaves_user_id_fkey(id, first_name, last_name, department_id)
    `)
    .eq("id", leave_id)
    .single();

  if (!leave) {
    return NextResponse.json({ error: "Leave not found" }, { status: 404 });
  }

  const profile = leave.profile as unknown as {
    id: string;
    first_name: string;
    last_name: string;
    department_id: string;
  };

  if (!isOps(currentUser) && profile.department_id !== currentUser.department_id) {
    return NextResponse.json({ error: "You can only manage leaves in your department" }, { status: 403 });
  }

  const { error } = await admin
    .from("leaves")
    .update({
      status: action,
      reviewed_by: currentUser.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", leave_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await admin.from("notifications").insert({
    user_id: profile.id,
    type: action === "approved" ? "leave_approved" : "leave_rejected",
    title: `Leave ${action}`,
    body: `Your ${leave.leave_type} leave (${leave.start_date} to ${leave.end_date}) has been ${action} by ${currentUser.first_name} ${currentUser.last_name}.`,
    link_url: "/people/leaves",
  });

  trackEventServer(supabase, currentUser.id, `leave.${action}`, {
    module: "people",
    category: "audit",
    properties: { leave_id, action },
  });

  return NextResponse.json({ message: `Leave ${action}` });
}
