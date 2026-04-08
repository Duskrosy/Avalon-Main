import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isManagerOrAbove } from "@/lib/permissions";

/**
 * POST /api/users/[id]/signout
 *
 * Forces the target user out of all sessions by setting a `force_logout_at`
 * timestamp in their auth.users app_metadata. The middleware detects this on
 * the target user's next request, revokes their session via admin.signOut
 * (using the session token that middleware already has), clears the flag, and
 * redirects them to /login.
 *
 * This approach works on every GoTrue version because it never relies on the
 * undocumented /admin/users/:id/sessions endpoint.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const currentUser = await getCurrentUser(supabase);

  if (!currentUser || !isManagerOrAbove(currentUser)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (id === currentUser.id) {
    return NextResponse.json({ error: "You cannot force sign out yourself" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Check target exists and privilege level
  const { data: target } = await admin
    .from("profiles")
    .select("role:roles(tier)")
    .eq("id", id)
    .single();

  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const targetTier = (target.role as unknown as { tier: number }).tier;
  if (targetTier < currentUser.role.tier) {
    return NextResponse.json(
      { error: "You cannot sign out users with higher privileges than you" },
      { status: 403 }
    );
  }

  // Stamp the user's app_metadata so middleware can detect and act on it
  const { error } = await admin.auth.admin.updateUserById(id, {
    app_metadata: { force_logout_at: Date.now() },
  });

  if (error) {
    console.error("[signout] updateUserById failed:", error.message);
    return NextResponse.json({ error: "Failed to flag user for sign-out" }, { status: 500 });
  }

  return NextResponse.json({ message: "User will be signed out on their next request." });
}
