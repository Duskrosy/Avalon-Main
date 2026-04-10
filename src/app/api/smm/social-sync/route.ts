import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import {
  fetchTikTokUserInfo,
  fetchTikTokVideoList,
  fetchTikTokVideoStats,
} from "@/lib/tiktok/client";
import { getValidTikTokToken } from "@/lib/tiktok/server";
import { z } from "zod";

const socialSyncSchema = z.object({
  platform_id: z.string().uuid().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD").optional(),
});

const META_BASE = "https://graph.facebook.com/v21.0";

function isCronRequest(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  return req.headers.get("authorization") === `Bearer ${cronSecret}`;
}

function dayAfter(date: string): string {
  const d = new Date(date);
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

// ─── Facebook Page Insights ────────────────────────────────────────────────────
// Note: page_impressions + page_fans deprecated for New Pages Experience accounts.
// Using page_impressions_unique (unique reach) for both impressions and reach,
// page_post_engagements for engagements, fan_count from page fields for followers.
async function syncFacebook(pageId: string, token: string, date: string) {
  const since = date;
  const until = dayAfter(date);

  // Request each metric individually so one failure doesn't kill the whole call
  async function fetchMetric(metric: string): Promise<number> {
    const url = `${META_BASE}/${pageId}/insights/${metric}?period=day&since=${since}&until=${until}&access_token=${token}`;
    const res = await fetch(url);
    const json = await res.json();
    if (!res.ok || json.error) return 0;
    return json.data?.[0]?.values?.[0]?.value ?? 0;
  }

  const [reach, engagements, pageViews] = await Promise.all([
    fetchMetric("page_impressions_unique"),
    fetchMetric("page_post_engagements"),
    fetchMetric("page_views_total"),
  ]);

  // Follower count from page fields (fan_count is reliable across all page types)
  const fanRes = await fetch(`${META_BASE}/${pageId}?fields=fan_count,followers_count&access_token=${token}`);
  const fanJson = await fanRes.json();
  const follower_count: number | null = fanJson.followers_count ?? fanJson.fan_count ?? null;

  return {
    impressions:        reach,   // page_impressions deprecated for NPE pages; unique reach is best proxy
    reach,
    engagements,
    follower_count,
    video_plays:        pageViews, // page_views_total as proxy for video context
    video_plays_3s:     0,
    avg_play_time_secs: 0,
  };
}

// ─── Instagram Business Insights ───────────────────────────────────────────────
// v21.0: impressions removed (use views), accounts_engaged needs metric_type=total_value
// pageId may be a Facebook Page ID — auto-resolve to the linked Instagram Business Account ID.
async function syncInstagram(pageId: string, token: string, date: string) {
  const igUserId = await resolveInstagramUserId(pageId, token);
  const since = date;
  const until = dayAfter(date);

  // Standard day-period metrics
  async function fetchMetric(metric: string): Promise<number> {
    const url = `${META_BASE}/${igUserId}/insights/${metric}?period=day&since=${since}&until=${until}&access_token=${token}`;
    const res = await fetch(url);
    const json = await res.json();
    if (!res.ok || json.error) return 0;
    return json.data?.[0]?.values?.[0]?.value ?? 0;
  }

  // total_value metrics need metric_type=total_value param
  async function fetchTotalMetric(metric: string): Promise<number> {
    const url = `${META_BASE}/${igUserId}/insights?metric=${metric}&metric_type=total_value&period=day&since=${since}&until=${until}&access_token=${token}`;
    const res = await fetch(url);
    const json = await res.json();
    if (!res.ok || json.error) return 0;
    return json.data?.[0]?.total_value?.value ?? 0;
  }

  const [reach, views, totalInteractions, accountsEngaged] = await Promise.all([
    fetchMetric("reach"),
    fetchMetric("views"),              // replaces deprecated impressions
    fetchMetric("total_interactions"), // likes + comments + shares + saves combined
    fetchTotalMetric("accounts_engaged"),
  ]);

  // Follower count from profile fields (more reliable than follower_count metric)
  const profRes = await fetch(`${META_BASE}/${igUserId}?fields=followers_count&access_token=${token}`);
  const profJson = await profRes.json();
  const follower_count: number | null = profJson.followers_count ?? null;

  return {
    impressions:        views,
    reach,
    engagements:        totalInteractions || accountsEngaged,
    follower_count,
    video_plays:        views,
    video_plays_3s:     0,
    avg_play_time_secs: 0,
  };
}

// ─── YouTube Channel Statistics ───────────────────────────────────────────────
async function syncYouTube(channelId: string, date: string) {
  // date param unused — YouTube Data API only provides lifetime stats, not per-day
  void date;

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error("YOUTUBE_API_KEY not set in environment variables.");

  const url = `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${channelId}&key=${apiKey}`;
  const res = await fetch(url);
  const json = await res.json();

  if (!res.ok || json.error) throw new Error(json.error?.message ?? "YouTube API error");

  const stats = json.items?.[0]?.statistics;
  if (!stats) throw new Error(`YouTube channel not found for ID: ${channelId}`);

  return {
    impressions:        0,                                        // requires YouTube Analytics API (OAuth)
    reach:              parseInt(stats.viewCount    ?? "0", 10), // lifetime total views as reach proxy
    engagements:        0,
    follower_count:     parseInt(stats.subscriberCount ?? "0", 10),
    video_plays:        0,
    video_plays_3s:     0,
    avg_play_time_secs: 0,
  };
}

// ─── Resolve Instagram Business Account ID ────────────────────────────────────
// The page_id stored in smm_group_platforms for Instagram is sometimes a
// Facebook Page ID (not an Instagram Business Account User ID). These are
// different IDs. This helper resolves the correct IG User ID from either.
async function resolveInstagramUserId(pageId: string, token: string): Promise<string> {
  try {
    const res = await fetch(
      `${META_BASE}/${pageId}?fields=instagram_business_account&access_token=${token}`
    );
    const json = await res.json();
    if (json.instagram_business_account?.id) {
      console.info(`[social-sync] Resolved IG account: ${pageId} → ${json.instagram_business_account.id}`);
      return json.instagram_business_account.id;
    }
  } catch {
    // fall through — assume pageId is already an Instagram User ID
  }
  return pageId;
}

// ─── TikTok account-level stats ──────────────────────────────────────────────
// Display API only provides follower_count at account level — impressions,
// reach, and engagements are not available without Business Partner API access.
async function syncTikTokAccount(accessToken: string) {
  const userInfo = await fetchTikTokUserInfo(accessToken);
  return {
    impressions:        0,
    reach:              0,
    engagements:        0,
    follower_count:     userInfo.follower_count ?? null,
    video_plays:        0,
    video_plays_3s:     0,
    avg_play_time_secs: 0,
  };
}

// ─── Individual Post Stats Sync ───────────────────────────────────────────────
// Fetches recent posts and upserts individual stats into smm_top_posts.
// Non-fatal: errors are logged but do not fail the parent sync.
async function syncPosts(
  platformType: string,
  pageId: string,
  token: string,
  platformId: string,
  admin: ReturnType<typeof createAdminClient>
): Promise<void> {
  const today = new Date().toISOString().split("T")[0];

  if (platformType === "facebook") {
    // Fetch recent posts including engagement counts directly on the post object.
    // reactions/comments/shares are always available regardless of page type (NPE or classic).
    // post_impressions_unique via the insights API is deprecated for New Pages Experience
    // and silently returns 0 — so we use it as a best-effort reach fallback only.
    const postsUrl =
      `${META_BASE}/${pageId}/posts` +
      `?fields=id,message,created_time,full_picture,permalink_url` +
      `,reactions.summary(true),comments.summary(true),shares` +
      `&limit=20&access_token=${token}`;
    const postsRes = await fetch(postsUrl);
    const postsJson = await postsRes.json();
    if (!postsRes.ok || postsJson.error) {
      console.warn("[social-sync] FB posts fetch failed:", postsJson.error?.message ?? postsRes.status);
      return;
    }

    const posts: Array<{
      id: string;
      message?: string;
      created_time?: string;
      full_picture?: string;
      permalink_url?: string;
      reactions?: { summary?: { total_count?: number } };
      comments?:  { summary?: { total_count?: number } };
      shares?:    { count?: number };
    }> = postsJson.data ?? [];

    if (posts.length === 0) return;

    // Best-effort reach via insights API (works for classic pages, returns 0 for NPE)
    const fbReach = async (postId: string): Promise<number> => {
      try {
        const res  = await fetch(`${META_BASE}/${postId}/insights?metric=post_impressions_unique&period=lifetime&access_token=${token}`);
        const json = await res.json();
        if (!res.ok || json.error) return 0;
        const entry = (json.data ?? []).find((d: { name: string }) => d.name === "post_impressions_unique");
        return entry?.values?.[0]?.value ?? 0;
      } catch {
        return 0;
      }
    };

    const rows = await Promise.all(
      posts.map(async (post) => {
        // Engagements = reactions + comments + shares (always reliable, no insights API needed)
        const engagements =
          (post.reactions?.summary?.total_count ?? 0) +
          (post.comments?.summary?.total_count  ?? 0) +
          (post.shares?.count                   ?? 0);

        const reach = await fbReach(post.id);

        return {
          platform_id:        platformId,
          post_external_id:   post.id,
          post_url:           post.permalink_url ?? null,
          thumbnail_url:      post.full_picture  ?? null,
          caption_preview:    post.message ? post.message.slice(0, 120) : null,
          post_type:          post.full_picture ? "image" : "video",
          published_at:       post.created_time  ?? null,
          impressions:        reach,
          reach,
          engagements,
          video_plays:        0,
          avg_play_time_secs: null,
          metric_date:        today,
        };
      })
    );

    const { error } = await admin
      .from("smm_top_posts")
      .upsert(rows, { onConflict: "platform_id,post_external_id" });

    if (error) throw new Error(`FB smm_top_posts upsert: ${error.message}`);

  } else if (platformType === "instagram") {
    // Resolve Instagram Business Account User ID.
    // page_id may be a Facebook Page ID — auto-resolve the linked IG account.
    const igUserId = await resolveInstagramUserId(pageId, token);

    // Fetch recent media
    const mediaUrl =
      `${META_BASE}/${igUserId}/media` +
      `?fields=id,caption,timestamp,media_type,thumbnail_url,media_url,permalink` +
      `&limit=20&access_token=${token}`;
    const mediaRes = await fetch(mediaUrl);
    const mediaJson = await mediaRes.json();
    if (!mediaRes.ok || mediaJson.error) {
      console.warn("[social-sync] IG media fetch failed:", mediaJson.error?.message ?? mediaRes.status);
      return;
    }

    const mediaItems: Array<{
      id: string;
      caption?: string;
      timestamp?: string;
      media_type?: string;
      thumbnail_url?: string;
      media_url?: string;
      permalink?: string;
    }> = mediaJson.data ?? [];

    if (mediaItems.length === 0) return;

    // Helper — defined outside the map callback to avoid strict-mode hoisting issues
    const igMediaType = (t: string | undefined): string => {
      if (t === "VIDEO")          return "video";
      if (t === "CAROUSEL_ALBUM") return "carousel";
      if (t === "REELS")          return "reel";
      return "image";
    };

    // Fetch a single insight metric for one media item.
    // Returns 0 on any error so one bad metric never blocks the rest.
    // impressions is deprecated in v22 — use views for video, reach for images.
    const igMetric = async (mediaId: string, metric: string): Promise<number> => {
      try {
        const res  = await fetch(`${META_BASE}/${mediaId}/insights?metric=${metric}&access_token=${token}`);
        const json = await res.json();
        if (!res.ok || json.error) return 0;
        const entry = (json.data ?? []).find((d: { name: string }) => d.name === metric);
        return entry?.values?.[0]?.value ?? 0;
      } catch {
        return 0;
      }
    };

    const rows = await Promise.all(
      mediaItems.map(async (item) => {
        const postType = igMediaType(item.media_type);
        const isVideo  = postType === "video" || postType === "reel";

        const [reach, views, engagements, video_plays] = await Promise.all([
          igMetric(item.id, "reach"),
          isVideo ? igMetric(item.id, "views") : igMetric(item.id, "reach"),
          igMetric(item.id, "total_interactions"),
          isVideo ? igMetric(item.id, "plays") : Promise.resolve(0),
        ]);

        return {
          platform_id:        platformId,
          post_external_id:   item.id,
          post_url:           item.permalink          ?? null,
          thumbnail_url:      isVideo
                                ? (item.thumbnail_url ?? item.media_url ?? null)
                                : (item.media_url     ?? null),
          caption_preview:    item.caption ? item.caption.slice(0, 120) : null,
          post_type:          postType,
          published_at:       item.timestamp          ?? null,
          impressions:        views,
          reach,
          engagements,
          video_plays,
          avg_play_time_secs: null,
          metric_date:        today,
        };
      })
    );

    const { error } = await admin
      .from("smm_top_posts")
      .upsert(rows, { onConflict: "platform_id,post_external_id" });

    if (error) throw new Error(`IG smm_top_posts upsert: ${error.message}`);

  } else if (platformType === "youtube") {
    // YouTube Data API v3 — fetch recent channel uploads and their stats.
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
      console.warn("[social-sync] YOUTUBE_API_KEY not set — skipping YouTube post sync");
      return;
    }

    try {
      // Step 1: Get the uploads playlist ID for the channel
      const channelRes = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${pageId}&key=${apiKey}`
      );
      const channelJson = await channelRes.json();
      if (!channelRes.ok || channelJson.error) {
        console.warn("[social-sync] YT channel fetch failed:", channelJson.error?.message ?? channelRes.status);
        return;
      }

      const uploadsPlaylistId =
        channelJson.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
      if (!uploadsPlaylistId) {
        console.warn("[social-sync] YT uploads playlist not found for channel:", pageId);
        return;
      }

      // Step 2: Fetch the 20 most recent videos from the uploads playlist
      const playlistRes = await fetch(
        `https://www.googleapis.com/youtube/v3/playlistItems` +
        `?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=20&key=${apiKey}`
      );
      const playlistJson = await playlistRes.json();
      if (!playlistRes.ok || playlistJson.error) {
        console.warn("[social-sync] YT playlist fetch failed:", playlistJson.error?.message ?? playlistRes.status);
        return;
      }

      const playlistItems: Array<{
        snippet: {
          title?: string;
          publishedAt?: string;
          thumbnails?: { medium?: { url?: string } };
          resourceId?: { videoId?: string };
        };
      }> = playlistJson.items ?? [];

      if (playlistItems.length === 0) return;

      // Step 3: Batch-fetch statistics for all video IDs
      const videoIds = playlistItems
        .map((i) => i.snippet.resourceId?.videoId)
        .filter(Boolean)
        .join(",");

      const statsRes = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${videoIds}&key=${apiKey}`
      );
      const statsJson = await statsRes.json();
      const statsMap: Record<string, { viewCount?: string; likeCount?: string; commentCount?: string }> = {};
      for (const item of statsJson.items ?? []) {
        statsMap[item.id] = item.statistics;
      }

      const rows = playlistItems
        .map((item) => {
          const videoId = item.snippet.resourceId?.videoId;
          if (!videoId) return null;
          const stats = statsMap[videoId] ?? {};
          const views = parseInt(stats.viewCount ?? "0", 10);
          const likes = parseInt(stats.likeCount ?? "0", 10);

          return {
            platform_id:        platformId,
            post_external_id:   videoId,
            post_url:           `https://www.youtube.com/watch?v=${videoId}`,
            thumbnail_url:      item.snippet.thumbnails?.medium?.url ?? null,
            caption_preview:    item.snippet.title ? item.snippet.title.slice(0, 120) : null,
            post_type:          "video" as const,
            published_at:       item.snippet.publishedAt ?? null,
            impressions:        0,   // requires YouTube Analytics API (OAuth) — not available via Data API
            reach:              views,
            engagements:        likes,
            video_plays:        views,
            avg_play_time_secs: null,
            metric_date:        today,
          };
        })
        .filter(Boolean);

      if (rows.length === 0) return;

      const { error } = await admin
        .from("smm_top_posts")
        .upsert(rows, { onConflict: "platform_id,post_external_id" });

      if (error) throw new Error(`YT smm_top_posts upsert: ${error.message}`);
    } catch (ytErr) {
      console.warn("[social-sync] YT post sync failed:", ytErr instanceof Error ? ytErr.message : ytErr);
    }
  } else if (platformType === "tiktok") {
    // Two-call pattern required by Display API v2:
    //   1. /v2/video/list/ (paginated) → discover new video IDs + cover images
    //   2. /v2/video/query/ (batched ≤20) → fresh engagement stats
    //
    // Sandbox note: video.list returns inconsistent results (0–9 videos per call).
    // To work around this, we also re-fetch stats for all video IDs already stored
    // in smm_top_posts, so known videos are always kept up-to-date.
    // No inner try/catch — errors propagate to syncOnePlatform so post_sync_error is populated.
    {
      type Stub  = Awaited<ReturnType<typeof fetchTikTokVideoList>>["videos"][number];
      type Stats = Awaited<ReturnType<typeof fetchTikTokVideoStats>>[number];

      // ── 1. Paginate video.list to discover new videos ──────────────────────
      const newStubs: Stub[] = [];
      let cursor   = 0;
      let has_more = true;
      for (let page = 0; page < 10 && has_more; page++) {
        const result = await fetchTikTokVideoList(token, 20, cursor);
        newStubs.push(...result.videos);
        has_more = result.has_more;
        cursor   = result.cursor;
        if (!result.videos.length) break;
      }
      console.info(`[social-sync] TikTok video.list returned ${newStubs.length} stubs`);

      // ── 2. Load IDs we already have in the DB ─────────────────────────────
      const { data: existingRows } = await admin
        .from("smm_top_posts")
        .select("post_external_id, thumbnail_url, caption_preview, published_at")
        .eq("platform_id", platformId);

      const existingMap: Record<string, { thumbnail_url: string | null; caption_preview: string | null; published_at: string | null }> =
        Object.fromEntries((existingRows ?? []).map((r) => [r.post_external_id, r]));

      // Merge: new stubs take priority; fill gaps with existing DB rows
      const stubMap: Record<string, Stub> = Object.fromEntries(newStubs.map((v) => [v.id, v]));
      const allIds = Array.from(new Set([
        ...newStubs.map((v) => v.id),
        ...(existingRows ?? []).map((r) => r.post_external_id),
      ]));

      if (!allIds.length) {
        console.info("[social-sync] TikTok: no videos found (new or existing)");
        return;
      }

      // ── 3. Fetch fresh stats for ALL known IDs in batches of 20 ───────────
      // Inline the API call using minimal fields — matches what the debug endpoint
      // confirmed works. fetchTikTokVideoStats requests extra fields that may
      // cause sandbox to return empty data.
      const statsMap: Record<string, Stats> = {};
      for (let i = 0; i < allIds.length; i += 20) {
        const batch = allIds.slice(i, i + 20);
        const res   = await fetch(
          "https://open.tiktokapis.com/v2/video/query/?fields=id,title,cover_image_url,like_count,comment_count,share_count,view_count,create_time",
          {
            method:  "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body:    JSON.stringify({ filters: { video_ids: batch } }),
            cache:   "no-store",
          }
        );
        const json = await res.json() as { data?: { videos?: Stats[] }; error?: { code?: string; message?: string } };
        if (!res.ok) throw new Error(`TikTok video.query HTTP ${res.status}`);
        if (json.error?.code && json.error.code !== "ok") {
          throw new Error(`TikTok video.query error: ${json.error.message ?? json.error.code}`);
        }
        const videos = json.data?.videos ?? [];
        console.info(`[social-sync] TikTok video.query batch got ${videos.length} stats for ids: ${batch.join(",")}`);
        for (const s of videos) statsMap[s.id] = s;
      }

      // ── 4. Build upsert rows ───────────────────────────────────────────────
      // safeInt: coerces TikTok API values to clean JS integers.
      // TikTok sometimes returns counts as JSON strings ("4493" not 4493).
      // Number() handles both; Math.round avoids float insertion errors.
      const safeInt = (v: unknown): number => {
        const n = Math.round(Number(v));
        return isFinite(n) ? n : 0;
      };

      // safeStr: strips null bytes and other control chars that PostgreSQL text rejects.
      const safeStr = (v: unknown, maxLen = 120): string | null => {
        if (v == null) return null;
        // eslint-disable-next-line no-control-regex
        const s = String(v).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").slice(0, maxLen);
        return s || null;
      };

      const rows = allIds.map((id) => {
        const stub        = stubMap[id];
        const stats       = statsMap[id];
        const existing    = existingMap[id];

        // Coerce to numbers first — TikTok sandbox may return counts as strings
        const likes    = safeInt((stats as Record<string, unknown>)?.like_count);
        const comments = safeInt((stats as Record<string, unknown>)?.comment_count);
        const shares   = safeInt((stats as Record<string, unknown>)?.share_count);
        const views    = safeInt((stats as Record<string, unknown>)?.view_count);
        const engagements = likes + comments + shares;

        // create_time is a Unix timestamp — handle both number and string forms
        const rawTime =
          (stub as Record<string, unknown>)?.create_time ??
          (stats as Record<string, unknown>)?.create_time;
        const publishedAt = rawTime
          ? new Date(Number(rawTime) * 1000).toISOString()
          : (existing?.published_at ?? null);

        const thumbUrl =
          safeStr((stats as Record<string, unknown>)?.cover_image_url) ??
          safeStr((stub  as Record<string, unknown>)?.cover_image_url) ??
          (existing?.thumbnail_url ?? null);

        const captionRaw =
          (stats as Record<string, unknown>)?.title ??
          (stub  as Record<string, unknown>)?.title ??
          existing?.caption_preview ??
          "";

        return {
          platform_id:        platformId,
          post_external_id:   String(id),
          post_url:           `https://www.tiktok.com/video/${id}`,
          thumbnail_url:      thumbUrl,
          caption_preview:    safeStr(captionRaw),
          post_type:          "video",
          published_at:       publishedAt,
          impressions:        views,
          reach:              views,
          engagements,
          video_plays:        views,
          avg_play_time_secs: null,
          metric_date:        today,
        };
      });

      // Log first row so we can diagnose type issues in server logs
      if (rows.length > 0) {
        console.info("[social-sync] TikTok first upsert row:", JSON.stringify(rows[0]));
      }

      const { error } = await admin
        .from("smm_top_posts")
        .upsert(rows, { onConflict: "platform_id,post_external_id" });

      if (error) {
        const detail = [
          error.message,
          error.code    ? `code=${error.code}`       : null,
          error.details ? `details=${error.details}`  : null,
          error.hint    ? `hint=${error.hint}`        : null,
        ].filter(Boolean).join(" | ");
        throw new Error(`TikTok smm_top_posts upsert: ${detail}`);
      }
      console.info(`[social-sync] TikTok upserted ${rows.length} posts`);
    }
  }
}

