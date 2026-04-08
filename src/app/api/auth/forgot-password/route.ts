import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/auth/forgot-password
 * Body: { email: string }
 *
 * Checks allow_password_change before sending a reset email.
 * Returns { contact_manager: true } instead of sending email when:
 *   - User is not found
 *   - allow_password_change is false
 *   - Email send fails
 *
 * Never reveals whether an email exists (returns contact_manager in all failure cases).
 */
export async function POST(request: Request) {
  const { email } = await request.json();

  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Look up the user profile by email
  const { data: profile } = await admin
    .from("profiles")
    .select("id, allow_password_change")
    .eq("email", email.toLowerCase().trim())
    .eq("status", "active")
    .is("deleted_at", null)
    .single();

  // If not found or password change is not allowed, tell them to contact manager
  if (!profile || profile.allow_password_change === false) {
    return NextResponse.json({ contact_manager: true });
  }

  // Build redirect URL from the incoming request origin
  const origin     = request.headers.get("origin") ?? "http://localhost:3000";
  const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent("/account/settings?tab=security")}`;

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo,
  });

  if (error) {
    // Email send failed — show contact manager message
    return NextResponse.json({ contact_manager: true });
  }

  return NextResponse.json({ sent: true });
}
