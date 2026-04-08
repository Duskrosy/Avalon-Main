import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { validateBody } from "@/lib/api/validate";
import { leaveCreditsSchema } from "@/lib/api/schemas";

// GET /api/leaves/credits?userId=xxx
// Returns total credits and computed used counts for the current (or specified) user.
// Used counts = sum of calendar days across approved/pre_approved leaves this calendar year.
export async function GET(request: Request) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const requestedUserId = searchParams.get("userId");

  // Non-OPS users can only see their own credits
  const targetUserId =
    requestedUserId && isOps(currentUser) ? requestedUserId : currentUser.id;

  const admin = createAdminClient();
  const currentYear = new Date().getFullYear();

  // Fetch total credits (or use defaults if no row exists)
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

  // Compute used days from approved and pre_approved leaves this year
  const { data: approvedLeaves } = await admin
    .from("leaves")
    .select("leave_type, start_date, end_date")
    .eq("user_id", targetUserId)
    .in("status", ["approved", "pre_approved"])
    .gte("start_date", `${currentYear}-01-01`)
    .lte("start_date", `${currentYear}-12-31`);

  const used = { sick: 0, vacation: 0, emergency: 0 };
  for (const leave of approvedLeaves ?? []) {
    const days =
      Math.ceil(
        (new Date(leave.end_date).getTime() - new Date(leave.start_date).getTime()) /
          (1000 * 60 * 60 * 24)
      ) + 1;
    const t = leave.leave_type as keyof typeof used;
    if (t in used) used[t] += days;
  }

  return NextResponse.json({ totals, used });
}

// PATCH /api/leaves/credits — update a user's credit totals. OPS Admin only.
export async function PATCH(request: Request) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);

  if (!currentUser || !isOps(currentUser)) {
    return NextResponse.json({ error: "Unauthorized — OPS Admin only" }, { status: 401 });
  }

  const raw = await request.json();
  const { data: body, error: validationError } = validateBody(leaveCreditsSchema, raw);
  if (validationError) return validationError;

  const { user_id, sick_total, vacation_total, emergency_total } = body;

  const updates: Record<string, unknown> = { updated_by: currentUser.id, updated_at: new Date().toISOString() };
  if (sick_total      !== undefined) updates.sick_total      = sick_total;
  if (vacation_total  !== undefined) updates.vacation_total  = vacation_total;
  if (emergency_total !== undefined) updates.emergency_total = emergency_total;

  const admin = createAdminClient();

  // Upsert — creates the row if it doesn't exist yet
  const { error } = await admin
    .from("leave_credits")
    .upsert({ user_id, ...updates }, { onConflict: "user_id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ message: "Credits updated" });
}
