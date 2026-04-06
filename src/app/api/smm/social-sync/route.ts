import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isOps } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
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
async function syncFacebook(pageId: string, token: string, date: string) {
  const since = date;
  const until = dayAfter(date);
  // page_post_engagements replaces deprecated page_engaged_users in Graph API v19+
  const metrics = "page_impressions,page_impressions_unique,page_post_engagements";
  const url = `${META_BASE}/${pageId}/insights?metric=${metrics}&period=day&since=${since}&until=${until}&access_token=${token}`;

  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(json.error?.message ?? "Facebook API error");

  const getValue = (name: string): number => {
    const metric = (json.data ?? []).find((d: { name: string }) => d.name === name);
    // Meta returns two values (since→day, day→until); we want the first (the requested day)
    return metric?.values?.[0]?.value ?? 0;
  };

  // Total follower count — separate call
  const fanRes = await fetch(`${META_BASE}/${pageId}?fields=fan_count&access_token=${token}`);
  const fanJson = await fanRes.json();
  const follower_count: number | null = fanJson.fan_count ?? null;

  return {
    impressions:        getValue("page_impressions"),
    reach:              getValue("page_impressions_unique"),
    engagements:        getValue("page_post_engagements"),
    follower_count,
    video_plays:        0,
    video_plays_3s:     0,
    avg_play_time_secs: 0,
  };
}

// ─── Instagram Business Insights ───────────────────────────────────────────────
async function syncInstagram(igUserId: string, token: string, date: string) {
  const since = date;
  const until = dayAfter(date);
  // impressions + reach + accounts_engaged are the stable v21.0 day-period metrics
  const metrics = "impressions,reach,accounts_engaged";
  const url = `${META_BASE}/${igUserId}/insights?metric=${metrics}&period=day&since=${since}&until=${until}&access_token=${token}`;

  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(json.error?.message ?? "Instagram API error");

  const getValue = (name: string): number => {
    const metric = (json.data ?? []).find((d: { name: string }) => d.name === name);
    return metric?.values?.[0]?.value ?? 0;
  };

  // Follower count
  const profRes = await fetch(`${META_BASE}/${igUserId}?fields=followers_count&access_token=${token}`);
  const profJson = await profRes.json();
  const follower_count: number | null = profJson.followers_count ?? null;

  return {
    impressions:        getValue("impressions"),
    reach:              getValue("reach"),
    engagements:        getValue("accounts_engaged"),
    follower_count,
    video_plays:        0,
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
      .select("id, platform, page_id, access_token, is_active")
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
    .select("id, platform, page_id, access_token, is_active")
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
  platform: { id: string; platform: string; page_id: string | null; access_token: string | null; is_active: boolean },
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

  if (!metaPlatforms.includes(platform.platform) && platform.platform !== "youtube") {
    return {
      ok: false,
      needs_manual: true,
      error: `Auto-sync for ${platform.platform} is not yet available. Please enter data manually.`,
    };
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

    return { ok: true, synced_date: syncDate, data_source: "api", data: row };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Sync failed";
    return { ok: false, needs_manual: true, error: message };
  }
}
