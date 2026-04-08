import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/auth/forgot-password
 * Body: { email: string }
 *
 * Always attempts to send a reset email and always returns { sent: true }.
 * Supabase silently no-ops for unknown addresses, so we never leak whether
 * an email exists. The login page shows a static disclaimer covering the
 * "no email / not allowed" cases.
 */
export async function POST(request: Request) {
  const { email } = await request.json();

  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const origin     = request.headers.get("origin") ?? "http://localhost:3000";
  const redirectTo = `${origin}/auth/confirm?next=${encodeURIComponent("/account/settings?tab=security")}`;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { error } = await supabase.auth.resetPasswordForEmail(
    email.toLowerCase().trim(),
    { redirectTo }
  );

  if (error) {
    console.error("[forgot-password] resetPasswordForEmail error:", error.message);
  }

  // Always return sent — don't reveal whether the address exists or failed
  return NextResponse.json({ sent: true });
}
