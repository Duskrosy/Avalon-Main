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
    .select("id, post_external_id, published_at, impressions, reach, engagements", { count: "exact" })
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
      `&limit=3&access_token=${token}`;
    const mediaRes = await fetch(mediaUrl);
    const mediaJson = await mediaRes.json();
    const mediaItems = mediaJson.data ?? [];
    report.step3_ig_media_fetch = {
      ok: mediaRes.ok,
      status: mediaRes.status,
      error: mediaJson.error ?? null,
      post_count: mediaItems.length,
      sample: mediaItems.slice(0, 2).map((m: Record<string, unknown>) => ({
        id: m.id,
        media_type: m.media_type,
        timestamp: m.timestamp,
        permalink: m.permalink,
      })),
    };

    // Step 4: test each metric individually on first media item — show RAW response
    const firstMedia = mediaItems[0];
    if (firstMedia?.id) {
      const metricsToTest = ["reach", "views", "total_interactions", "plays", "saved"];
      const insightResults: Record<string, unknown> = {};

      for (const metric of metricsToTest) {
        const insRes = await fetch(
          `${META_BASE}/${firstMedia.id}/insights?metric=${metric}&access_token=${token}`
        );
        const insJson = await insRes.json();
        insightResults[metric] = {
          ok: insRes.ok,
          status: insRes.status,
          error: insJson.error?.message ?? null,
          // Show both possible value shapes — some API versions use total_value, others use values[]
          values_array: insJson.data?.[0]?.values ?? null,
          total_value:  insJson.data?.[0]?.total_value ?? null,
          raw_data_0:   insJson.data?.[0] ?? null,
        };
      }

      report.step4_per_metric_insights = {
        media_id: firstMedia.id,
        media_type: firstMedia.media_type,
        results: insightResults,
      };

      // Step 5: attempt a real upsert of this one post to test DB writes
      const testRow = {
        platform_id:        platformId,
        post_external_id:   `DEBUG_TEST_${firstMedia.id}`,
        post_url:           firstMedia.permalink ?? null,
        thumbnail_url:      firstMedia.media_url ?? null,
        caption_preview:    "DEBUG TEST ROW — safe to delete",
        post_type:          "image",
        published_at:       firstMedia.timestamp ?? null,
        impressions:        0,
        reach:              0,
        engagements:        0,
        video_plays:        0,
        avg_play_time_secs: null,
        metric_date:        new Date().toISOString().split("T")[0],
      };

      const { error: upsertErr } = await admin
        .from("smm_top_posts")
        .upsert(testRow, { onConflict: "platform_id,post_external_id" });

      report.step5_test_upsert = {
        ok: !upsertErr,
        error: upsertErr?.message ?? null,
        hint: upsertErr?.hint ?? null,
        details: upsertErr?.details ?? null,
      };

      // Clean up test row immediately
      if (!upsertErr) {
        await admin
          .from("smm_top_posts")
          .delete()
          .eq("platform_id", platformId)
          .eq("post_external_id", `DEBUG_TEST_${firstMedia.id}`);
        (report.step5_test_upsert as Record<string, unknown>).cleaned_up = true;
      }
    }

  // ── YouTube-specific diagnostics ────────────────────────────────────────────
  } else if (platform.platform === "youtube") {
    const apiKey = process.env.YOUTUBE_API_KEY ?? null;
    report.youtube_api_key_set = !!apiKey;

    if (!apiKey) {
      return NextResponse.json({ ...report, error: "YOUTUBE_API_KEY not set in environment variables" });
    }

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

    const playlistUrl =
      `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=5&key=${apiKey}`;
    const playlistRes = await fetch(playlistUrl);
    const playlistJson = await playlistRes.json();
    const videoIds = (playlistJson.items ?? [])
      .map((i: Record<string, unknown>) => ((i.snippet as Record<string, unknown>)?.resourceId as Record<string, unknown>)?.videoId)
      .filter(Boolean);

    report.step2_playlist_items = {
      ok: playlistRes.ok,
      error: playlistJson.error ?? null,
      items_count: (playlistJson.items ?? []).length,
      video_ids: videoIds,
    };

    if (videoIds.length > 0) {
      const statsUrl = `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${videoIds.join(",")}&key=${apiKey}`;
      const statsRes = await fetch(statsUrl);
      const statsJson = await statsRes.json();
      report.step3_video_stats = {
        ok: statsRes.ok,
        error: statsJson.error ?? null,
        sample: (statsJson.items ?? []).slice(0, 2).map((v: Record<string, unknown>) => ({
          id: v.id,
          statistics: v.statistics,
        })),
      };

      // Step 4: test DB upsert for first YouTube video
      const firstVideoId = videoIds[0] as string;
      const testRow = {
        platform_id:        platformId,
        post_external_id:   `DEBUG_TEST_${firstVideoId}`,
        post_url:           `https://www.youtube.com/watch?v=${firstVideoId}`,
        thumbnail_url:      null,
        caption_preview:    "DEBUG TEST ROW — safe to delete",
        post_type:          "video",
        published_at:       null,
        impressions:        0,
        reach:              0,
        engagements:        0,
        video_plays:        0,
        avg_play_time_secs: null,
        metric_date:        new Date().toISOString().split("T")[0],
      };

      const { error: upsertErr } = await admin
        .from("smm_top_posts")
        .upsert(testRow, { onConflict: "platform_id,post_external_id" });

      report.step4_test_upsert = {
        ok: !upsertErr,
        error: upsertErr?.message ?? null,
        hint: upsertErr?.hint ?? null,
      };

      if (!upsertErr) {
        await admin.from("smm_top_posts").delete()
          .eq("platform_id", platformId)
          .eq("post_external_id", `DEBUG_TEST_${firstVideoId}`);
        (report.step4_test_upsert as Record<string, unknown>).cleaned_up = true;
      }
    }

  // ── Facebook post-level debug ────────────────────────────────────────────────
  } else if (platform.platform === "facebook") {
    const token = platform.access_token ?? process.env.META_ACCESS_TOKEN ?? null;
    if (!token) {
      return NextResponse.json({ ...report, error: "No Meta access token" });
    }

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

    const firstPost = postsJson.data?.[0];
    if (firstPost?.id) {
      // Test both metrics individually with query-param format
      for (const metric of ["post_impressions_unique", "post_engaged_users"]) {
        const insUrl =
          `${META_BASE}/${firstPost.id}/insights?metric=${metric}&period=lifetime&access_token=${token}`;
        const insRes = await fetch(insUrl);
        const insJson = await insRes.json();
        (report as Record<string, unknown>)[`fb_insight_${metric}`] = {
          ok: insRes.ok,
          status: insRes.status,
          error: insJson.error?.message ?? null,
          raw_data_0: insJson.data?.[0] ?? null,
        };
      }
    }
  }

  return NextResponse.json(report, { status: 200 });
}
