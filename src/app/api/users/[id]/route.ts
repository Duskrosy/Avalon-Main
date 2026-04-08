import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isOps, isManagerOrAbove } from "@/lib/permissions";

// PATCH /api/users/[id] — update user profile
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);

  const isSelf = currentUser?.id === id;
  // Self can update own personalization fields; managers+ can update others
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSelf && !isManagerOrAbove(currentUser)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { first_name, last_name, department_id, role_id, birthday, phone, status,
          bio, job_title, fun_fact, avatar_require_approval } = body;

  const admin = createAdminClient();

  // Verify the target user exists and get their current dept
  const { data: target } = await admin
    .from("profiles")
    .select("id, department_id, role:roles(tier)")
    .eq("id", id)
    .single();

  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Managers can only edit users in their own department
  const targetRole = target.role as unknown as { tier: number };
  if (!isOps(currentUser) && target.department_id !== currentUser.department_id) {
    return NextResponse.json({ error: "You can only edit users in your department" }, { status: 403 });
  }

  // Managers cannot assign OPS-tier roles
  if (!isOps(currentUser) && role_id) {
    const { data: newRole } = await admin
      .from("roles")
      .select("tier")
      .eq("id", role_id)
      .single();

    if (newRole && newRole.tier <= 1) {
      return NextResponse.json({ error: "You cannot assign OPS-level roles" }, { status: 403 });
    }
  }

  // Managers cannot edit OPS-tier users
  if (!isOps(currentUser) && targetRole && targetRole.tier <= 1) {
    return NextResponse.json({ error: "You cannot edit OPS-level users" }, { status: 403 });
  }

  const updates: Record<string, unknown> = { updated_by: currentUser.id };

  // Personalization fields — anyone can update their own
  if (bio          !== undefined) updates.bio        = bio || null;
  if (job_title    !== undefined) updates.job_title  = job_title || null;
  if (fun_fact     !== undefined) updates.fun_fact   = fun_fact || null;

  // Structural fields — manager/OPS only, and only if not a self-update of just personalization
  if (!isSelf || isManagerOrAbove(currentUser)) {
    if (first_name    !== undefined) updates.first_name    = first_name;
    if (last_name     !== undefined) updates.last_name     = last_name;
    if (department_id !== undefined) updates.department_id = department_id;
    if (role_id       !== undefined) updates.role_id       = role_id;
    if (birthday      !== undefined) updates.birthday      = birthday || null;
    if (phone         !== undefined) updates.phone         = phone || null;
    // avatar_require_approval — manager/OPS only (not self)
    if (avatar_require_approval !== undefined && !isSelf) {
      updates.avatar_require_approval = avatar_require_approval;
    }
    if (status !== undefined && isOps(currentUser)) {
      updates.status = status;
      if (status === "active") {
        updates.deleted_at = null;
        updates.deleted_by = null;
      }
    }
  }

  const { error } = await admin.from("profiles").update(updates).eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: "User updated" });
}

// DELETE /api/users/[id] — soft-delete (deactivate) or permanently delete a user
// ?permanent=true requires user to already be inactive
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);

  if (!currentUser || !isOps(currentUser)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (id === currentUser.id) {
    return NextResponse.json({ error: "You cannot delete yourself" }, { status: 400 });
  }

  const admin = createAdminClient();
  const url = new URL(request.url);
  const permanent = url.searchParams.get("permanent") === "true";

  if (permanent) {
    // Verify user is already inactive before allowing hard delete
    const { data: target } = await admin
      .from("profiles")
      .select("status")
      .eq("id", id)
      .single();

    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (target.status !== "inactive") {
      return NextResponse.json(
        { error: "User must be deactivated before permanent deletion" },
        { status: 400 }
      );
    }

    // Hard delete from Supabase Auth — cascades to profiles via FK
    const { error: authError } = await admin.auth.admin.deleteUser(id);
    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 500 });
    }

    return NextResponse.json({ message: "User permanently deleted" });
  }

  // Soft-delete: mark inactive with timestamp
  const { error } = await admin.from("profiles").update({
    status: "inactive",
    deleted_at: new Date().toISOString(),
    deleted_by: currentUser.id,
  }).eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: "User deactivated" });
}
