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
    .select(`*, department:departments(id, name, slug), role:roles(id, name, slug, tier)`)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("first_name");

  if (!isOps(currentUser) && isManagerOrAbove(currentUser)) {
    query = query.eq("department_id", currentUser.department_id);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
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

  const {
    email, password, first_name, last_name, department_id, role_id, birthday, phone,
    must_change_password = true,
    require_mfa          = true,
    allow_password_change = true,
  } = body as typeof body & {
    must_change_password?: boolean;
    require_mfa?: boolean;
    allow_password_change?: boolean;
  };

  if (!isOps(currentUser) && department_id !== currentUser.department_id) {
    return NextResponse.json({ error: "You can only create users in your own department" }, { status: 403 });
  }

  const admin = createAdminClient();

  // Validate the role tier
  const { data: targetRole } = await admin.from("roles").select("tier").eq("id", role_id).single();

  if (targetRole) {
    // Cannot assign a role with strictly higher privilege than yourself
    if (targetRole.tier < currentUser.role.tier) {
      return NextResponse.json({ error: "You cannot assign a role with higher privileges than your own" }, { status: 403 });
    }
    // Non-OPS cannot assign OPS-tier roles
    if (!isOps(currentUser) && targetRole.tier <= 1) {
      return NextResponse.json({ error: "You cannot assign OPS-level roles" }, { status: 403 });
    }
    // Require MFA must be on if role is OPS+
    if (targetRole.tier <= 1 && !require_mfa) {
      return NextResponse.json({ error: "MFA is required for OPS-level roles" }, { status: 400 });
    }
  }

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError) return NextResponse.json({ error: authError.message }, { status: 400 });

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
    must_change_password,
    require_mfa,
    allow_password_change,
  });

  if (profileError) {
    await admin.auth.admin.deleteUser(authData.user.id);
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  // Sync must_change_password to app_metadata so middleware + login can enforce it
  if (must_change_password) {
    await admin.auth.admin.updateUserById(authData.user.id, {
      app_metadata: { must_change_password: true },
    });
  }

  return NextResponse.json({ message: "User created successfully", user_id: authData.user.id });
}