// ─── POST /api/smm/social-sync ─────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const fromCron = isCronRequest(req);

  if (!fromCron) {
    const supabase = await createClient();
    const user = await getCurrentUser(supabase);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const ops = isOps(user);
    if (!ops && user.department_id) {
      const { data: dept } = await supabase
        .from("departments")
        .select("slug")
        .eq("id", user.department_id)
        .maybeSingle();
      if (!["creatives", "marketing", "ad-ops"].includes(dept?.slug ?? "")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }
    }
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = socialSyncSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const { platform_id, date } = parsed.data;

  // Default sync target: yesterday
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const syncDate = date ?? yesterday.toISOString().split("T")[0];

  const admin = createAdminClient();

  // ── Fetch platform row ──────────────────────────────────────────────────────
  if (!platform_id) {
    // Cron mode: sync all active platforms
    const { data: allPlatforms } = await admin
      .from("smm_group_platforms")
      .select("id, platform, page_id, access_token, refresh_token, token_expires_at, is_active")
      .eq("is_active", true);

    const results = await Promise.allSettled(
      (allPlatforms ?? []).map((p) =>
        syncOnePlatform(admin, p, syncDate)
      )
    );

    const summary = results.map((r, i) => ({
      platform_id: allPlatforms?.[i]?.id,
      ok: r.status === "fulfilled" && r.value.ok,
      error: r.status === "rejected" ? String(r.reason) : (r.value as { error?: string }).error,
    }));

    return NextResponse.json({ ok: true, synced_date: syncDate, results: summary });
  }

  const { data: platform, error: platErr } = await admin
    .from("smm_group_platforms")
    .select("id, platform, page_id, access_token, refresh_token, token_expires_at, is_active")
    .eq("id", platform_id)
    .single();

  if (platErr || !platform) {
    return NextResponse.json({ ok: false, needs_manual: true, error: "Platform not found" }, { status: 404 });
  }

  const result = await syncOnePlatform(admin, platform, syncDate);
  return NextResponse.json(result);
}

