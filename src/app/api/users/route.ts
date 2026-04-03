import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isOps, isManagerOrAbove } from "@/lib/permissions";
import { validateBody } from "@/lib/api/validate";
import { userPostSchema } from "@/lib/api/schemas";

// GET /api/users
export async function GET() {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);

  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let query = supabase
    .from("profiles")
    .select(`
      *,
      department:departments(id, name, slug),
      role:roles(id, name, slug, tier)
    `)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("first_name");

  // Managers (non-OPS) see only their department
  if (!isOps(currentUser) && isManagerOrAbove(currentUser)) {
    query = query.eq("department_id", currentUser.department_id);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ users: data });
}

// POST /api/users — create a new user (manager+ only)
export async function POST(request: Request) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);

  if (!currentUser || !isManagerOrAbove(currentUser)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = await request.json();
  const { data: body, error: validationError } = validateBody(userPostSchema, raw);
  if (validationError) return validationError;

  const { email, password, first_name, last_name, department_id, role_id, birthday, phone } = body;

  // Managers can only create users in their own department
  if (!isOps(currentUser) && department_id !== currentUser.department_id) {
    return NextResponse.json({ error: "You can only create users in your own department" }, { status: 403 });
  }

  // Managers cannot create OPS-tier users (tier <= 1)
  if (!isOps(currentUser)) {
    const { data: targetRole } = await supabase
      .from("roles")
      .select("tier")
      .eq("id", role_id)
      .single();

    if (targetRole && targetRole.tier <= 1) {
      return NextResponse.json({ error: "You cannot assign OPS-level roles" }, { status: 403 });
    }
  }

  const admin = createAdminClient();

  // Create auth user
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 400 });
  }

  // Create profile
  const { error: profileError } = await admin.from("profiles").insert({
    id: authData.user.id,
    email,
    first_name,
    last_name,
    department_id,
    role_id,
    status: "active",
    birthday: birthday || null,
    phone: phone || null,
    created_by: currentUser.id,
  });

  if (profileError) {
    // Rollback: delete the auth user if profile creation fails
    await admin.auth.admin.deleteUser(authData.user.id);
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  return NextResponse.json({ message: "User created successfully", user_id: authData.user.id });
}
