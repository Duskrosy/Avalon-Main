import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";

const META_BASE = "https://graph.facebook.com/v21.0";

// Debug endpoint — traces exactly what happens during post sync for a platform
// GET /api/smm/debug-posts?platform_id=<uuid>
// OPS only
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user || !isOps(user)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const platformId = searchParams.get("platform_id");

  if (!platformId) {
    return NextResponse.json({ error: "platform_id required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // ── Fetch platform row ──────────────────────────────────────────────────────
  const { data: platform, error: platErr } = await admin
    .from("smm_group_platforms")
    .select("id, platform, page_id, page_name, access_token, is_active")
    .eq("id", platformId)
    .single();

  if (platErr || !platform) {
    return NextResponse.json({ error: "Platform not found", detail: platErr?.message }, { status: 404 });
  }

  const report: Record<string, unknown> = {
    platform_type: platform.platform,
    page_id_stored: platform.page_id,
    page_name: platform.page_name,
    is_active: platform.is_active,
    has_token: !!(platform.access_token ?? process.env.META_ACCESS_TOKEN),
  };

  // ── Check existing smm_top_posts for this platform ──────────────────────────
  const { data: existingPosts, count } = await admin
    .from("smm_top_posts")
    .select("id, post_external_id, published_at, impressions, reach", { count: "exact" })
    .eq("platform_id", platformId)
    .order("published_at", { ascending: false })
    .limit(3);

  report.existing_top_posts_count = count ?? 0;
  report.existing_top_posts_sample = existingPosts ?? [];

  const pageId = platform.page_id;
  if (!pageId) {
    return NextResponse.json({ ...report, error: "No page_id set for this platform" });
  }

  // ── Instagram-specific diagnostics ─────────────────────────────────────────
  if (platform.platform === "instagram") {
    const token = platform.access_token ?? process.env.META_ACCESS_TOKEN ?? null;
    if (!token) {
      return NextResponse.json({ ...report, error: "No Meta access token" });
    }

    // Step 1: try to resolve IG Business Account ID from Facebook Page ID
    const resolveRes = await fetch(
      `${META_BASE}/${pageId}?fields=instagram_business_account,name&access_token=${token}`
    );
    const resolveJson = await resolveRes.json();
    report.step1_resolve_ig_from_fb_page = resolveJson;

    const igUserId: string = resolveJson.instagram_business_account?.id ?? pageId;
    report.resolved_ig_user_id = igUserId;
    report.id_was_resolved = igUserId !== pageId;

    // Step 2: fetch profile fields using resolved IG User ID
    const profRes = await fetch(
      `${META_BASE}/${igUserId}?fields=id,name,username,followers_count,media_count&access_token=${token}`
    );
    report.step2_ig_profile = await profRes.json();

    // Step 3: fetch media using resolved IG User ID
    const mediaUrl =
      `${META_BASE}/${igUserId}/media` +
      `?fields=id,caption,timestamp,media_type,thumbnail_url,media_url,permalink` +
      `&limit=5&access_token=${token}`;
    const mediaRes = await fetch(mediaUrl);
    const mediaJson = await mediaRes.json();
    report.step3_ig_media_fetch = {
      ok: mediaRes.ok,
      status: mediaRes.status,
      error: mediaJson.error ?? null,
      post_count: (mediaJson.data ?? []).length,
      sample: (mediaJson.data ?? []).slice(0, 2).map((m: Record<string, unknown>) => ({
        id: m.id,
        media_type: m.media_type,
        timestamp: m.timestamp,
        permalink: m.permalink,
      })),
    };

    // Step 4: test insights on first media item (if any)
    const firstMedia = mediaJson.data?.[0];
    if (firstMedia?.id) {
      const insRes = await fetch(
        `${META_BASE}/${firstMedia.id}/insights?metric=reach,impressions,total_interactions&access_token=${token}`
      );
      const insJson = await insRes.json();
      report.step4_first_post_insights = {
        ok: insRes.ok,
        status: insRes.status,
        error: insJson.error ?? null,
        data: insJson.data ?? null,
      };

      // Also test plays (video only) to see if it errors
      if (firstMedia.media_type === "VIDEO" || firstMedia.media_type === "REELS") {
        const playsRes = await fetch(
          `${META_BASE}/${firstMedia.id}/insights?metric=plays&access_token=${token}`
        );
        const playsJson = await playsRes.json();
        report.step4b_plays_insight = {
          ok: playsRes.ok,
          error: playsJson.error ?? null,
          data: playsJson.data ?? null,
        };
      }
    }

  // ── YouTube-specific diagnostics ────────────────────────────────────────────
  } else if (platform.platform === "youtube") {
    const apiKey = process.env.YOUTUBE_API_KEY ?? null;
    report.youtube_api_key_set = !!apiKey;

    if (!apiKey) {
      return NextResponse.json({ ...report, error: "YOUTUBE_API_KEY not set in environment variables" });
    }

    // Step 1: fetch channel info + contentDetails (uploads playlist ID)
    const channelUrl =
      `https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails,statistics&id=${pageId}&key=${apiKey}`;
    const channelRes = await fetch(channelUrl);
    const channelJson = await channelRes.json();
    report.step1_channel_lookup = {
      ok: channelRes.ok,
      status: channelRes.status,
      error: channelJson.error ?? null,
      items_count: (channelJson.items ?? []).length,
      channel_title: channelJson.items?.[0]?.snippet?.title ?? null,
      subscriber_count: channelJson.items?.[0]?.statistics?.subscriberCount ?? null,
      uploads_playlist_id: channelJson.items?.[0]?.contentDetails?.relatedPlaylists?.uploads ?? null,
    };

    const uploadsPlaylistId = channelJson.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!uploadsPlaylistId) {
      return NextResponse.json({
        ...report,
        error: "Could not find uploads playlist. Check that the Channel ID is correct (starts with UC...).",
      });
    }

    // Step 2: fetch recent videos from uploads playlist
    const playlistUrl =
      `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=5&key=${apiKey}`;
    const playlistRes = await fetch(playlistUrl);
    const playlistJson = await playlistRes.json();
    const videoIds = (playlistJson.items ?? [])
      .map((i: Record<string, unknown>) => (i.snippet as Record<string, unknown> | undefined)?.resourceId)
      .filter(Boolean)
      .map((r: unknown) => (r as Record<string, unknown>).videoId)
      .filter(Boolean);

    report.step2_playlist_items = {
      ok: playlistRes.ok,
      status: playlistRes.status,
      error: playlistJson.error ?? null,
      items_count: (playlistJson.items ?? []).length,
      video_ids: videoIds,
      sample: (playlistJson.items ?? []).slice(0, 2).map((i: Record<string, unknown>) => ({
        title: (i.snippet as Record<string, unknown> | undefined)?.title,
        publishedAt: (i.snippet as Record<string, unknown> | undefined)?.publishedAt,
        videoId: ((i.snippet as Record<string, unknown> | undefined)?.resourceId as Record<string, unknown> | undefined)?.videoId,
      })),
    };

    // Step 3: fetch video statistics
    if (videoIds.length > 0) {
      const statsUrl = `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${videoIds.join(",")}&key=${apiKey}`;
      const statsRes = await fetch(statsUrl);
      const statsJson = await statsRes.json();
      report.step3_video_stats = {
        ok: statsRes.ok,
        status: statsRes.status,
        error: statsJson.error ?? null,
        sample: (statsJson.items ?? []).slice(0, 2).map((v: Record<string, unknown>) => ({
          id: v.id,
          statistics: v.statistics,
        })),
      };
    }

  // ── Facebook post-level debug ────────────────────────────────────────────────
  } else if (platform.platform === "facebook") {
    const token = platform.access_token ?? process.env.META_ACCESS_TOKEN ?? null;
    if (!token) {
      return NextResponse.json({ ...report, error: "No Meta access token" });
    }

    // Fetch recent posts
    const postsUrl =
      `${META_BASE}/${pageId}/posts?fields=id,message,created_time,full_picture,permalink_url&limit=3&access_token=${token}`;
    const postsRes = await fetch(postsUrl);
    const postsJson = await postsRes.json();
    report.fb_posts_fetch = {
      ok: postsRes.ok,
      status: postsRes.status,
      error: postsJson.error ?? null,
      post_count: (postsJson.data ?? []).length,
    };

    // Test insights on first post using NEW query-param format
    const firstPost = postsJson.data?.[0];
    if (firstPost?.id) {
      const insUrl =
        `${META_BASE}/${firstPost.id}/insights?metric=post_impressions_unique,post_engaged_users&period=lifetime&access_token=${token}`;
      const insRes = await fetch(insUrl);
      const insJson = await insRes.json();
      report.fb_first_post_insights = {
        post_id: firstPost.id,
        created_time: firstPost.created_time,
        ok: insRes.ok,
        status: insRes.status,
        error: insJson.error ?? null,
        data: insJson.data ?? null,
      };
    }
  }

  return NextResponse.json(report, { status: 200 });
}
