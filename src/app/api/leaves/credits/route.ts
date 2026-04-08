import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isOps, isManagerOrAbove } from "@/lib/permissions";
import { validateBody } from "@/lib/api/validate";
import { leaveCreditsSchema } from "@/lib/api/schemas";

// GET /api/leaves/credits
// ?userId=xxx          → single user's credits + used (own or OPS-specified)
// ?scope=team          → all users in manager's dept with credits + used
// ?scope=all           → all users across org (OPS only)
export async function GET(request: Request) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const requestedUserId = searchParams.get("userId");
  const scope = searchParams.get("scope"); // "team" | "all"

  const admin = createAdminClient();
  const currentYear = new Date().getFullYear();

  // ── Single-user mode ──────────────────────────────────────
  if (!scope) {
    const targetUserId =
      requestedUserId && isOps(currentUser) ? requestedUserId : currentUser.id;

    const { data: credits } = await admin
      .from("leave_credits")
      .select("sick_total, vacation_total, emergency_total")
      .eq("user_id", targetUserId)
      .single();

    const totals = {
      sick:      credits?.sick_total      ?? 5,
      vacation:  credits?.vacation_total  ?? 5,
      emergency: credits?.emergency_total ?? 5,
    };

    const { data: approvedLeaves } = await admin
      .from("leaves")
      .select("leave_type, start_date, end_date")
      .eq("user_id", targetUserId)
      .in("status", ["approved", "pre_approved"])
      .gte("start_date", `${currentYear}-01-01`)
      .lte("start_date", `${currentYear}-12-31`);

    const used = { sick: 0, vacation: 0, emergency: 0 };
    for (const leave of approvedLeaves ?? []) {
      const days = Math.ceil(
        (new Date(leave.end_date).getTime() - new Date(leave.start_date).getTime()) /
          (1000 * 60 * 60 * 24)
      ) + 1;
      const t = leave.leave_type as keyof typeof used;
      if (t in used) used[t] += days;
    }

    return NextResponse.json({ totals, used });
  }

  // ── Team/org bulk mode ────────────────────────────────────
  const isManager = isManagerOrAbove(currentUser);
  if (!isManager && !isOps(currentUser)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (scope === "all" && !isOps(currentUser)) {
    return NextResponse.json({ error: "OPS Admin only" }, { status: 403 });
  }

  // Fetch all relevant active users
  let profileQuery = admin
    .from("profiles")
    .select("id, first_name, last_name, department:departments(id, name, slug)")
    .eq("status", "active")
    .is("deleted_at", null)
    .order("first_name");

  if (scope === "team" && !isOps(currentUser)) {
    profileQuery = profileQuery.eq("department_id", currentUser.department_id);
  }

  const { data: profiles } = await profileQuery;
  const userIds = (profiles ?? []).map((p: { id: string }) => p.id);

  if (userIds.length === 0) return NextResponse.json({ team: [] });

  // Fetch all credit rows in one query
  const { data: allCredits } = await admin
    .from("leave_credits")
    .select("user_id, sick_total, vacation_total, emergency_total")
    .in("user_id", userIds);

  const creditMap: Record<string, { sick_total: number; vacation_total: number; emergency_total: number }> = {};
  for (const c of allCredits ?? []) {
    creditMap[c.user_id] = c;
  }

  // Fetch all approved/pre_approved leaves this year for these users
  const { data: allLeaves } = await admin
    .from("leaves")
    .select("user_id, leave_type, start_date, end_date")
    .in("user_id", userIds)
    .in("status", ["approved", "pre_approved"])
    .gte("start_date", `${currentYear}-01-01`)
    .lte("start_date", `${currentYear}-12-31`);

  // Compute used per user
  const usedMap: Record<string, { sick: number; vacation: number; emergency: number }> = {};
  for (const leave of allLeaves ?? []) {
    if (!usedMap[leave.user_id]) usedMap[leave.user_id] = { sick: 0, vacation: 0, emergency: 0 };
    const days = Math.ceil(
      (new Date(leave.end_date).getTime() - new Date(leave.start_date).getTime()) /
        (1000 * 60 * 60 * 24)
    ) + 1;
    const t = leave.leave_type as "sick" | "vacation" | "emergency";
    if (t in usedMap[leave.user_id]) usedMap[leave.user_id][t] += days;
  }

  const team = (profiles ?? [] as unknown as Array<{
    id: string;
    first_name: string;
    last_name: string;
    department: { id: string; name: string; slug: string } | null;
  }>).map((p) => {
    const c = creditMap[p.id];
    return {
      user_id:    p.id,
      first_name: p.first_name,
      last_name:  p.last_name,
      department: p.department,
      totals: {
        sick:      c?.sick_total      ?? 5,
        vacation:  c?.vacation_total  ?? 5,
        emergency: c?.emergency_total ?? 5,
      },
      used: usedMap[p.id] ?? { sick: 0, vacation: 0, emergency: 0 },
    };
  });

  return NextResponse.json({ team });
}

// PATCH /api/leaves/credits — update credit totals. OPS Admin only.
// Accepts single user_id OR user_ids array for bulk updates.
export async function PATCH(request: Request) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);

  if (!currentUser || !isOps(currentUser)) {
    return NextResponse.json({ error: "Unauthorized — OPS Admin only" }, { status: 401 });
  }

  const raw = await request.json();
  const { data: body, error: validationError } = validateBody(leaveCreditsSchema, raw);
  if (validationError) return validationError;

  const { user_id, user_ids, sick_total, vacation_total, emergency_total } = body;
  const targets = user_ids ?? (user_id ? [user_id] : []);

  if (targets.length === 0) {
    return NextResponse.json({ error: "No target users specified" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {
    updated_by: currentUser.id,
    updated_at: new Date().toISOString(),
  };
  if (sick_total      !== undefined) updates.sick_total      = sick_total;
  if (vacation_total  !== undefined) updates.vacation_total  = vacation_total;
  if (emergency_total !== undefined) updates.emergency_total = emergency_total;

  const admin = createAdminClient();

  // Upsert a row for each target user
  const rows = targets.map((uid: string) => ({ user_id: uid, ...updates }));
  const { error } = await admin
    .from("leave_credits")
    .upsert(rows, { onConflict: "user_id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ message: `Credits updated for ${targets.length} user${targets.length !== 1 ? "s" : ""}` });
}
