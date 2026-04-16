import { createAdminClient } from "@/lib/supabase/admin";

// ── Types ─────────────────────────────────────────────────────────────────────

type Actor = {
  id: string;
  first_name: string;
  last_name: string;
};

type LeaveRequest = {
  id: string;
  requester_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  status: string;
  [key: string]: unknown;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Fetch all active OPS user IDs (role tier <= 1). */
async function getOpsUserIds(): Promise<string[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("id, role:roles(tier)")
    .eq("status", "active")
    .is("deleted_at", null);

  return ((data ?? []) as unknown as Array<{ id: string; role: { tier: number } }>)
    .filter((u) => u.role.tier <= 1)
    .map((u) => u.id);
}

function dateRange(req: LeaveRequest): string {
  return `${req.start_date} → ${req.end_date}`;
}

function fullName(actor: Actor): string {
  return `${actor.first_name} ${actor.last_name}`;
}

// ── Exported notification helpers ─────────────────────────────────────────────

/**
 * Fired on POST (new leave request submitted).
 * Notifies all OPS users that a new request needs review.
 */
export async function notifyLeaveSubmitted(
  _supabase: unknown,
  leaveRequest: LeaveRequest,
  requester: Actor
): Promise<void> {
  const admin = createAdminClient();
  const opsIds = await getOpsUserIds();
  if (opsIds.length === 0) return;

  const notifications = opsIds.map((id) => ({
    user_id: id,
    type: "leave_submitted",
    title: "New leave request",
    body: `${fullName(requester)} submitted a ${leaveRequest.leave_type} leave request (${dateRange(leaveRequest)}).`,
    link_url: "/people/leaves",
  }));

  await admin.from("notifications").insert(notifications);
}

/**
 * Fired when OPS approves a leave request (pending → approved).
 * Notifies the requester.
 */
export async function notifyLeaveApproved(
  _supabase: unknown,
  leaveRequest: LeaveRequest,
  approver: Actor
): Promise<void> {
  const admin = createAdminClient();
  await admin.from("notifications").insert({
    user_id: leaveRequest.requester_id,
    type: "leave_approved",
    title: "Leave approved",
    body: `Your ${leaveRequest.leave_type} leave (${dateRange(leaveRequest)}) has been approved by ${fullName(approver)}.`,
    link_url: "/people/leaves",
  });
}

/**
 * Fired when OPS rejects a leave request.
 * Notifies the requester.
 */
export async function notifyLeaveRejected(
  _supabase: unknown,
  leaveRequest: LeaveRequest,
  rejector: Actor
): Promise<void> {
  const admin = createAdminClient();
  await admin.from("notifications").insert({
    user_id: leaveRequest.requester_id,
    type: "leave_rejected",
    title: "Leave rejected",
    body: `Your ${leaveRequest.leave_type} leave (${dateRange(leaveRequest)}) was rejected by ${fullName(rejector)}.`,
    link_url: "/people/leaves",
  });
}

/**
 * Fired when OPS approves the request and a form is required,
 * or when OPS explicitly requests the form, or sends a reminder.
 * Notifies the requester to file their leave form.
 */
export async function notifyFormRequired(
  _supabase: unknown,
  leaveRequest: LeaveRequest,
  isReminder = false
): Promise<void> {
  const admin = createAdminClient();
  await admin.from("notifications").insert({
    user_id: leaveRequest.requester_id,
    type: "leave_form_required",
    title: isReminder ? "Leave form reminder" : "Leave form required",
    body: isReminder
      ? `Reminder: please file the leave form for your approved ${leaveRequest.leave_type} leave (${dateRange(leaveRequest)}).`
      : `Your ${leaveRequest.leave_type} leave (${dateRange(leaveRequest)}) has been approved. Please file the required leave form.`,
    link_url: "/people/leaves",
  });
}

/**
 * Fired when the employee marks the form as filed (awaiting_form → finalized or back to OPS).
 * Notifies all OPS users that the form has been submitted.
 */
export async function notifyFormFiled(
  _supabase: unknown,
  leaveRequest: LeaveRequest,
  filer: Actor
): Promise<void> {
  const admin = createAdminClient();
  const opsIds = await getOpsUserIds();
  if (opsIds.length === 0) return;

  const notifications = opsIds.map((id) => ({
    user_id: id,
    type: "leave_form_filed",
    title: "Leave form filed",
    body: `${fullName(filer)} filed the leave form for their ${leaveRequest.leave_type} leave (${dateRange(leaveRequest)}).`,
    link_url: "/people/leaves",
  }));

  await admin.from("notifications").insert(notifications);
}

/**
 * Fired when OPS finalizes the leave request (awaiting_form → finalized).
 * Notifies the requester that the workflow is complete.
 */
export async function notifyLeaveFinalized(
  _supabase: unknown,
  leaveRequest: LeaveRequest,
  finalizer: Actor
): Promise<void> {
  const admin = createAdminClient();
  await admin.from("notifications").insert({
    user_id: leaveRequest.requester_id,
    type: "leave_finalized",
    title: "Leave request finalized",
    body: `Your ${leaveRequest.leave_type} leave (${dateRange(leaveRequest)}) has been finalized by ${fullName(finalizer)}.`,
    link_url: "/people/leaves",
  });
}
