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

  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isSelf = currentUser.id === id;
  if (!isSelf && !isManagerOrAbove(currentUser)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const {
    first_name, last_name, department_id, role_id, birthday, phone, status,
    bio, job_title, fun_fact, avatar_require_approval,
    must_change_password, require_mfa, allow_password_change,
  } = body;

  const admin = createAdminClient();

  // Verify target exists
  const { data: target } = await admin
    .from("profiles")
    .select("id, department_id, role:roles(tier)")
    .eq("id", id)
    .single();

  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const targetTier = (target.role as unknown as { tier: number }).tier;
  const currentTier = currentUser.role.tier;

  // Cannot edit someone with strictly higher privilege (lower tier number) than yourself
  if (!isSelf && targetTier < currentTier) {
    return NextResponse.json(
      { error: "You cannot edit users with higher privileges than you" },
      { status: 403 }
    );
  }

  // Non-OPS managers can only edit users in their own department
  if (!isSelf && !isOps(currentUser) && target.department_id !== currentUser.department_id) {
    return NextResponse.json({ error: "You can only edit users in your department" }, { status: 403 });
  }

  // Cannot assign a role with strictly higher privilege than yourself
  if (role_id) {
    const { data: newRole } = await admin.from("roles").select("tier").eq("id", role_id).single();
    if (newRole && newRole.tier < currentTier) {
      return NextResponse.json({ error: "You cannot assign a role with higher privileges than your own" }, { status: 403 });
    }
    // Non-OPS cannot assign OPS-tier roles (tier <= 1)
    if (!isOps(currentUser) && newRole && newRole.tier <= 1) {
      return NextResponse.json({ error: "You cannot assign OPS-level roles" }, { status: 403 });
    }
  }

  const updates: Record<string, unknown> = { updated_by: currentUser.id };

  // Personalization — anyone can update their own
  if (bio       !== undefined) updates.bio       = bio       || null;
  if (job_title !== undefined) updates.job_title = job_title || null;
  if (fun_fact  !== undefined) updates.fun_fact  = fun_fact  || null;

  // Structural fields — manager/OPS only (or self if manager+)
  if (!isSelf || isManagerOrAbove(currentUser)) {
    if (first_name    !== undefined) updates.first_name    = first_name;
    if (last_name     !== undefined) updates.last_name     = last_name;
    if (department_id !== undefined) updates.department_id = department_id;
    if (role_id       !== undefined) updates.role_id       = role_id;
    if (birthday      !== undefined) updates.birthday      = birthday || null;
    if (phone         !== undefined) updates.phone         = phone    || null;
    // avatar_require_approval — managers/OPS only, not self-service
    if (avatar_require_approval !== undefined && !isSelf) {
      updates.avatar_require_approval = avatar_require_approval;
    }
    // Security flags — managers/OPS only, not self-service
    if (must_change_password  !== undefined && !isSelf) updates.must_change_password  = must_change_password;
    if (require_mfa           !== undefined && !isSelf) updates.require_mfa           = require_mfa;
    if (allow_password_change !== undefined && !isSelf) updates.allow_password_change = allow_password_change;
    // Status — OPS only
    if (status !== undefined && isOps(currentUser)) {
      updates.status = status;
      if (status === "active") {
        updates.deleted_at = null;
        updates.deleted_by = null;
      }
    }
  }

  // Self can clear must_change_password only (after changing their password)
  if (isSelf && must_change_password === false) {
    updates.must_change_password = false;
  }

  const { error } = await admin.from("profiles").update(updates).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Keep app_metadata in sync so middleware can enforce must_change_password
  // without a DB query on every request.
  if (must_change_password !== undefined && "must_change_password" in updates) {
    await admin.auth.admin.updateUserById(id, {
      app_metadata: { must_change_password: updates.must_change_password ? true : null },
    });
  }

  return NextResponse.json({ message: "User updated" });
}

// DELETE /api/users/[id] — soft-delete or permanent delete
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

  // Cannot delete someone with strictly higher privilege
  const { data: target } = await admin
    .from("profiles")
    .select("status, role:roles(tier)")
    .eq("id", id)
    .single();

  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const targetTier = (target.role as unknown as { tier: number }).tier;
  if (targetTier < currentUser.role.tier) {
    return NextResponse.json(
      { error: "You cannot delete users with higher privileges than you" },
      { status: 403 }
    );
  }

  const url = new URL(request.url);
  const permanent = url.searchParams.get("permanent") === "true";

  if (permanent) {
    if (target.status !== "inactive") {
      return NextResponse.json(
        { error: "User must be deactivated before permanent deletion" },
        { status: 400 }
      );
    }
    const { error: authError } = await admin.auth.admin.deleteUser(id);
    if (authError) return NextResponse.json({ error: authError.message }, { status: 500 });
    return NextResponse.json({ message: "User permanently deleted" });
  }

  const { error } = await admin.from("profiles").update({
    status: "inactive",
    deleted_at: new Date().toISOString(),
    deleted_by: currentUser.id,
  }).eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ message: "User deactivated" });
}
