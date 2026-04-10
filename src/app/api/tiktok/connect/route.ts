import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isManagerOrAbove } from "@/lib/permissions";
import { getTikTokAuthUrl } from "@/lib/tiktok/client";

// GET /api/tiktok/connect?platform_id=<uuid>
//
// Initiates the TikTok OAuth flow. The platform record must already exist in
// smm_group_platforms (create it first from the settings panel). The platform_id
// is passed as OAuth `state` so the callback knows which row to update.

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return NextResponse.redirect(new URL("/login", req.url));
  if (!isManagerOrAbove(user)) {
    return NextResponse.json({ error: "Managers or above only" }, { status: 403 });
  }

  const platformId = req.nextUrl.searchParams.get("platform_id");
  if (!platformId) return NextResponse.json({ error: "platform_id required" }, { status: 400 });

  if (!process.env.TIKTOK_CLIENT_KEY || !process.env.TIKTOK_CLIENT_SECRET) {
    return NextResponse.json(
      { error: "TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET must be set in environment variables" },
      { status: 500 },
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin;
  const redirectUri = `${appUrl}/api/tiktok/callback`;

  const authUrl = getTikTokAuthUrl(platformId, redirectUri);
  return NextResponse.redirect(authUrl);
}
