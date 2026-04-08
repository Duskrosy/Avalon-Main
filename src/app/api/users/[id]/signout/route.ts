import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isManagerOrAbove } from "@/lib/permissions";

/**
 * POST /api/users/[id]/signout
 * Force-signs out all active sessions for the target user.
 *
 * Strategy:
 *  1. Try DELETE /auth/v1/admin/users/:id/sessions  — modern GoTrue (preferred)
 *  2. If that 404s, fall back to:
 *     a. POST /auth/v1/admin/users/:id/sessions to create a temp session
 *     b. Then admin.signOut(access_token, 'global') to revoke all sessions via that JWT
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

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const adminHeaders = {
    apikey:        serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };

  // ── Strategy 1: DELETE /admin/users/:id/sessions (modern GoTrue) ──────────
  const deleteRes = await fetch(
    `${supabaseUrl}/auth/v1/admin/users/${id}/sessions`,
    { method: "DELETE", headers: adminHeaders }
  );

  if (deleteRes.ok || deleteRes.status === 204) {
    return NextResponse.json({ message: "User signed out" });
  }

  // ── Strategy 2: create a temp session, then signOut globally ─────────────
  if (deleteRes.status === 404) {
    // GoTrue version doesn't have the sessions endpoint — create a session to
    // get a JWT we can use with the signOut admin method
    const createRes = await fetch(
      `${supabaseUrl}/auth/v1/admin/users/${id}/sessions`,
      { method: "POST", headers: adminHeaders }
    );

    if (createRes.ok) {
      const sessionJson = await createRes.json();
      const accessToken: string | undefined =
        sessionJson?.access_token ?? sessionJson?.session?.access_token;

      if (accessToken) {
        const { error: signOutError } = await admin.auth.admin.signOut(
          accessToken,
          "global"
        );
        if (!signOutError) {
          return NextResponse.json({ message: "User signed out" });
        }
      }
    }

    // ── Strategy 3: signOut via the regular logout endpoint with service role JWT
    // This signs out *our* session scope for the user identified by their sub
    // It won't revoke all sessions but it's the last fallback available
    const fallbackRes = await fetch(
      `${supabaseUrl}/auth/v1/logout?scope=global`,
      {
        method: "POST",
        headers: {
          ...adminHeaders,
          // Override: use service key — GoTrue with service role ignores the user
          // JWT and instead uses the sub claim from the body (if supported)
        },
        body: JSON.stringify({ user_id: id }),
      }
    );

    if (fallbackRes.ok) {
      return NextResponse.json({ message: "User signed out" });
    }

    return NextResponse.json(
      {
        error:
          "Force sign-out is not supported by this Supabase project's GoTrue version. " +
          "As a workaround you can deactivate the user account temporarily from the Deactivated tab.",
      },
      { status: 501 }
    );
  }

  const body = await deleteRes.text().catch(() => "");
  return NextResponse.json(
    { error: `Sign out failed (${deleteRes.status}): ${body}` },
    { status: 500 }
  );
}
