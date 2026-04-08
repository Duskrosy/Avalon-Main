import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isOps, isManagerOrAbove } from "@/lib/permissions";
import { trackEventServer } from "@/lib/observability/track";
import { validateBody } from "@/lib/api/validate";
import { leavePostSchema, leavePatchSchema } from "@/lib/api/schemas";

// GET /api/leaves?scope=mine|department|all&status=...&type=...
export async function GET(request: Request) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const type   = searchParams.get("type");
  const scope  = searchParams.get("scope"); // "mine" | "department" | "all"

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (admin as any)
    .from("leaves")
    .select(`
      *,
      profile:profiles!leaves_user_id_fkey(id, first_name, last_name, department_id,
        department:departments(id, name)
      ),
      reviewer:profiles!leaves_reviewed_by_fkey(first_name, last_name),
      pre_approver:profiles!leaves_pre_approved_by_fkey(first_name, last_name)
    `)
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);
  if (type)   query = query.eq("leave_type", type);

  const userIsOps     = isOps(currentUser);
  const userIsManager = isManagerOrAbove(currentUser);

  if (scope === "mine" || (!userIsManager && !userIsOps)) {
    query = query.eq("user_id", currentUser.id);
  } else if (!userIsOps && userIsManager) {
    const { data: deptUsers } = await admin
      .from("profiles")
      .select("id")
      .eq("department_id", currentUser.department_id)
      .is("deleted_at", null);

    const userIds = deptUsers?.map((u: { id: string }) => u.id) ?? [];
    if (userIds.length > 0) query = query.in("user_id", userIds);
  }
  // OPS with scope "all" — no extra filter

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ leaves: data });
}

// POST /api/leaves — submit a leave request
export async function POST(request: Request) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = await request.json();
  const { data: body, error: validationError } = validateBody(leavePostSchema, raw);
  if (validationError) return validationError;

  const { leave_type, start_date, end_date, reason } = body;

  if (new Date(start_date) > new Date(end_date)) {
    return NextResponse.json({ error: "Start date must be before or equal to end date" }, { status: 400 });
  }

  // Date restriction enforcement (server-side mirror of client rules)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(start_date);
  if (leave_type === "vacation") {
    if (start < today) {
      return NextResponse.json({ error: "Vacation leave cannot start in the past" }, { status: 400 });
    }
  } else if (leave_type === "sick") {
    const fiveDaysAgo = new Date(today);
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
    if (start < fiveDaysAgo) {
      return NextResponse.json({ error: "Sick leave can only be backdated up to 5 days" }, { status: 400 });
    }
  }
  // emergency: no restriction

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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Notify managers in the same department
  const { data: managers } = await admin
    .from("profiles")
    .select("id, role:roles(tier)")
    .eq("department_id", currentUser.department_id)
    .eq("status", "active")
    .is("deleted_at", null)
    .neq("id", currentUser.id);

  const notifications = ((managers ?? []) as unknown as Array<{ id: string; role: { tier: number } }>)
    .filter((m) => m.role.tier <= 2)
    .map((m) => ({
      user_id: m.id,
      type: "leave_request",
      title: "New leave request",
      body: `${currentUser.first_name} ${currentUser.last_name} requested ${leave_type} leave from ${start_date} to ${end_date}`,
      link_url: "/people/leaves",
    }));

  if (notifications.length > 0) await admin.from("notifications").insert(notifications);

  trackEventServer(supabase, currentUser.id, "leave.submitted", {
    module: "people",
    properties: { leave_type, start_date, end_date },
  });

  return NextResponse.json({ leave: data });
}