// ─── Core sync logic for a single platform ────────────────────────────────────
async function syncOnePlatform(
  admin: ReturnType<typeof createAdminClient>,
  platform: {
    id: string;
    platform: string;
    page_id: string | null;
    access_token: string | null;
    refresh_token?: string | null;
    token_expires_at?: string | null;
    is_active: boolean;
  },
  syncDate: string
) {
  if (!platform.is_active) {
    return { ok: false, needs_manual: false, error: "Platform is inactive" };
  }

  const pageId = platform.page_id;
  if (!pageId) {
    return { ok: false, needs_manual: true, error: "No page ID configured for this platform. Add it in Content → ⚙ Groups." };
  }

  // Resolve token: per-platform override → global env var
  const token = platform.access_token ?? process.env.META_ACCESS_TOKEN ?? null;

  // Platforms that use the Meta token
  const metaPlatforms = ["facebook", "instagram"];

  if (metaPlatforms.includes(platform.platform) && !token) {
    return {
      ok: false,
      needs_manual: true,
      error: "No access token configured. Add META_ACCESS_TOKEN to your environment variables, or set a per-platform token in ⚙ Groups.",
    };
  }

  if (platform.platform === "youtube") {
    if (!process.env.YOUTUBE_API_KEY) {
      return { ok: false, needs_manual: true, error: "YOUTUBE_API_KEY not configured." };
    }
    if (!pageId) {
      return { ok: false, needs_manual: true, error: "No channel ID configured. Add it in Content → ⚙ Groups." };
    }
    // fall through to try block
  }

  if (!metaPlatforms.includes(platform.platform) && platform.platform !== "youtube" && platform.platform !== "tiktok") {
    return {
      ok: false,
      needs_manual: true,
      error: `Auto-sync for ${platform.platform} is not yet available. Please enter data manually.`,
    };
  }

  // TikTok: validate token before continuing
  let tiktokToken: string | null = null;
  if (platform.platform === "tiktok") {
    if (!platform.access_token) {
      return { ok: false, needs_manual: true, error: "TikTok not connected. Connect via Settings → ⚙ Groups → TikTok." };
    }
    try {
      tiktokToken = await getValidTikTokToken(platform, admin);
    } catch (err) {
      return { ok: false, needs_manual: true, error: err instanceof Error ? err.message : "TikTok token error" };
    }
  }

  try {
    let metrics: {
      impressions: number;
      reach: number;
      engagements: number;
      follower_count: number | null;
      video_plays: number;
      video_plays_3s: number;
      avg_play_time_secs: number;
    };

    if (platform.platform === "facebook") {
      metrics = await syncFacebook(pageId, token!, syncDate);
    } else if (platform.platform === "instagram") {
      metrics = await syncInstagram(pageId, token!, syncDate);
    } else if (platform.platform === "youtube") {
      metrics = await syncYouTube(pageId, syncDate);
    } else if (platform.platform === "tiktok") {
      metrics = await syncTikTokAccount(tiktokToken!);
    } else {
      metrics = await syncInstagram(pageId, token!, syncDate);
    }

    // Compute follower_growth delta vs. previous day
    let follower_growth: number | null = null;
    if (metrics.follower_count != null) {
      const { data: prevRow } = await admin
        .from("smm_analytics")
        .select("follower_count")
        .eq("platform_id", platform.id)
        .lt("metric_date", syncDate)
        .order("metric_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (prevRow?.follower_count != null) {
        follower_growth = metrics.follower_count - prevRow.follower_count;
      }
    }

    const { data: row, error: upsertErr } = await admin
      .from("smm_analytics")
      .upsert(
        {
          platform_id:        platform.id,
          metric_date:        syncDate,
          ...metrics,
          follower_growth,
          data_source:        "api",
          last_synced_at:     new Date().toISOString(),
        },
        { onConflict: "platform_id,metric_date" }
      )
      .select("*")
      .single();

    if (upsertErr) throw new Error(upsertErr.message);

    // ── Post-level stats (Facebook, Instagram, YouTube, TikTok) ──────────────
    let postSyncError: string | null = null;
    if (["facebook", "instagram", "youtube", "tiktok"].includes(platform.platform)) {
      const postToken = platform.platform === "tiktok" ? tiktokToken! : (token ?? "");
      try {
        await syncPosts(platform.platform, pageId, postToken, platform.id, admin);
      } catch (postErr: unknown) {
        // Non-fatal: page-level analytics already written
        postSyncError = postErr instanceof Error ? postErr.message : String(postErr);
        console.warn(`[social-sync] post sync failed for platform ${platform.id}:`, postSyncError);
      }
    }

    return { ok: true, synced_date: syncDate, data_source: "api", data: row, post_sync_error: postSyncError };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Sync failed";
    return { ok: false, needs_manual: true, error: message };
  }
}
