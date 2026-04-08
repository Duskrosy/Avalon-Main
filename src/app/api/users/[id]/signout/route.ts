import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isManagerOrAbove } from "@/lib/permissions";

/**
 * POST /api/users/[id]/signout
 * Force-signs out all active sessions for the target user.
 * Requires: manager or above, and cannot target a user with higher privilege.
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

  // Call GoTrue admin logout endpoint — invalidates all refresh tokens globally
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const res = await fetch(
    `${supabaseUrl}/auth/v1/admin/users/${id}/logout?scope=global`,
    {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    }
  );

  if (!res.ok) {
    const body = await res.text();
    return NextResponse.json(
      { error: `Sign out failed: ${body}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: "User signed out" });
}
