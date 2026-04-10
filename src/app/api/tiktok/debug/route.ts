// Temporary debug endpoint — remove after TikTok diagnosis.
// GET /api/tiktok/debug?platform_id=<uuid>

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
    const today = new Date().toISOString().split("T")[0];

    // 1. Video list
    const videoRes = await fetch("https://open.tiktokapis.com/v2/video/list/?fields=id,title,cover_image_url,create_time", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ max_count: 3 }),
      cache: "no-store",
    });
    const videoJson = await videoRes.json();
    const stubs: Array<{ id: string; title?: string; cover_image_url?: string; create_time?: number }> =
      videoJson?.data?.videos ?? [];

    // 2. Try video.query for stats
    let queryResult: unknown = "skipped (no stubs)";
    if (stubs.length > 0) {
      const statsRes = await fetch("https://open.tiktokapis.com/v2/video/query/?fields=id,like_count,comment_count,share_count,view_count", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ filters: { video_ids: stubs.map((v) => v.id) } }),
        cache: "no-store",
      });
      queryResult = await statsRes.json();
    }

    // 3. Attempt upsert with one stub row and capture the exact error
    let upsertResult: unknown = "skipped (no stubs)";
    if (stubs.length > 0) {
      const testRow = {
        platform_id:        platformId,
        post_external_id:   stubs[0].id,
        post_url:           `https://www.tiktok.com/video/${stubs[0].id}`,
        thumbnail_url:      stubs[0].cover_image_url ?? null,
        caption_preview:    stubs[0].title?.slice(0, 120) ?? null,
        post_type:          "video",
        published_at:       stubs[0].create_time ? new Date(stubs[0].create_time * 1000).toISOString() : null,
        impressions:        0,
        reach:              0,
        engagements:        0,
        video_plays:        0,
        avg_play_time_secs: null,
        metric_date:        today,
      };
      const { data: upsertData, error: upsertErr } = await admin
        .from("smm_top_posts")
        .upsert(testRow, { onConflict: "platform_id,post_external_id" })
        .select();
      upsertResult = upsertErr
        ? { error: upsertErr.message, code: upsertErr.code, details: upsertErr.details, hint: upsertErr.hint }
        : { ok: true, row: upsertData };
    }

    // 4. Read back what's in smm_top_posts for this platform
    const { data: existingPosts, error: readErr } = await admin
      .from("smm_top_posts")
      .select("id, post_external_id, caption_preview, metric_date, impressions, engagements")
      .eq("platform_id", platformId)
      .limit(5);

    return NextResponse.json({
      platform_id:       platformId,
      stubs_returned:    stubs.length,
      video_list_status: videoRes.status,
      video_query_raw:   queryResult,
      upsert_result:     upsertResult,
      existing_posts:    existingPosts ?? [],
      read_error:        readErr?.message ?? null,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
