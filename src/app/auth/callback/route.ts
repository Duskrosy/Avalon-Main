import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Auth callback — handles Supabase code exchange for:
 *   - Magic link sign-in
 *   - Password reset links
 *
 * Supabase redirects here with ?code=... after the user clicks a magic/reset link.
 * We exchange the code for a session, then redirect to ?next= (default: /).
 */
export async function GET(request: Request) {
  const url  = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  // Redirect to next page (always a relative path for safety)
  const safeNext = next.startsWith("/") ? next : "/";
  return NextResponse.redirect(new URL(safeNext, request.url));
}