// PATCH /api/leaves — approve/reject through the two-tier workflow
// Actions:
//   pre_approve → Manager approves pending leave (pending → pre_approved)
//   approve     → OPS final-approves pre_approved leave (pre_approved → approved)
//   reject      → Manager or OPS rejects at any stage
//   cancel      → Employee cancels their own pending leave
export async function PATCH(request: Request) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = await request.json();
  const { data: body, error: validationError } = validateBody(leavePatchSchema, raw);
  if (validationError) return validationError;

  const { leave_id, action } = body;

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: leave } = await (admin as any)
    .from("leaves")
    .select(`*, profile:profiles!leaves_user_id_fkey(id, first_name, last_name, department_id)`)
    .eq("id", leave_id)
    .single();

  if (!leave) return NextResponse.json({ error: "Leave not found" }, { status: 404 });

  const profile = leave.profile as { id: string; first_name: string; last_name: string; department_id: string };

  // ── Cancel: employee cancels their own pending leave ──────
  if (action === "cancel") {
    if (leave.user_id !== currentUser.id) {
      return NextResponse.json({ error: "You can only cancel your own leaves" }, { status: 403 });
    }
    if (leave.status !== "pending") {
      return NextResponse.json({ error: "Only pending leaves can be cancelled" }, { status: 400 });
    }
    await admin.from("leaves").update({ status: "cancelled" }).eq("id", leave_id);
    return NextResponse.json({ message: "Leave cancelled" });
  }

  // ── All other actions require manager or above ────────────
  if (!isManagerOrAbove(currentUser)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Department check for non-OPS
  if (!isOps(currentUser) && profile.department_id !== currentUser.department_id) {
    return NextResponse.json({ error: "You can only manage leaves in your department" }, { status: 403 });
  }

  if (action === "pre_approve") {
    // Manager pre-approves a pending leave
    if (leave.status !== "pending") {
      return NextResponse.json({ error: "Only pending leaves can be pre-approved" }, { status: 400 });
    }
    await admin.from("leaves").update({
      status: "pre_approved",
      pre_approved_by: currentUser.id,
      pre_approved_at: new Date().toISOString(),
    }).eq("id", leave_id);

    // Notify OPS admins for final approval
    const { data: opsUsers } = await admin
      .from("profiles")
      .select("id, role:roles(tier)")
      .eq("status", "active")
      .is("deleted_at", null);

    const opsNotifs = ((opsUsers ?? []) as unknown as Array<{ id: string; role: { tier: number } }>)
      .filter((u) => u.role.tier <= 1)
      .map((u) => ({
        user_id: u.id,
        type: "leave_pre_approved",
        title: "Leave awaiting final approval",
        body: `${currentUser.first_name} ${currentUser.last_name} pre-approved ${profile.first_name} ${profile.last_name}'s ${leave.leave_type} leave. Final approval needed.`,
        link_url: "/people/leaves",
      }));

    if (opsNotifs.length > 0) await admin.from("notifications").insert(opsNotifs);

    // Also notify the employee
    await admin.from("notifications").insert({
      user_id: profile.id,
      type: "leave_pre_approved",
      title: "Leave pre-approved",
      body: `Your ${leave.leave_type} leave (${leave.start_date} → ${leave.end_date}) was pre-approved by ${currentUser.first_name} ${currentUser.last_name} and is awaiting final approval.`,
      link_url: "/people/leaves",
    });

    trackEventServer(supabase, currentUser.id, "leave.pre_approved", { module: "people", category: "audit", properties: { leave_id } });
    return NextResponse.json({ message: "Leave pre-approved" });
  }

  if (action === "approve") {
    // Final approval — OPS only
    if (!isOps(currentUser)) {
      return NextResponse.json({ error: "Only OPS Admin can give final approval" }, { status: 403 });
    }
    if (leave.status !== "pre_approved") {
      return NextResponse.json({ error: "Only pre-approved leaves can be finally approved" }, { status: 400 });
    }
    await admin.from("leaves").update({
      status: "approved",
      reviewed_by: currentUser.id,
      reviewed_at: new Date().toISOString(),
    }).eq("id", leave_id);

    await admin.from("notifications").insert({
      user_id: profile.id,
      type: "leave_approved",
      title: "Leave approved",
      body: `Your ${leave.leave_type} leave (${leave.start_date} → ${leave.end_date}) has been finally approved by ${currentUser.first_name} ${currentUser.last_name}.`,
      link_url: "/people/leaves",
    });

    trackEventServer(supabase, currentUser.id, "leave.approved", { module: "people", category: "audit", properties: { leave_id } });
    return NextResponse.json({ message: "Leave approved" });
  }

  if (action === "reject") {
    if (!["pending", "pre_approved"].includes(leave.status)) {
      return NextResponse.json({ error: "Only pending or pre-approved leaves can be rejected" }, { status: 400 });
    }
    await admin.from("leaves").update({
      status: "rejected",
      reviewed_by: currentUser.id,
      reviewed_at: new Date().toISOString(),
    }).eq("id", leave_id);

    await admin.from("notifications").insert({
      user_id: profile.id,
      type: "leave_rejected",
      title: "Leave rejected",
      body: `Your ${leave.leave_type} leave (${leave.start_date} → ${leave.end_date}) was rejected by ${currentUser.first_name} ${currentUser.last_name}.`,
      link_url: "/people/leaves",
    });

    trackEventServer(supabase, currentUser.id, "leave.rejected", { module: "people", category: "audit", properties: { leave_id } });
    return NextResponse.json({ message: "Leave rejected" });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
