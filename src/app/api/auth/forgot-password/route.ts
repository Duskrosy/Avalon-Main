import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/auth/forgot-password
 * Body: { email: string }
 */
export async function POST(request: Request) {
  const { email } = await request.json();

  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const clean = email.toLowerCase().trim();
  const admin = createAdminClient();

  // Only block if allow_password_change is explicitly false
  try {
    const { data: profile } = await admin
      .from("profiles")
      .select("allow_password_change")
      .eq("email", clean)
      .is("deleted_at", null)
      .maybeSingle();

    if (profile && profile.allow_password_change === false) {
      return NextResponse.json({ contact_manager: true });
    }
  } catch (err) {
    console.warn("[forgot-password] allow_password_change check skipped:", err);
  }

  const origin     = request.headers.get("origin") ?? "http://localhost:3000";
  const redirectTo = `${origin}/auth/confirm?next=${encodeURIComponent("/account/settings?tab=security")}`;

  // Use a plain anon client — resetPasswordForEmail is a public auth endpoint
  // and behaves incorrectly when called with the service role key.
  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { error } = await anonClient.auth.resetPasswordForEmail(clean, { redirectTo });

  if (error) {
    console.error("[forgot-password] resetPasswordForEmail error:", error.message, error);
    // Return the raw message in development so we can debug, contact_manager in prod
    if (process.env.NODE_ENV !== "production") {
      return NextResponse.json({ debug_error: error.message }, { status: 500 });
    }
    return NextResponse.json({ contact_manager: true });
  }

  return NextResponse.json({ sent: true });
}
