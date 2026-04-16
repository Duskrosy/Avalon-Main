import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isOps, isManagerOrAbove } from "@/lib/permissions";
import {
  notifyLeaveApproved,
  notifyLeaveRejected,
  notifyFormRequired,
  notifyFormFiled,
  notifyLeaveFinalized,
} from "@/lib/leave-requests/notifications";

const SELECT_LEAVE_REQUEST = `
  *,
  requester:profiles!requester_id(id, full_name, avatar_url, department_id),
  approver:profiles!approved_by(id, full_name),
  finalizer:profiles!finalized_by(id, full_name),
  attachments:leave_attachments(id, file_url, file_name, uploaded_by, created_at)
`;

// GET /api/leave-requests/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: leave, error } = await (admin as any)
    .from("leave_requests")
    .select(SELECT_LEAVE_REQUEST)
    .eq("id", id)
    .single();

  if (error || !leave) return NextResponse.json({ error: "Leave request not found" }, { status: 404 });

  // Visible to the requester or OPS/managers
  const userIsOps = isOps(currentUser);
  const userIsManager = isManagerOrAbove(currentUser);
  if (!userIsOps && !userIsManager && leave.requester_id !== currentUser.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ leave_request: leave });
}

// PATCH /api/leave-requests/[id] — workflow transitions via `action`
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

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
  const { action } = body;

  if (!action || typeof action !== "string") {
    return NextResponse.json({ error: "action is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: leave, error: fetchError } = await (admin as any)
    .from("leave_requests")
    .select(SELECT_LEAVE_REQUEST)
    .eq("id", id)
    .single();

  if (fetchError || !leave) return NextResponse.json({ error: "Leave request not found" }, { status: 404 });

  const userIsOps = isOps(currentUser);
  const userIsManager = isManagerOrAbove(currentUser);

  // ── approve: pending → approved (OPS/manager only) ────────────────────────
  if (action === "approve") {
    if (!userIsOps && !userIsManager) {
      return NextResponse.json({ error: "Only managers or OPS can approve leave requests" }, { status: 403 });
    }
    if (leave.status !== "pending") {
      return NextResponse.json({ error: "Only pending leave requests can be approved" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: updated, error: updateError } = await (admin as any)
      .from("leave_requests")
      .update({
        status: "approved",
        approved_by: currentUser.id,
        approved_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

    await notifyLeaveApproved(supabase, updated, {
      id: currentUser.id,
      first_name: currentUser.first_name,
      last_name: currentUser.last_name,
    });
    await notifyFormRequired(supabase, updated);

    return NextResponse.json({ leave_request: updated });
  }

  // ── reject: pending/approved/awaiting_form → rejected (OPS/manager only) ──
  if (action === "reject") {
    if (!userIsOps && !userIsManager) {
      return NextResponse.json({ error: "Only managers or OPS can reject leave requests" }, { status: 403 });
    }
    if (!["pending", "approved", "awaiting_form"].includes(leave.status)) {
      return NextResponse.json({ error: "Leave request cannot be rejected from its current status" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: updated, error: updateError } = await (admin as any)
      .from("leave_requests")
      .update({
        status: "rejected",
        approved_by: currentUser.id,
        approved_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

    await notifyLeaveRejected(supabase, updated, {
      id: currentUser.id,
      first_name: currentUser.first_name,
      last_name: currentUser.last_name,
    });

    return NextResponse.json({ leave_request: updated });
  }

  // ── request_form: approved → awaiting_form (OPS/manager only) ─────────────
  if (action === "request_form") {
    if (!userIsOps && !userIsManager) {
      return NextResponse.json({ error: "Only managers or OPS can request a form" }, { status: 403 });
    }
    if (leave.status !== "approved") {
      return NextResponse.json({ error: "Leave request must be approved before requesting a form" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: updated, error: updateError } = await (admin as any)
      .from("leave_requests")
      .update({ status: "awaiting_form" })
      .eq("id", id)
      .select()
      .single();

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

    await notifyFormRequired(supabase, updated);

    return NextResponse.json({ leave_request: updated });
  }

  // ── mark_filed: awaiting_form → form_filed=true (requester or OPS) ─────────
  if (action === "mark_filed") {
    const isRequester = leave.requester_id === currentUser.id;
    if (!isRequester && !userIsOps) {
      return NextResponse.json({ error: "Only the requester or OPS can mark the form as filed" }, { status: 403 });
    }
    if (leave.status !== "awaiting_form") {
      return NextResponse.json({ error: "Leave request must be awaiting form before marking as filed" }, { status: 400 });
    }

    const form_signed_digitally =
      typeof body.form_signed_digitally === "boolean" ? body.form_signed_digitally : null;

    const updatePayload: Record<string, unknown> = { form_filed: true };
    if (form_signed_digitally !== null) {
      updatePayload.form_signed_digitally = form_signed_digitally;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: updated, error: updateError } = await (admin as any)
      .from("leave_requests")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

    await notifyFormFiled(supabase, updated, {
      id: currentUser.id,
      first_name: currentUser.first_name,
      last_name: currentUser.last_name,
    });

    return NextResponse.json({ leave_request: updated });
  }

  // ── finalize: form_filed=true → status=finalized (OPS only) ───────────────
  if (action === "finalize") {
    if (!userIsOps) {
      return NextResponse.json({ error: "Only OPS can finalize leave requests" }, { status: 403 });
    }
    if (!leave.form_filed) {
      return NextResponse.json({ error: "Form must be filed before finalizing" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: updated, error: updateError } = await (admin as any)
      .from("leave_requests")
      .update({
        status: "finalized",
        finalized_by: currentUser.id,
        finalized_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

    await notifyLeaveFinalized(supabase, updated, {
      id: currentUser.id,
      first_name: currentUser.first_name,
      last_name: currentUser.last_name,
    });

    return NextResponse.json({ leave_request: updated });
  }

  // ── re_notify: fire form reminder (OPS only, no DB update) ────────────────
  if (action === "re_notify") {
    if (!userIsOps) {
      return NextResponse.json({ error: "Only OPS can send form reminders" }, { status: 403 });
    }
    if (leave.status !== "awaiting_form") {
      return NextResponse.json({ error: "Leave request must be awaiting form to send a reminder" }, { status: 400 });
    }

    await notifyFormRequired(supabase, leave, true);

    return NextResponse.json({ message: "Reminder sent" });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
