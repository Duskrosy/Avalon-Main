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

  if (!currentUser || !isManagerOrAbove(currentUser)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { first_name, last_name, department_id, role_id, birthday, phone, status } = body;

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
  if (first_name !== undefined) updates.first_name = first_name;
  if (last_name !== undefined) updates.last_name = last_name;
  if (department_id !== undefined) updates.department_id = department_id;
  if (role_id !== undefined) updates.role_id = role_id;
  if (birthday !== undefined) updates.birthday = birthday || null;
  if (phone !== undefined) updates.phone = phone || null;
  if (status !== undefined && isOps(currentUser)) updates.status = status;

  const { error } = await admin.from("profiles").update(updates).eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: "User updated" });
}

// DELETE /api/users/[id] — soft-delete (deactivate) a user
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);

  if (!currentUser || !isOps(currentUser)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (id === currentUser.id) {
    return NextResponse.json({ error: "You cannot deactivate yourself" }, { status: 400 });
  }

  const admin = createAdminClient();

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
