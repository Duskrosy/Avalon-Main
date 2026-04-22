import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { exchangeCodeForTokens, fetchTikTokUserInfo } from "@/lib/tiktok/client";

// GET /api/tiktok/callback
//
// TikTok redirects here after the user authorises the app.
// Exchanges the code for tokens, fetches the user's display name,
// and updates the smm_group_platforms row (platform_id was passed as `state`).

function contentUrl(appUrl: string, params: Record<string, string>): string {
  const u = new URL(`${appUrl}/creatives/settings`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code       = searchParams.get("code");
  const state      = searchParams.get("state");   // platform_id
  const errorCode  = searchParams.get("error");
  const appUrl     = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin;

  if (errorCode) {
    console.warn("[tiktok/callback] user denied or error:", errorCode);
    return NextResponse.redirect(contentUrl(appUrl, { tiktok: "error", reason: errorCode }));
  }

  if (!code || !state) {
    return NextResponse.redirect(contentUrl(appUrl, { tiktok: "error", reason: "missing_code" }));
  }

  const platformId = state;
  const redirectUri = `${appUrl}/api/tiktok/callback`;

  try {
    const tokens    = await exchangeCodeForTokens(code, redirectUri);
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
    const userInfo  = await fetchTikTokUserInfo(tokens.access_token);

    const admin = createAdminClient();
    const { error: dbErr } = await admin
      .from("smm_group_platforms")
      .update({
        page_id:          tokens.open_id,
        page_name:        userInfo.display_name,
        handle:           userInfo.display_name,
        access_token:     tokens.access_token,
        refresh_token:    tokens.refresh_token,
        token_expires_at: expiresAt,
        is_active:        true,
      })
      .eq("id", platformId);

    if (dbErr) throw new Error(dbErr.message);

    console.info(`[tiktok/callback] connected @${userInfo.display_name} to platform ${platformId}`);
    return NextResponse.redirect(contentUrl(appUrl, { tiktok: "connected", name: userInfo.display_name }));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "OAuth failed";
    console.error("[tiktok/callback]", msg);
    return NextResponse.redirect(contentUrl(appUrl, { tiktok: "error", reason: msg }));
  }
}
