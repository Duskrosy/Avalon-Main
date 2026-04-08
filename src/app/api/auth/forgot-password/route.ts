import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/auth/forgot-password
 * Body: { email: string }
 *
 * Sends a Supabase password-reset email.
 * Returns { contact_manager: true } only when allow_password_change is
 * explicitly false for that user. Every other failure path still sends
 * the email (or lets Supabase silently no-op for unknown addresses).
 */
export async function POST(request: Request) {
  const { email } = await request.json();

  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const clean = email.toLowerCase().trim();
  const admin = createAdminClient();

  // Only block the email if allow_password_change is explicitly false.
  // Use a try/catch so a missing column (migration 00028 not yet run) never
  // prevents the reset from going out.
  try {
    const { data: profile } = await admin
      .from("profiles")
      .select("allow_password_change")
      .eq("email", clean)
      .is("deleted_at", null)
      .maybeSingle(); // won't error on zero rows

    if (profile && profile.allow_password_change === false) {
      return NextResponse.json({ contact_manager: true });
    }
  } catch (err) {
    // Table column missing or DB error — don't block the reset
    console.warn("[forgot-password] allow_password_change check failed, proceeding:", err);
  }

  const origin     = request.headers.get("origin") ?? "http://localhost:3000";
  const redirectTo = `${origin}/auth/confirm?next=${encodeURIComponent("/account/settings?tab=security")}`;

  const { error } = await admin.auth.resetPasswordForEmail(clean, { redirectTo });

  if (error) {
    console.error("[forgot-password] resetPasswordForEmail failed:", error.message);
    // Don't expose the reason — just tell them to contact their manager
    return NextResponse.json({ contact_manager: true });
  }

  return NextResponse.json({ sent: true });
}
