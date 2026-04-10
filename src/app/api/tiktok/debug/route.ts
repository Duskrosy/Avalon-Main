// Temporary debug endpoint — remove after TikTok diagnosis.
// GET /api/tiktok/debug?platform_id=<uuid>
// Returns the raw TikTok API responses so we can see what's failing.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { getValidTikTokToken } from "@/lib/tiktok/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user || !isOps(user)) {
    return NextResponse.json({ error: "Ops only" }, { status: 403 });
  }

  const platformId = req.nextUrl.searchParams.get("platform_id");
  if (!platformId) return NextResponse.json({ error: "platform_id required" }, { status: 400 });

  const admin = createAdminClient();
  const { data: platform } = await admin
    .from("smm_group_platforms")
    .select("id, platform, page_id, access_token, refresh_token, token_expires_at")
    .eq("id", platformId)
    .single();

  if (!platform) return NextResponse.json({ error: "Platform not found" }, { status: 404 });
  if (platform.platform !== "tiktok") return NextResponse.json({ error: "Not a TikTok platform" }, { status: 400 });

  try {
    const token = await getValidTikTokToken(platform, admin);

    // 1. Raw user info call
    const userRes = await fetch("https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,follower_count,video_count", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const userJson = await userRes.json();

    // 2. Raw video list call
    const videoRes = await fetch("https://open.tiktokapis.com/v2/video/list/?fields=id,title,cover_image_url,create_time", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ max_count: 10 }),
      cache: "no-store",
    });
    const videoJson = await videoRes.json();

    return NextResponse.json({
      platform_id: platformId,
      page_id: platform.page_id,
      token_expires_at: platform.token_expires_at,
      user_info_status: userRes.status,
      user_info: userJson,
      video_list_status: videoRes.status,
      video_list: videoJson,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
